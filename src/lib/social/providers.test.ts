import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SocialProvider adapter tests (Task 9.3 / 9.5).
 *
 * The HTTP layer is always mocked - no test ever calls Meta's Graph API.
 * Module state (`getEnv()` caches) is reloaded per test with `vi.resetModules`
 * so each case can supply its own SOCIAL_* environment.
 */

const ENV_KEYS = [
  "SOCIAL_FACEBOOK_PAGE_ID",
  "SOCIAL_FACEBOOK_PAGE_TOKEN",
  "SOCIAL_INSTAGRAM_USER_ID",
  "SOCIAL_GRAPH_VERSION",
] as const;

type EnvOverrides = Partial<Record<(typeof ENV_KEYS)[number], string>>;

let savedEnv: Record<string, string | undefined> = {};

async function loadProviders(overrides: EnvOverrides = {}) {
  for (const key of ENV_KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) process.env[key] = value;
  }
  vi.resetModules();
  return import("./providers");
}

type Reply = { status: number; body: unknown };

function stubFetch(replies: Reply[]) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  let index = 0;
  const mock = vi.fn(async (input: unknown, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    const reply = replies[Math.min(index, replies.length - 1)] ?? { status: 500, body: {} };
    index += 1;
    return {
      status: reply.status,
      json: async () => reply.body,
    } as unknown as Response;
  });
  vi.stubGlobal("fetch", mock);
  return { mock, calls };
}

beforeEach(() => {
  savedEnv = {};
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  vi.unstubAllGlobals();
  vi.resetModules();
});

const configured: EnvOverrides = {
  SOCIAL_FACEBOOK_PAGE_ID: "PAGE-1",
  SOCIAL_FACEBOOK_PAGE_TOKEN: "page-token",
  SOCIAL_INSTAGRAM_USER_ID: "IG-1",
};

describe("graph version", () => {
  it("reads SOCIAL_GRAPH_VERSION from the environment with a documented default", async () => {
    const withEnv = await loadProviders({ ...configured, SOCIAL_GRAPH_VERSION: "v99.0" });
    expect(withEnv.graphVersion()).toBe("v99.0");

    const withoutEnv = await loadProviders(configured);
    expect(withoutEnv.graphVersion()).toBe("v26.0");
  });
});

describe("FacebookProvider", () => {
  it("posts a photo to the Page feed with the message and card image", async () => {
    const { mock, calls } = stubFetch([{ status: 200, body: { id: "photo-1", post_id: "page-9" } }]);
    const mod = await loadProviders({ ...configured, SOCIAL_GRAPH_VERSION: "v99.0" });
    const provider = mod.getSocialProvider("facebook");

    expect(provider.isConfigured()).toBe(true);
    const result = await provider.publish({
      message: "Hiring in Bengaluru https://ravelyth.in/jobs/x",
      imageUrl: "https://ravelyth.in/api/social/card/1",
    });

    expect(result.platformPostId).toBe("page-9");
    expect(mock).toHaveBeenCalledTimes(1);
    const url = new URL(calls[0].url);
    expect(`${url.origin}${url.pathname}`).toBe(
      "https://graph.facebook.com/v99.0/PAGE-1/photos",
    );
    expect(url.searchParams.get("access_token")).toBe("page-token");
    expect(url.searchParams.get("message")).toBe(
      "Hiring in Bengaluru https://ravelyth.in/jobs/x",
    );
    expect(url.searchParams.get("url")).toBe("https://ravelyth.in/api/social/card/1");
    expect(calls[0].init?.method).toBe("POST");
  });

  it("reports an expired or invalid token as a SocialTokenError", async () => {
    stubFetch([
      {
        status: 401,
        body: { error: { message: "Error validating access token", code: 190 } },
      },
    ]);
    const mod = await loadProviders(configured);
    const provider = mod.getSocialProvider("facebook");

    expect(provider.isConfigured()).toBe(true);
    await expect(provider.publish({ message: "hi", imageUrl: "https://x" })).rejects.toBeInstanceOf(
      mod.SocialTokenError,
    );
  });

  it("treats Graph error code 190 as a token failure even on HTTP 200/500", async () => {
    stubFetch([{ status: 500, body: { error: { message: "Session expired", code: 190 } } }]);
    const mod = await loadProviders(configured);
    const provider = mod.getSocialProvider("facebook");
    await expect(provider.publish({ message: "hi", imageUrl: "https://x" })).rejects.toBeInstanceOf(
      mod.SocialTokenError,
    );
  });

  it("raises a retryable SocialApiError for non-token Graph failures", async () => {
    stubFetch([{ status: 500, body: { error: { message: "Internal error", code: 2 } } }]);
    const mod = await loadProviders(configured);
    const provider = mod.getSocialProvider("facebook");
    const error = await provider
      .publish({ message: "hi", imageUrl: "https://x" })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(mod.SocialApiError);
    expect((error as InstanceType<typeof mod.SocialApiError>).status).toBe(500);
    expect((error as Error).message).toContain("Internal error");
  });

  it("never calls the network when the credentials are missing", async () => {
    const { mock } = stubFetch([{ status: 200, body: { id: "1" } }]);
    const mod = await loadProviders({});
    const provider = mod.getSocialProvider("facebook");

    expect(provider.isConfigured()).toBe(false);
    await expect(provider.publish({ message: "hi", imageUrl: "https://x" })).rejects.toBeInstanceOf(
      mod.SocialApiError,
    );
    expect(mock).not.toHaveBeenCalled();
  });
});

describe("InstagramProvider", () => {
  it("runs the container -> status -> publish flow with the caption", async () => {
    const { calls } = stubFetch([
      { status: 200, body: { id: "container-1" } },
      { status: 200, body: { status_code: "FINISHED" } },
      { status: 200, body: { id: "ig-media-7" } },
    ]);
    const mod = await loadProviders({ ...configured, SOCIAL_GRAPH_VERSION: "v99.0" });
    const provider = mod.getSocialProvider("instagram");

    expect(provider.isConfigured()).toBe(true);
    const result = await provider.publish({
      message: "New opening\n\nhttps://ravelyth.in/jobs/x\nLink in bio",
      imageUrl: "https://ravelyth.in/api/social/card/1",
    });

    expect(result.platformPostId).toBe("ig-media-7");
    expect(calls).toHaveLength(3);

    const create = new URL(calls[0].url);
    expect(`${create.origin}${create.pathname}`).toBe(
      "https://graph.facebook.com/v99.0/IG-1/media",
    );
    expect(create.searchParams.get("image_url")).toBe("https://ravelyth.in/api/social/card/1");
    expect(create.searchParams.get("caption")).toContain("Link in bio");

    const status = new URL(calls[1].url);
    expect(status.pathname).toContain("container-1");
    expect(status.searchParams.get("fields")).toBe("status_code");

    const publish = new URL(calls[2].url);
    expect(`${publish.origin}${publish.pathname}`).toBe(
      "https://graph.facebook.com/v99.0/IG-1/media_publish",
    );
    expect(publish.searchParams.get("creation_id")).toBe("container-1");
  });

  it("surfaces an expired token as a SocialTokenError before publishing", async () => {
    stubFetch([
      { status: 400, body: { error: { message: "Invalid OAuth access token", code: 190 } } },
    ]);
    const mod = await loadProviders(configured);
    const provider = mod.getSocialProvider("instagram");

    await expect(provider.publish({ message: "hi", imageUrl: "https://x" })).rejects.toBeInstanceOf(
      mod.SocialTokenError,
    );
  });

  it("never calls the network when the credentials are missing", async () => {
    const { mock } = stubFetch([{ status: 200, body: {} }]);
    const mod = await loadProviders({ SOCIAL_FACEBOOK_PAGE_TOKEN: "page-token" });
    const provider = mod.getSocialProvider("instagram");

    expect(provider.isConfigured()).toBe(false);
    await expect(provider.publish({ message: "hi", imageUrl: "https://x" })).rejects.toBeInstanceOf(
      mod.SocialApiError,
    );
    expect(mock).not.toHaveBeenCalled();
  });
});
