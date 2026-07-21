/**
 * General "Ask AI" chat — chat about anything using the user's own AI key
 * (Anthropic / OpenAI-style, e.g. Groq) or the on-device WebGPU model. Not bound
 * to a document. Built on Tekivex-ui (TkxModal, TkxChat, TkxInput, TkxButton,
 * TkxToggle); askAi handles the provider tiers, so nothing here talks to a server
 * directly beyond the user's configured endpoint.
 */
import { useEffect, useState } from 'react';
import { TkxModal, TkxChat, TkxInput, TkxButton, TkxToggle, TkxSelect, type ChatMessage } from 'tekivex-ui';
import { t, useLang } from '../../i18n.js';
import { askAi, loadAiConfig, saveAiConfig, type AiConfig, type AiMessage } from './aiClient.js';
import { detectLocalCaps } from './local/localGen.js';
import { localAiEnabled, setLocalAiEnabled, initLocalAi } from './local/webllm.js';
import { newChatId, titleFrom, toMarkdown, listConversations, getConversation, saveConversation, deleteConversation, type AiConvoMeta, type AiTurn } from './chatStore.js';
import { downloadBytes } from '../smart/util.js';

const uid = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const GENERAL_SYSTEM = 'You are a helpful, knowledgeable assistant. Answer the user clearly and accurately on any topic. Use markdown when it helps.';

export function AskAiModal({ onClose, onAsk }: { onClose: () => void; onAsk?: import('./aiClient.js').HostAskHook }) {
  const lang = useLang();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [convoId, setConvoId] = useState(() => newChatId());
  const [convos, setConvos] = useState<AiConvoMeta[]>([]);
  const refreshList = () => void listConversations().then(setConvos);
  useEffect(refreshList, []);

  // Persist the session in the browser so a refresh/reopen restores the thread.
  useEffect(() => {
    if (!messages.length) return;
    const turns: AiTurn[] = messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));
    void saveConversation({ id: convoId, title: titleFrom(turns), turns, updatedAt: Date.now() }).then(refreshList);
     
  }, [messages, convoId]);

  const resume = async (id: string) => {
    const c = await getConversation(id);
    if (c) { setConvoId(c.id); setMessages(c.turns.map((t) => ({ id: uid(), role: t.role, content: t.content, timestamp: new Date(c.updatedAt) }))); }
  };
  const newChat = () => { setConvoId(newChatId()); setMessages([]); };
  const exportChat = () => {
    const turns: AiTurn[] = messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));
    if (!turns.length) return;
    const md = toMarkdown({ id: convoId, title: titleFrom(turns), turns, updatedAt: Date.now() });
    downloadBytes(`${titleFrom(turns).replace(/[^a-z0-9]+/gi, '-').slice(0, 32) || 'chat'}.md`, new TextEncoder().encode(md), 'text/markdown');
  };
  const removeChat = () => { void deleteConversation(convoId).then(() => { newChat(); refreshList(); }); };
  const [cfg, setCfg] = useState<AiConfig>(() => loadAiConfig());
  const [localOn, setLocalOn] = useState(localAiEnabled());
  const webgpu = detectLocalCaps().webgpu;
  const configured = !!onAsk || !!(cfg.endpoint && cfg.apiKey) || localOn;
  const [showCfg, setShowCfg] = useState(!configured);
  const [ollamaStatus, setOllamaStatus] = useState<string | null>(null);

  const setConfig = (c: AiConfig) => { setCfg(c); saveAiConfig(c); };

  const send = async (text: string) => {
    const u: ChatMessage = { id: uid(), role: 'user', content: text, timestamp: new Date() };
    const history: AiMessage[] = [...messages, u].map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));
    setMessages((m) => [...m, u]);
    setLoading(true);
    try {
      const reply = await askAi({ messages: history, context: '', system: GENERAL_SYSTEM, config: cfg, onAsk });
      setMessages((m) => [...m, { id: uid(), role: 'assistant', content: reply, timestamp: new Date() }]);
    } catch (e) {
      setMessages((m) => [...m, { id: uid(), role: 'assistant', content: `⚠️ ${e instanceof Error ? e.message : 'Request failed.'}`, error: true, timestamp: new Date() }]);
    } finally { setLoading(false); }
  };

  return (
    <TkxModal isOpen onClose={onClose} title={`✦ ${t('tl_ask_ai', lang)}`} size="lg"
      footer={<TkxButton variant="ghost" size="sm" onClick={() => setShowCfg((s) => !s)}>{showCfg ? t('ai_hide_settings', lang) : `⚙ ${t('ai_settings', lang)}`}</TkxButton>}>
      {showCfg && (
        <div className="askai-cfg">
          {onAsk ? <p className="studio-hint">{t('ai_here', lang)}</p> : (
            <>
              <p className="studio-hint">{t('ai_byok', lang)}</p>
              <div className="askai-presets">
                <span className="askai-presets-label">Quick set-up:</span>
                <button className="askai-preset" title="FREE and fully private — install Ollama from ollama.com on this computer, run a model, and Pyntra talks to it locally. Nothing leaves your machine." onClick={() => {
                  // Suggest a model the device can actually run (rough RAM probe).
                  const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 8;
                  const suggested = mem >= 8 ? 'llama3.2' : 'llama3.2:1b';
                  setConfig({ ...cfg, endpoint: 'http://localhost:11434/v1/chat/completions', apiKey: cfg.apiKey || 'ollama', model: cfg.model || suggested });
                  setOllamaStatus('Checking whether Ollama is running on this computer…');
                  // no-cors: an opaque response means SOMETHING answered on 11434;
                  // a network error means Ollama isn't running (or not installed).
                  fetch('http://localhost:11434/api/tags', { mode: 'no-cors' })
                    .then(() => setOllamaStatus(`✅ Ollama is running — suggested model for this computer: ${suggested}. Run “ollama pull ${suggested}” once if you haven’t.`))
                    .catch(() => setOllamaStatus('❌ Ollama isn’t running yet. Install it free from ollama.com (Windows/Mac/Linux), open it, then press this button again.'));
                }}>🦙 Ollama (free, on this computer)</button>
                <button className="askai-preset" title="Fast free tier — create a key at console.groq.com" onClick={() => setConfig({ ...cfg, endpoint: 'https://api.groq.com/openai/v1/chat/completions', model: cfg.model || 'llama-3.3-70b-versatile' })}>⚡ Groq (free tier)</button>
                <button className="askai-preset" title="LM Studio running on this computer" onClick={() => setConfig({ ...cfg, endpoint: 'http://localhost:1234/v1/chat/completions', apiKey: cfg.apiKey || 'lm-studio' })}>🖥️ LM Studio</button>
              </div>
              {ollamaStatus && <p className="studio-hint">{ollamaStatus}</p>}
              {/^https?:\/\/localhost:11434/.test(cfg.endpoint) && (
                <p className="studio-hint">Ollama tip: install from <strong>ollama.com</strong>, then run <code>ollama pull llama3.2</code>. If the browser can’t reach it, start Ollama with <code>OLLAMA_ORIGINS=*</code> (it stays local-only).</p>
              )}
              <TkxInput label={t('ai_endpoint', lang)} value={cfg.endpoint} placeholder="https://api.groq.com/openai/v1/chat/completions" onChange={(e) => setConfig({ ...cfg, endpoint: e.target.value })} />
              <TkxInput label={t('ai_api_key', lang)} type="password" value={cfg.apiKey} placeholder={t('ai_key_ph', lang)} onChange={(e) => setConfig({ ...cfg, apiKey: e.target.value })} />
              <TkxInput label={t('ai_model', lang)} value={cfg.model} placeholder="llama-3.3-70b-versatile" onChange={(e) => setConfig({ ...cfg, model: e.target.value })} />
              <div className="askai-local">
                <TkxToggle
                  checked={localOn}
                  disabled={!webgpu}
                  label={`${t('ai_local', lang)}${!webgpu ? ` ${t('ai_local_needs', lang)}` : ` ${t('ai_local_note', lang)}`}`}
                  onChange={(v: boolean) => { setLocalOn(v); setLocalAiEnabled(v); if (v) initLocalAi(); }}
                />
              </div>
            </>
          )}
        </div>
      )}
      <div className="askai-bar">
        <TkxSelect
          options={[{ value: '', label: convos.length ? t('ai_resume', lang) : t('ai_no_chats', lang) }, ...convos.map((c) => ({ value: c.id, label: c.title }))]}
          value=""
          placeholder={t('ai_resume', lang)}
          onChange={(v) => { const id = Array.isArray(v) ? v[0] : v; if (id) void resume(id); }}
        />
        <span className="studio-spacer" />
        <TkxButton variant="outline" size="sm" onClick={newChat}>＋ {t('ai_new', lang)}</TkxButton>
        <TkxButton variant="outline" size="sm" disabled={!messages.length} onClick={exportChat}>⤓ {t('ai_save_md', lang)}</TkxButton>
        <TkxButton variant="ghost" size="sm" disabled={!messages.length} onClick={removeChat}>🗑</TkxButton>
      </div>
      <div className="askai-chat">
        <TkxChat messages={messages} onSend={(t) => void send(t)} isLoading={loading} height="100%" placeholder={configured ? t('ai_ask_ph', lang) : t('ai_need_key', lang)} />
      </div>
    </TkxModal>
  );
}
