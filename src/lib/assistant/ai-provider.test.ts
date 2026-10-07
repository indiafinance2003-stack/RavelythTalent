import { describe, expect, it, vi } from "vitest";
import { AnthropicAiProvider } from "./ai-provider";

function okResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

describe("AnthropicAiProvider", () => {
  it("sends the server API headers and reads token usage", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(okResponse({
      content: [{ type: "text", text: "{\"ok\":true}" }],
      usage: { input_tokens: 12, output_tokens: 4 },
    }));
    const provider = new AnthropicAiProvider("test-key-only", fetchMock);
    await expect(provider.complete({
      model: "claude-haiku-4-5",
      system: "safe",
      user: "data",
      maxTokens: 128,
    })).resolves.toEqual({ text: "{\"ok\":true}", inputTokens: 12, outputTokens: 4 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, options] = fetchMock.mock.calls[0]!;
    expect(new Headers(options?.headers).get("x-api-key")).toBe("test-key-only");
    expect(new Headers(options?.headers).get("anthropic-version")).toBe("2023-06-01");
    expect(options?.signal).toBeInstanceOf(AbortSignal);
  });

  it("retries one server failure without making a real request", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(okResponse({
        content: [{ type: "text", text: "ok" }],
        usage: { input_tokens: 1, output_tokens: 1 },
      }));
    const provider = new AnthropicAiProvider("test-key-only", fetchMock);
    await provider.complete({ model: "claude-haiku-4-5", system: "s", user: "u", maxTokens: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
