import type { ChatMessage, ChatRequest } from '../types.js';

export interface GeminiHttpRequest {
  contents: Array<{
    role: 'user' | 'model';
    parts: Array<{ text: string }>;
  }>;
  systemInstruction?: { parts: Array<{ text: string }> };
  generationConfig?: {
    temperature?: number;
    topP?: number;
    maxOutputTokens?: number;
    stopSequences?: string[];
  };
}

export function geminiToChatRequest(
  model: string,
  req: GeminiHttpRequest,
  stream = false,
): ChatRequest {
  const messages: ChatMessage[] = [];
  if (req.systemInstruction) {
    messages.push({
      role: 'system',
      content: req.systemInstruction.parts.map((p) => p.text).join(''),
    });
  }
  for (const c of req.contents) {
    messages.push({
      role: c.role === 'model' ? 'assistant' : 'user',
      content: c.parts.map((p) => p.text).join(''),
    });
  }
  return {
    model,
    messages,
    temperature: req.generationConfig?.temperature,
    top_p: req.generationConfig?.topP,
    max_tokens: req.generationConfig?.maxOutputTokens,
    stop: req.generationConfig?.stopSequences,
    stream,
  };
}

export function chatResponseToGemini(res: {
  content: string;
  finish_reason: string | null;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}) {
  return {
    candidates: [
      {
        content: {
          role: 'model',
          parts: [{ text: res.content }],
        },
        finishReason:
          res.finish_reason === 'length'
            ? 'MAX_TOKENS'
            : res.finish_reason === 'stop'
              ? 'STOP'
              : res.finish_reason?.toUpperCase(),
        index: 0,
      },
    ],
    usageMetadata: res.usage
      ? {
          promptTokenCount: res.usage.prompt_tokens ?? 0,
          candidatesTokenCount: res.usage.completion_tokens ?? 0,
          totalTokenCount: res.usage.total_tokens ?? 0,
        }
      : undefined,
  };
}
