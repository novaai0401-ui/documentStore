/**
 * AI image generation — the one place Pyntra talks to a network, and only to
 * the endpoint YOU configure (bring your own model). First run shows a settings
 * form; once configured it generates from a prompt and lets you drop a result onto
 * the design. The privacy trade-off is stated plainly in the UI.
 *
 * The settings form leads with a PROVIDER dropdown (OpenAI, Groq, Together, …)
 * so any OpenAI-compatible key works — not just OpenAI. Picking a provider fills
 * in the endpoint and suggests models; text-only providers (Groq, Mistral, …)
 * hide the image generator and offer text help instead of failing.
 */
import { useEffect, useState } from 'react';
import { TkxButton, TkxInput, TkxSelect } from 'tekivex-ui';
import { type AiImageConfig, getAiImageConfig, setAiImageConfig, clearAiImageConfig, isConfigured } from './aiConfig.js';
import { generateImages, IMAGE_SIZES } from './imageGen.js';
import { AI_PROVIDERS, CUSTOM_PROVIDER_ID, providerById, detectProvider, providerDoesImages } from './providers.js';

const OPENAI = providerById('openai')!;
const BLANK: AiImageConfig = { endpoint: OPENAI.endpoint, apiKey: '', model: OPENAI.images[0]!, chatModel: OPENAI.chats[0]!, provider: 'openai' };

/** Saved config that can be used for something (image gen OR text help). */
function isUsable(c: AiImageConfig | null): c is AiImageConfig {
  if (!c) return false;
  const p = providerById(c.provider);
  const keyless = !!p?.keyless;
  const hasBase = !!c.endpoint.trim() && (keyless || !!c.apiKey.trim());
  if (!hasBase) return false;
  return providerDoesImages(c.provider) ? !!c.model.trim() : !!(c.chatModel && c.chatModel.trim());
}

export function AiImageModal({ onClose, onInsert }: { onClose: () => void; onInsert: (dataUrl: string) => void }) {
  const [config, setConfig] = useState<AiImageConfig | null>(null);
  const [form, setForm] = useState<AiImageConfig>(BLANK);
  const [editing, setEditing] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [size, setSize] = useState(IMAGE_SIZES[0]!);
  const [results, setResults] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getAiImageConfig().then((c) => {
      setConfig(c ?? null);
      if (c) setForm({ ...c, provider: c.provider ?? detectProvider(c.endpoint) });
      else setEditing(true);
    });
  }, []);

  const providerId = form.provider ?? detectProvider(form.endpoint);
  const provider = providerById(providerId) ?? providerById(CUSTOM_PROVIDER_ID)!;
  const doesImages = providerDoesImages(providerId);
  const keyless = !!provider.keyless;

  /** Switch provider: adopt its endpoint and suggested models, keep the key. */
  const pickProvider = (id: string) => {
    const p = providerById(id) ?? providerById(CUSTOM_PROVIDER_ID)!;
    setForm((f) => ({
      ...f,
      provider: id,
      endpoint: id === CUSTOM_PROVIDER_ID ? f.endpoint : p.endpoint,
      model: p.images[0] ?? (id === CUSTOM_PROVIDER_ID ? f.model : ''),
      chatModel: p.chats[0] ?? f.chatModel,
    }));
  };

  const canSave = (() => {
    const hasBase = !!form.endpoint.trim() && (keyless || !!form.apiKey.trim());
    if (!hasBase) return false;
    return doesImages ? !!form.model.trim() : !!(form.chatModel && form.chatModel.trim());
  })();

  const save = async () => { await setAiImageConfig(form); setConfig(form); setEditing(false); };
  const forget = async () => { await clearAiImageConfig(); setConfig(null); setForm(BLANK); setEditing(true); setResults([]); };

  const generate = async () => {
    if (!isConfigured(config) || !prompt.trim()) return;
    setBusy(true); setError(null); setResults([]);
    try { setResults(await generateImages(config, { prompt: prompt.trim(), size })); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const savedDoesImages = config ? providerDoesImages(config.provider) : true;

  return (
    <div className="v2-modal" onClick={onClose}>
      <div className="v2-modal__inner ai-modal" onClick={(e) => e.stopPropagation()}>
        <div className="brand-head">
          <strong>✨ AI image — your model</strong>
          <button className="brand-x" onClick={onClose}>✕</button>
        </div>

        <div className="ai-body">
          {(editing || !isUsable(config)) ? (
            <div className="ai-settings">
              <p className="ai-note">⚠️ This is the only online feature. Your prompt and key are sent <strong>only</strong> to the provider you pick below — Pyntra has no server in between.</p>

              <TkxSelect
                label="Provider"
                value={providerId}
                options={AI_PROVIDERS.map((p) => ({ value: p.id, label: p.label }))}
                onChange={(v) => pickProvider(v as string)}
              />
              {provider.note && <p className="ai-hint">{doesImages ? '🖼️ ' : '💬 '}{provider.note}</p>}

              <TkxInput label="Endpoint (base URL)" value={form.endpoint} placeholder="https://api.openai.com/v1" disabled={providerId !== CUSTOM_PROVIDER_ID} onChange={(e) => setForm({ ...form, endpoint: e.target.value })} />

              {keyless ? (
                <p className="ai-hint">No API key needed — this runs on your own computer.</p>
              ) : (
                <TkxInput label="API key" type="password" value={form.apiKey} placeholder="sk-…" onChange={(e) => setForm({ ...form, apiKey: e.target.value })} />
              )}
              {provider.keyUrl && !keyless && (
                <p className="ai-hint">Get a key: <a href={provider.keyUrl} target="_blank" rel="noreferrer">{new URL(provider.keyUrl).host}</a></p>
              )}

              {doesImages && (
                <>
                  <TkxInput label="Image model" value={form.model} placeholder="gpt-image-1" onChange={(e) => setForm({ ...form, model: e.target.value })} />
                  {provider.images.length > 1 && (
                    <div className="ai-chips">{provider.images.map((m) => (
                      <button key={m} type="button" className={`ai-chip${form.model === m ? ' is-on' : ''}`} onClick={() => setForm({ ...form, model: m })}>{m}</button>
                    ))}</div>
                  )}
                </>
              )}

              <TkxInput label="Text model (captions, ideas, rewrites)" value={form.chatModel ?? ''} placeholder="gpt-4o-mini" onChange={(e) => setForm({ ...form, chatModel: e.target.value })} />
              {provider.chats.length > 1 && (
                <div className="ai-chips">{provider.chats.map((m) => (
                  <button key={m} type="button" className={`ai-chip${form.chatModel === m ? ' is-on' : ''}`} onClick={() => setForm({ ...form, chatModel: m })}>{m}</button>
                ))}</div>
              )}
              {!doesImages && <p className="ai-hint">ℹ️ {provider.label} doesn’t create images — pick <strong>OpenAI</strong> or <strong>Together AI</strong> for that. Your key here powers text help across the app.</p>}

              <div className="brand-actions">
                <TkxButton variant="solid" colorScheme="primary" size="sm" disabled={!canSave} onClick={() => void save()}>Save</TkxButton>
                {isUsable(config) && <TkxButton variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancel</TkxButton>}
              </div>
            </div>
          ) : !savedDoesImages ? (
            <div className="ai-generate">
              <div className="ai-cfg-row">Text help ready · <strong>{config.chatModel}</strong> · {hostOf(config.endpoint)}
                <span className="studio-spacer" />
                <button className="imgstudio-link" onClick={() => { setForm(config); setEditing(true); }}>Settings</button>
                <button className="imgstudio-link" onClick={() => void forget()}>Forget key</button>
              </div>
              <p className="ai-note">✅ {providerById(config.provider)?.label ?? 'This provider'} is set up for <strong>text help</strong> (captions, ideas, rewrites) across the app. It doesn’t generate images. To make images, open Settings and choose <strong>OpenAI</strong> or <strong>Together AI</strong>.</p>
            </div>
          ) : (
            <div className="ai-generate">
              <div className="ai-cfg-row">Using <strong>{config.model}</strong> · {hostOf(config.endpoint)}
                <span className="studio-spacer" />
                <button className="imgstudio-link" onClick={() => { setForm(config); setEditing(true); }}>Settings</button>
                <button className="imgstudio-link" onClick={() => void forget()}>Forget key</button>
              </div>
              <textarea className="ai-prompt" rows={3} placeholder="Describe the image… e.g. “a minimalist mountain logo, flat vector, teal”" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
              <div className="ai-cfg-row">
                <TkxSelect size="sm" value={size} options={IMAGE_SIZES.map((s) => ({ value: s, label: s }))} onChange={(v) => setSize(v as string)} />
                <TkxButton variant="solid" colorScheme="primary" size="sm" disabled={busy || !prompt.trim()} onClick={() => void generate()}>{busy ? 'Generating…' : 'Generate'}</TkxButton>
              </div>
              {error && <p className="ai-error">{error}</p>}
              {results.length > 0 && (
                <div className="ai-results">
                  {results.map((src, i) => (
                    <figure key={i} className="ai-result">
                      <img src={src} alt="generated" />
                      <TkxButton variant="outline" size="sm" onClick={() => { onInsert(src); onClose(); }}>Insert</TkxButton>
                    </figure>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Host of a URL, tolerant of a half-typed endpoint. */
function hostOf(endpoint: string): string {
  try { return new URL(endpoint).host; } catch { return endpoint; }
}
