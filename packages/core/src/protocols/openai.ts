import type { ChatMessage, ChatRequest, ChatResponse, StreamChunk } from '../types.js';

export interface OpenAIChatCompletionRequest {
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string | Array<{ type: string; text?: string }>;
    name?: string;
    tool_call_id?: string;
  }>;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stream?: boolean;
  stop?: string | string[];
}

function normalizeContent(
  c: OpenAIChatCompletionRequest['messages'][number]['content'],
): string {
  if (typeof c === 'string') return c;
  return c
    .filter((part) => part.type === 'text' || part.type === 'input_text')
    .map((part) => part.text ?? '')
    .join('');
}

export function openAIToChatRequest(req: OpenAIChatCompletionRequest): ChatRequest {
  const messages: ChatMessage[] = req.messages.map((m) => ({
    role: m.role,
    content: normalizeContent(m.content),
    name: m.name,
    tool_call_id: m.tool_call_id,
  }));
  return {
    model: req.model,
    messages,
    temperature: req.temperature,
    top_p: req.top_p,
    max_tokens: req.max_tokens,
    stream: req.stream ?? false,
    stop: req.stop,
  };
}

export function chatResponseToOpenAI(res: ChatResponse) {
  return {
    id: res.id,
    object: 'chat.completion',
    created: res.created,
    model: res.model,
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: res.content },
        finish_reason: res.finish_reason ?? 'stop',
      },
    ],
    usage: res.usage,
  };
}

export function streamChunkToOpenAI(chunk: StreamChunk) {
  return {
    id: chunk.id,
    object: 'chat.completion.chunk',
    created: chunk.created,
    model: chunk.model,
    choices: [
      {
        index: 0,
        delta: chunk.delta ? { role: 'assistant', content: chunk.delta } : {},
        finish_reason: chunk.finish_reason ?? null,
      },
    ],
  };
}
