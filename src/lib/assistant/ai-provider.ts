import { z } from "zod";
import { AppError } from "@/lib/errors";

export type AiRequest = {
  model: string;
  system: string;
  user: string;
  maxTokens: number;
};

export type AiCompletion = {
  text: string;
  inputTokens: number;
  outputTokens: number;
};

export interface AiProvider {
  complete(request: AiRequest): Promise<AiCompletion>;
}

const responseSchema = z.object({
  content: z.array(z.object({
    type: z.literal("text"),
    text: z.string(),
  })),
  usage: z.object({
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
  }),
});

export class AnthropicAiProvider implements AiProvider {
  constructor(
    private readonly apiKey: string,
    private readonly requestFetch: typeof fetch = fetch,
  ) {}

  async complete(request: AiRequest): Promise<AiCompletion> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await this.requestFetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          signal: AbortSignal.timeout(30_000),
          headers: {
            "content-type": "application/json",
            "x-api-key": this.apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: request.model,
            max_tokens: request.maxTokens,
            system: request.system,
            messages: [{ role: "user", content: request.user }],
          }),
        });
        if (!response.ok) {
          if (response.status >= 500 && attempt === 0) continue;
          throw new AppError(`AI provider returned HTTP ${response.status}.`, 502, "ai_provider_error");
        }
        const parsed = responseSchema.safeParse(await response.json());
        if (!parsed.success) throw new AppError("AI provider returned an invalid response.", 502, "ai_provider_invalid_response");
        const text = parsed.data.content.map((item) => item.text).join("\n").trim();
        if (!text) throw new AppError("AI provider returned an empty response.", 502, "ai_provider_empty_response");
        return {
          text,
          inputTokens: parsed.data.usage.input_tokens,
          outputTokens: parsed.data.usage.output_tokens,
        };
      } catch (error) {
        lastError = error;
        if (error instanceof AppError || attempt === 1) throw error;
      }
    }
    throw lastError instanceof Error
      ? new AppError("AI provider request failed after one retry.", 502, "ai_provider_error")
      : new AppError("AI provider request failed after one retry.", 502, "ai_provider_error");
  }
}
