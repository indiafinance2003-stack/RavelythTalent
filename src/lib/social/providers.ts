import { getEnv } from "@/lib/env";
import type { SocialPlatform } from "@/lib/db/schema";

/**
 * HTTP layer for social auto-posting (Task 9.3).
 *
 * The SocialProvider interface is implemented by a Facebook adapter (Page
 * feed photo post) and an Instagram adapter (Graph API content publishing
 * flow). All calls use fetch with explicit timeouts. Tests must mock this
 * module - no test ever calls Meta's APIs.
 */

const REQUEST_TIMEOUT_MS = 15_000;
const INSTAGRAM_CONTAINER_POLL_ATTEMPTS = 5;
const INSTAGRAM_CONTAINER_POLL_DELAY_MS = 1_500;

export type SocialPublishResult = {
  platformPostId: string;
};

export class SocialTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SocialTokenError";
  }
}

export class SocialApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "SocialApiError";
    this.status = status;
  }
}

export interface SocialProvider {
  readonly platform: SocialPlatform;
  /** True when the required environment variables are present. */
  isConfigured(): boolean;
  /** Publish an image card with a message; returns the platform post id. */
  publish(input: { message: string; imageUrl: string }): Promise<SocialPublishResult>;
}

export function graphVersion(): string {
  return getEnv().SOCIAL_GRAPH_VERSION?.trim() || "v26.0";
}

function graphUrl(path: string, params: Record<string, string>): string {
  const url = new URL(`https://graph.facebook.com/${graphVersion()}/${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

type GraphErrorBody = {
  error?: { message?: string; code?: number; type?: string };
  id?: string;
  post_id?: string;
  status_code?: string;
};

/** Graph API error code 190 and HTTP 401/403 mean the token is no longer usable. */
function isTokenError(status: number, body: GraphErrorBody | null): boolean {
  if (status === 401 || status === 403) return true;
  return body?.error?.code === 190;
}

function errorMessage(status: number, body: GraphErrorBody | null): string {
  return body?.error?.message ?? `Graph API returned HTTP ${status}.`;
}

async function graphFetch(
  url: string,
  init: RequestInit,
): Promise<{ status: number; body: GraphErrorBody | null }> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  let body: GraphErrorBody | null = null;
  try {
    body = (await response.json()) as GraphErrorBody;
  } catch {
    body = null;
  }
  return { status: response.status, body };
}

async function assertGraphOk(
  result: { status: number; body: GraphErrorBody | null },
  context: string,
): Promise<GraphErrorBody> {
  if (result.status >= 200 && result.status < 300 && !result.body?.error) {
    return result.body ?? {};
  }
  if (isTokenError(result.status, result.body)) {
    throw new SocialTokenError(`${context}: ${errorMessage(result.status, result.body)}`);
  }
  throw new SocialApiError(
    `${context}: ${errorMessage(result.status, result.body)}`,
    result.status,
  );
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/* -------------------------------------------------------------------------- */
/* Facebook: Page feed photo post                                             */
/* -------------------------------------------------------------------------- */

export class FacebookProvider implements SocialProvider {
  readonly platform = "facebook" as const;

  isConfigured(): boolean {
    const env = getEnv();
    return Boolean(env.SOCIAL_FACEBOOK_PAGE_ID && env.SOCIAL_FACEBOOK_PAGE_TOKEN);
  }

  async publish(input: { message: string; imageUrl: string }): Promise<SocialPublishResult> {
    const env = getEnv();
    if (!this.isConfigured()) {
      throw new SocialApiError("Facebook is not configured.", 400);
    }
    const url = graphUrl(`${env.SOCIAL_FACEBOOK_PAGE_ID}/photos`, {
      access_token: env.SOCIAL_FACEBOOK_PAGE_TOKEN ?? "",
      url: input.imageUrl,
      message: input.message,
      no_story: "true",
    });
    const result = await graphFetch(url, { method: "POST" });
    const body = await assertGraphOk(result, "Facebook photo post");
    const platformPostId = String(body.post_id ?? body.id ?? "");
    if (!platformPostId) {
      throw new SocialApiError("Facebook returned no post id.", 502);
    }
    return { platformPostId };
  }
}

/* -------------------------------------------------------------------------- */
/* Instagram: content publishing flow (container -> poll -> publish)          */
/* -------------------------------------------------------------------------- */

export class InstagramProvider implements SocialProvider {
  readonly platform = "instagram" as const;

  isConfigured(): boolean {
    const env = getEnv();
    return Boolean(env.SOCIAL_INSTAGRAM_USER_ID && env.SOCIAL_FACEBOOK_PAGE_TOKEN);
  }

  async publish(input: { message: string; imageUrl: string }): Promise<SocialPublishResult> {
    const env = getEnv();
    if (!this.isConfigured()) {
      throw new SocialApiError("Instagram is not configured.", 400);
    }
    const token = env.SOCIAL_FACEBOOK_PAGE_TOKEN ?? "";

    // 1) Create the media container.
    const createResult = await graphFetch(
      graphUrl(`${env.SOCIAL_INSTAGRAM_USER_ID}/media`, {
        access_token: token,
        image_url: input.imageUrl,
        caption: input.message,
      }),
      { method: "POST" },
    );
    const created = await assertGraphOk(createResult, "Instagram container create");
    const containerId = String(created.id ?? "");
    if (!containerId) throw new SocialApiError("Instagram returned no media container id.", 502);

    // 2) Poll the container status before publishing.
    let ready = false;
    for (let attempt = 0; attempt < INSTAGRAM_CONTAINER_POLL_ATTEMPTS; attempt += 1) {
      if (attempt > 0) await sleep(INSTAGRAM_CONTAINER_POLL_DELAY_MS);
      const statusResult = await graphFetch(
        graphUrl(containerId, { fields: "status_code", access_token: token }),
        { method: "GET" },
      );
      const statusBody = await assertGraphOk(statusResult, "Instagram container status");
      const statusCode = String(statusBody.status_code ?? "");
      if (statusCode === "FINISHED") {
        ready = true;
        break;
      }
      if (statusCode === "ERROR" || statusCode === "EXPIRED") {
        throw new SocialApiError(`Instagram media container ${statusCode.toLowerCase()}.`, 422);
      }
    }
    if (!ready) {
      throw new SocialApiError("Instagram media container was not ready in time.", 504);
    }

    // 3) Publish the container.
    const publishResult = await graphFetch(
      graphUrl(`${env.SOCIAL_INSTAGRAM_USER_ID}/media_publish`, {
        access_token: token,
        creation_id: containerId,
      }),
      { method: "POST" },
    );
    const published = await assertGraphOk(publishResult, "Instagram publish");
    const platformPostId = String(published.id ?? "");
    if (!platformPostId) throw new SocialApiError("Instagram returned no media id.", 502);
    return { platformPostId };
  }
}

export function getSocialProvider(platform: SocialPlatform): SocialProvider {
  return platform === "facebook" ? new FacebookProvider() : new InstagramProvider();
}

