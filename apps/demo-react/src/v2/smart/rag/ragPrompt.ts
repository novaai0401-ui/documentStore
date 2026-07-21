/**
 * Build a grounded-answering prompt from retrieved passages. The model is told
 * to answer ONLY from the passages and to cite the page numbers it used, which
 * keeps responses faithful to the document and verifiable. Reuses the chat
 * message shape so it can drive either the on-device LLM or the BYO-cloud model.
 */
import type { ChatMessage } from '../../cloud/textGen.js';
import type { Retrieved } from './ragIndex.js';

/** Render retrieved chunks as a numbered, page-labelled context block. */
export function formatContext(passages: Retrieved[]): string {
  return passages
    .map((p, i) => `[${i + 1}${p.chunk.page ? `, p.${p.chunk.page}` : ''}] ${p.chunk.text}`)
    .join('\n\n');
}

export function groundedPrompt(question: string, passages: Retrieved[]): ChatMessage[] {
  const context = formatContext(passages);
  return [
    {
      role: 'system',
      content:
        'You answer questions about a document using ONLY the provided passages. ' +
        'If the answer is not in the passages, say you could not find it. Be concise and ' +
        'cite the page numbers you used in square brackets, e.g. [p.3].',
    },
    {
      role: 'user',
      content: `Passages:\n${context || '(none)'}\n\nQuestion: ${question}\n\nAnswer using only the passages above.`,
    },
  ];
}
