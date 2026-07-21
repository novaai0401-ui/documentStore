/**
 * Text help via the user's own OpenAI-compatible chat endpoint (bring your own
 * model). Used for résumé bullet rewriting. Request/response shaping is pure and
 * unit-tested; only `generateText` does the network call, straight to the
 * user-configured endpoint — nothing routes through Pyntra.
 */
import type { AiImageConfig } from './aiConfig.js';

export interface ChatMessage { role: 'system' | 'user'; content: string }

/** True when a chat model (and endpoint/key) is configured. */
export function canChat(c: AiImageConfig | undefined | null): c is AiImageConfig {
  return !!c && !!c.endpoint.trim() && !!c.apiKey.trim() && !!(c.chatModel && c.chatModel.trim());
}

export function buildChatRequest(config: AiImageConfig, messages: ChatMessage[]): { url: string; init: RequestInit } {
  const url = config.endpoint.replace(/\/+$/, '') + '/chat/completions';
  return {
    url,
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({ model: config.chatModel || config.model, messages, temperature: 0.6 }),
    },
  };
}

export function parseChatResponse(json: unknown): string {
  const content = (json as { choices?: { message?: { content?: string } }[] })?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('The model returned no text.');
  return content.trim();
}

export async function generateText(config: AiImageConfig, messages: ChatMessage[]): Promise<string> {
  const { url, init } = buildChatRequest(config, messages);
  let res: Response;
  try { res = await fetch(url, init); }
  catch { throw new Error('Could not reach the endpoint. Check the URL and your network.'); }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Text API error ${res.status}${body ? ': ' + body.slice(0, 200) : ''}`);
  }
  return parseChatResponse(await res.json());
}

/** Build the prompt that turns a role into strong, quantified résumé bullets. */
export function bulletPrompt(role: string, company: string, existing: string): ChatMessage[] {
  return [
    { role: 'system', content: 'You are a concise resume writer. Reply ONLY with 3-4 strong, quantified resume bullet points, each on its own line starting with "• ". No preamble, no headings.' },
    { role: 'user', content: `Role: ${role || 'professional'}${company ? ` at ${company}` : ''}.\nExisting notes:\n${existing || '(none)'}\n\nRewrite as impactful, achievement-focused bullets.` },
  ];
}

/** A first-person professional résumé summary from name/title/recent roles. */
export function summaryPrompt(name: string, title: string, roles: string): ChatMessage[] {
  return [
    { role: 'system', content: 'You write concise, first-person professional resume summaries (2-3 sentences). Reply ONLY with the summary text — no preamble, no quotes.' },
    { role: 'user', content: `Name: ${name || 'a professional'}\nTitle: ${title || ''}\nRecent roles:\n${roles || '(none)'}\n\nWrite a punchy 2-3 sentence summary.` },
  ];
}

/** A tailored 3-paragraph cover-letter body (no greeting/sign-off). */
export function letterPrompt(name: string, title: string, company: string, roles: string): ChatMessage[] {
  return [
    { role: 'system', content: 'You write professional, warm cover-letter bodies of 3 short paragraphs. Reply ONLY with the body text, paragraphs separated by a blank line. Do NOT include a greeting or a sign-off.' },
    { role: 'user', content: `Applicant: ${name || 'the applicant'} — ${title || ''}\nApplying to: ${company || 'the company'}\nBackground:\n${roles || '(none)'}\n\nWrite a tailored, specific cover-letter body.` },
  ];
}

/** A cover-letter body tailored to a pasted job description. */
export function jdLetterPrompt(name: string, title: string, company: string, jd: string): ChatMessage[] {
  return [
    { role: 'system', content: 'You write professional cover-letter bodies of 3 short paragraphs, tailored to a specific job description — explicitly matching the applicant to the role\'s key requirements. Reply ONLY with the body text, paragraphs separated by a blank line. No greeting or sign-off.' },
    { role: 'user', content: `Applicant: ${name || 'the applicant'} — ${title || ''}\nCompany: ${company || ''}\n\nJob description:\n${jd}\n\nWrite a tailored cover-letter body that addresses the main requirements.` },
  ];
}

/** A résumé summary tailored to a pasted job description. */
export function jdSummaryPrompt(title: string, roles: string, jd: string): ChatMessage[] {
  return [
    { role: 'system', content: 'You write a concise, first-person résumé summary (2-3 sentences) tailored to a target job. Reply ONLY with the summary text — no preamble, no quotes.' },
    { role: 'user', content: `Title: ${title || ''}\nBackground:\n${roles || '(none)'}\n\nTarget job description:\n${jd}\n\nWrite a 2-3 sentence summary tailored to this job.` },
  ];
}
