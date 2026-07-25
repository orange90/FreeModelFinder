import type { ChatMessage, ChatRequest } from '../types.js';

export interface AnthropicMessagesRequest {
  model: string;
  system?: string | Array<{ type: 'text'; text: string }>;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string | Array<{ type: string; text?: string }>;
  }>;
  max_tokens: number;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
  stop_sequences?: string[];
}

function contentToString(
  content: AnthropicMessagesRequest['messages'][number]['content'],
): string {
  if (typeof content === 'string') return content;
  return content
    .filter((c) => c.type === 'text')
    .map((c) => c.text ?? '')
    .join('');
}

export function anthropicToChatRequest(req: AnthropicMessagesRequest): ChatRequest {
  const messages: ChatMessage[] = [];
  if (req.system) {
    const sys =
      typeof req.system === 'string'
        ? req.system
        : req.system.map((s) => s.text).join('\n\n');
    messages.push({ role: 'system', content: sys });
  }
  for (const m of req.messages) {
    messages.push({ role: m.role, content: contentToString(m.content) });
  }
  return {
    model: req.model,
    messages,
    temperature: req.temperature,
    top_p: req.top_p,
    max_tokens: req.max_tokens,
    stream: req.stream ?? false,
    stop: req.stop_sequences,
  };
}

export function chatResponseToAnthropic(res: {
  id: string;
  model: string;
  content: string;
  finish_reason: string | null;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}) {
  return {
    id: res.id,
    type: 'message',
    role: 'assistant',
    model: res.model,
    content: [{ type: 'text', text: res.content }],
    stop_reason:
      res.finish_reason === 'length'
        ? 'max_tokens'
        : res.finish_reason === 'stop'
          ? 'end_turn'
          : res.finish_reason,
    usage: {
      input_tokens: res.usage?.prompt_tokens ?? 0,
      output_tokens: res.usage?.completion_tokens ?? 0,
    },
  };
}
