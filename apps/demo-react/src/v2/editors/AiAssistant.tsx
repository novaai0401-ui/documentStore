/**
 * Universal AI assistant for every editor — Word, spreadsheets, slides, text.
 * Grounds answers in the current document, offers format-tailored quick actions
 * (summarize, improve, analyze, generate…), and can insert generated content
 * straight back into the document. Uses the same connection layers as the PDF
 * Ask-AI panel (host hook → in-app key → offline fallback), so it works with no
 * key and no network too.
 */
import { useRef, useState } from 'react';
import { TkxChat, TkxButton, type ChatMessage } from 'tekivex-ui';
import { askAi, loadAiConfig, type AiMessage } from '../ai/aiClient.js';

export interface QuickAction { label: string; prompt: string }

interface Props {
  /** Short kind label, e.g. "Word", "spreadsheet", "slide deck". */
  kind: string;
  getContext: () => string;
  onInsert?: (text: string) => void;
  onClose: () => void;
  quickActions: QuickAction[];
}

let seq = 0;
const id = () => `m${++seq}`;

export function AiAssistant({ kind, getContext, onInsert, onClose, quickActions }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const lastReply = useRef('');

  const system =
    `You are a futuristic AI assistant embedded in a ${kind} editor. Use the document below as context. ` +
    `When the user asks you to write, rewrite, summarize, translate, or generate content, reply with the ` +
    `finished text only — ready to paste into the document — with no preamble. Be concise and high-quality.`;

  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: ChatMessage = { id: id(), role: 'user', content: text };
    setMessages((m) => [...m, userMsg]);
    setLoading(true);
    try {
      const history: AiMessage[] = [...messages, userMsg]
        .filter((m) => m.role !== 'system')
        .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));
      const reply = await askAi({ messages: history, context: getContext(), system, config: loadAiConfig() });
      lastReply.current = reply;
      setMessages((m) => [...m, { id: id(), role: 'assistant', content: reply }]);
    } catch (e) {
      setMessages((m) => [...m, { id: id(), role: 'assistant', content: 'Error: ' + (e instanceof Error ? e.message : String(e)), error: true }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <aside className="ai-dock" aria-label="AI assistant">
      <header className="ai-dock-head">
        <strong>✦ AI · {kind}</strong>
        <button className="ai-dock-close" onClick={onClose} aria-label="Close AI">×</button>
      </header>
      <div className="ai-dock-quick">
        {quickActions.map((a) => (
          <TkxButton key={a.label} variant="outline" size="sm" disabled={loading} onClick={() => send(a.prompt)}>{a.label}</TkxButton>
        ))}
      </div>
      <div className="ai-dock-chat">
        <TkxChat
          messages={messages}
          onSend={send}
          isLoading={loading}
          height="100%"
          placeholder={`Ask anything about this ${kind}…`}
        />
      </div>
      {onInsert && (
        <div className="ai-dock-foot">
          <TkxButton variant="solid" colorScheme="primary" size="sm" disabled={loading || !lastReply.current} onClick={() => lastReply.current && onInsert(lastReply.current)}>Insert last reply into document</TkxButton>
        </div>
      )}
    </aside>
  );
}
