/**
 * Resilient OpenRouter LLM client with JSON markdown fence cleaning
 * and structured output handling for free models.
 */

export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  disableReasoning?: boolean;
}

export interface ChatCompletionRequestBody {
  model: string;
  messages: Message[];
  temperature: number;
  max_completion_tokens: number;
  reasoning: { enabled: boolean };
}

/**
 * Build request body for OpenRouter chat completions.
 * Sets reasoning: { enabled: false } to conserve completion budget for JSON,
 * with automatic fallback in chatCompletion if an endpoint mandates reasoning.
 */
export function buildChatCompletionBody(
  model: string,
  messages: Message[],
  options: ChatCompletionOptions = {}
): ChatCompletionRequestBody {
  return {
    model,
    messages,
    temperature: options.temperature ?? 0.2,
    max_completion_tokens: options.maxTokens ?? 1500,
    reasoning: { enabled: false },
  };
}

/**
 * Extracts and parses JSON from raw LLM output, removing any markdown code blocks,
 * reasoning/think tags, or conversational text wrappers often returned by free models.
 */
export function extractJson<T>(raw: string): T {
  // Strip <think>...</think> blocks from reasoning models
  let cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

  // Strip common preamble lines from free guardrails like "User Safety: safe"
  cleaned = cleaned.replace(/^User Safety:\s*safe\s*/i, "").trim();

  // Check for ```json ... ``` or ``` ... ```
  const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/;
  const match = cleaned.match(codeBlockRegex);
  const jsonString = (match ? match[1] : cleaned).trim();

  try {
    return JSON.parse(jsonString) as T;
  } catch (error) {
    // Attempt fallback: find first '{' or '[' to last '}' or ']'
    const firstBrace = jsonString.search(/[{\[]/);
    const lastBrace = Math.max(
      jsonString.lastIndexOf("}"),
      jsonString.lastIndexOf("]")
    );

    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const sliced = jsonString.slice(firstBrace, lastBrace + 1);
      return JSON.parse(sliced) as T;
    }

    throw new Error(`Failed to parse LLM JSON response: ${(error as Error).message}\nRaw output: ${raw}`);
  }
}

export async function chatCompletion(
  messages: Message[],
  options: ChatCompletionOptions = {}
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY environment variable is missing");
  }

  const primaryModel = options.model || process.env.OPENROUTER_MODEL || "qwen/qwen3.8-27b:free";
  const modelChain = Array.from(new Set([primaryModel, "qwen/qwen3.8-27b:free", "openrouter/free"]));

  let lastError: Error | null = null;

  for (const model of modelChain) {
    try {
      const body = buildChatCompletionBody(model, messages, options);
      let response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        signal: AbortSignal.timeout(10000), // 10s timeout to prevent long stalls
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
          "X-Title": "Happenstance Clone",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        // If endpoint rejects disabling reasoning, retry without reasoning key
        if (response.status === 400 && errorText.includes("Reasoning is mandatory")) {
          const { reasoning: _, ...retryBody } = body;
          response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            signal: AbortSignal.timeout(10000),
            headers: {
              "Authorization": `Bearer ${apiKey}`,
              "Content-Type": "application/json",
              "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
              "X-Title": "Happenstance Clone",
            },
            body: JSON.stringify(retryBody),
          });
        }

        if (!response.ok) {
          const finalErr = await response.text().catch(() => errorText);
          throw new Error(`OpenRouter API error (${response.status}) on ${model}: ${finalErr}`);
        }
      }

      const data = await response.json();
      const content =
        data.choices?.[0]?.message?.content ||
        data.choices?.[0]?.message?.reasoning ||
        data.choices?.[0]?.text;

      if (!content || typeof content !== "string" || !content.trim()) {
        throw new Error(`Empty response from OpenRouter (${model})`);
      }

      return content;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // Try next model in chain
    }
  }

  throw lastError || new Error("Failed to get completion from OpenRouter");
}
