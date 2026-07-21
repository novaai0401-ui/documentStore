/**
 * Text-to-image via the user's own OpenAI-compatible endpoint (see aiConfig.ts).
 * The request/response shaping is pure and unit-tested; only `generateImages`
 * performs the network call, straight to the user-configured endpoint. Returns
 * data URLs ready to drop onto a design.
 */
import type { AiImageConfig } from './aiConfig.js';

export interface GenParams { prompt: string; size: string; n?: number }

export const IMAGE_SIZES = ['1024x1024', '1024x1536', '1536x1024', '512x512'];

/** Build the POST request for an OpenAI-style `/images/generations` endpoint. */
export function buildImageRequest(config: AiImageConfig, params: GenParams): { url: string; init: RequestInit } {
  const url = config.endpoint.replace(/\/+$/, '') + '/images/generations';
  return {
    url,
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({ model: config.model, prompt: params.prompt, size: params.size, n: params.n ?? 1, response_format: 'b64_json' }),
    },
  };
}

interface ImgItem { b64_json?: string; url?: string }

/** Normalize an OpenAI-style images response into data URLs (or remote URLs). */
export function parseImageResponse(json: unknown): string[] {
  const data = (json as { data?: ImgItem[] })?.data;
  if (!Array.isArray(data)) throw new Error('Unexpected response — expected a "data" array of images.');
  const out = data
    .map((d) => (d.b64_json ? `data:image/png;base64,${d.b64_json}` : d.url))
    .filter((x): x is string => !!x);
  if (!out.length) throw new Error('The response contained no images.');
  return out;
}

export async function generateImages(config: AiImageConfig, params: GenParams): Promise<string[]> {
  const { url, init } = buildImageRequest(config, params);
  let res: Response;
  try { res = await fetch(url, init); }
  catch { throw new Error('Could not reach the endpoint. Check the URL and your network.'); }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Image API error ${res.status}${body ? ': ' + body.slice(0, 200) : ''}`);
  }
  return parseImageResponse(await res.json());
}
