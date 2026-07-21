/**
 * Agentic (conversational) document editing.
 *
 * The user types a plain-English instruction — "redact every SSN", "change
 * all 2025 dates to 2026", "remove every email address" — and we turn it
 * into a small set of typed operations, then execute them across the whole
 * document by generating annotations (redactions or white-out+retype). The
 * source PDF is never mutated; everything lands through the incremental save.
 *
 * Two parsers:
 *   • An offline parser handles the common deterministic commands with no
 *     key (redact <pii>, redact "literal", replace A with B).
 *   • When an AI endpoint is configured, the model maps free-form language
 *     to the same op schema for anything the offline parser can't.
 */
import type { Annotation } from '../Annotations.js';
import { askAi, type AiConfig, type HostAskHook } from '../ai/aiClient.js';
import { redactionAnnotation, replacementAnnotations, spanBox, type PageRuns } from './util.js';
import { scanPii, type PiiType } from './pii.js';

export type AgentOp =
  | { op: 'redactPii'; types: PiiType[] }
  | { op: 'redact'; pattern: string; flags?: string }
  | { op: 'replace'; find: string; replaceWith: string; literal?: boolean };

/** One concrete edit the plan will make, with the annotations that realize it.
 *  The UI previews these and applies only the ones the user keeps. */
export interface AgentChange {
  kind: 'redact' | 'replace';
  page: number;
  /** The matched text (redact) or the original line (replace). */
  before: string;
  /** The replacement line, for replace changes. */
  after?: string;
  annotations: Annotation[];
}

export interface AgentPlan {
  changes: AgentChange[];
  /** Human-readable lines describing what each op matched. */
  summary: string[];
  ops: AgentOp[];
}

const PII_WORDS: Array<[RegExp, PiiType]> = [
  [/e-?mails?/i, 'email'],
  [/ssns?|social security/i, 'ssn'],
  [/phones?|telephones?|phone numbers?/i, 'phone'],
  [/credit ?cards?|card numbers?/i, 'credit-card'],
  [/ip addresses?|ip\b/i, 'ip'],
  [/dates?/i, 'date'],
];

const REDACT_VERB = /\b(redact|remove|hide|black ?out|delete|censor|strip)\b/i;

/** Best-effort offline parse. Returns [] when it can't confidently map. */
export function parseCommandOffline(command: string): AgentOp[] {
  const cmd = command.trim();

  // replace / change A with|to B
  const rep = /\b(?:replace|change|swap)\s+["“']?(.+?)["”']?\s+(?:with|to|for)\s+["“']?(.+?)["”']?\s*$/i.exec(cmd);
  if (rep) {
    return [{ op: 'replace', find: rep[1]!.trim(), replaceWith: rep[2]!.trim(), literal: true }];
  }

  if (REDACT_VERB.test(cmd)) {
    // redact "literal phrase"
    const lit = /["“'](.+?)["”']/.exec(cmd);
    if (lit) return [{ op: 'redact', pattern: escapeRe(lit[1]!), flags: 'gi' }];

    // redact all PII / sensitive / personal info
    if (/\b(all )?(pii|sensitive|personal|private)\b/i.test(cmd)) {
      return [{ op: 'redactPii', types: ['email', 'ssn', 'phone', 'credit-card', 'ip'] }];
    }
    // redact <pii type(s)>
    const types = PII_WORDS.filter(([re]) => re.test(cmd)).map(([, t]) => t);
    if (types.length) return [{ op: 'redactPii', types: [...new Set(types)] }];
  }
  return [];
}

const AGENT_SYSTEM = `You translate a user's plain-English PDF editing instruction into a JSON
array of operations. Respond with ONLY the JSON array, no prose. Allowed ops:
{"op":"redactPii","types":[subset of "email","ssn","phone","credit-card","ip","date"]}
{"op":"redact","pattern":"<JS regex source>","flags":"gi"}
{"op":"replace","find":"<text or regex>","replaceWith":"<text>","literal":true|false}
Use redactPii for categories of sensitive data. Use redact for blacking out a
specific word/pattern. Use replace to substitute text. Keep it minimal.`;

/** Parse with the model when offline parsing came up empty. */
export async function parseCommandWithAi(
  command: string,
  config: AiConfig,
  onAsk?: HostAskHook,
): Promise<AgentOp[]> {
  const reply = await askAi({
    messages: [{ role: 'user', content: command }],
    context: '',
    system: AGENT_SYSTEM,
    config,
    onAsk,
  });
  return parseOpsJson(reply);
}

function parseOpsJson(reply: string): AgentOp[] {
  const start = reply.indexOf('[');
  const end = reply.lastIndexOf(']');
  if (start < 0 || end <= start) return [];
  try {
    const arr = JSON.parse(reply.slice(start, end + 1)) as Array<Record<string, unknown>>;
    const out: AgentOp[] = [];
    for (const o of arr) {
      if (o.op === 'redactPii' && Array.isArray(o.types)) {
        out.push({ op: 'redactPii', types: (o.types as string[]).filter(isPiiType) });
      } else if (o.op === 'redact' && typeof o.pattern === 'string') {
        out.push({ op: 'redact', pattern: o.pattern, flags: typeof o.flags === 'string' ? o.flags : 'gi' });
      } else if (o.op === 'replace' && typeof o.find === 'string' && typeof o.replaceWith === 'string') {
        out.push({ op: 'replace', find: o.find, replaceWith: o.replaceWith, literal: o.literal !== false });
      }
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Plan ops across all pages: produce the concrete changes (with their
 * annotations) and a summary, WITHOUT mutating anything. The UI previews the
 * changes and applies the kept subset — so an instruction can never silently
 * edit the document.
 */
export function planOps(pages: PageRuns[], ops: AgentOp[]): AgentPlan {
  const byPage = new Map(pages.map((p) => [p.page, p]));
  const changes: AgentChange[] = [];
  const summary: string[] = [];

  for (const op of ops) {
    if (op.op === 'redactPii') {
      const matches = scanPii(pages, new Set(op.types));
      let count = 0;
      for (const m of matches) {
        const page = byPage.get(m.page);
        const run = page?.runs[m.runIndex];
        if (!page || !run) continue;
        changes.push({
          kind: 'redact',
          page: m.page,
          before: m.value,
          annotations: [redactionAnnotation(page, spanBox(run, m.start, m.end))],
        });
        count++;
      }
      summary.push(`${count} ${op.types.join('/')} match(es) to redact.`);
    } else if (op.op === 'redact') {
      const re = safeRegex(op.pattern, op.flags ?? 'gi');
      let count = 0;
      for (const page of pages) {
        for (const run of page.runs) {
          re.lastIndex = 0;
          let m: RegExpExecArray | null;
          while ((m = re.exec(run.text)) !== null) {
            changes.push({
              kind: 'redact',
              page: page.page,
              before: m[0],
              annotations: [redactionAnnotation(page, spanBox(run, m.index, m.index + m[0].length))],
            });
            count++;
            if (m.index === re.lastIndex) re.lastIndex++;
          }
        }
      }
      summary.push(`${count} occurrence(s) of /${op.pattern}/ to redact.`);
    } else if (op.op === 'replace') {
      const re = op.literal ? new RegExp(escapeRe(op.find), 'g') : safeRegex(op.find, 'g');
      let count = 0;
      for (const page of pages) {
        for (const run of page.runs) {
          if (!re.test(run.text)) continue;
          re.lastIndex = 0;
          const next = run.text.replace(re, op.replaceWith);
          if (next !== run.text) {
            changes.push({
              kind: 'replace',
              page: page.page,
              before: run.text,
              after: next,
              annotations: replacementAnnotations(page, run, next),
            });
            count++;
          }
        }
      }
      summary.push(`"${op.find}" → "${op.replaceWith}" on ${count} line(s).`);
    }
  }
  return { changes, summary, ops };
}

function isPiiType(s: string): s is PiiType {
  return ['email', 'ssn', 'phone', 'credit-card', 'ip', 'date'].includes(s);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Compile a user/AI-supplied regex, falling back to a literal match if the
 *  source is invalid (never throws into the UI). */
function safeRegex(source: string, flags: string): RegExp {
  try {
    return new RegExp(source, flags);
  } catch {
    return new RegExp(escapeRe(source), flags);
  }
}
