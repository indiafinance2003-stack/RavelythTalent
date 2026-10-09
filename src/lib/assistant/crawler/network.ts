import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

/** Polite crawler identity declared in robots.txt and the User-Agent header. */
export const BOT_USER_AGENT = "RavelythTalentBot (+https://ravelyth.in/bot)";

export const CRAWL_LIMITS = {
  maxRedirects: 3,
  timeoutMs: 8_000,
  maxPageBytes: 1_048_576,
  maxPagesPerSite: 6,
  sameHostDelayMs: 1_000,
  /** Overall crawl concurrency across different targets. */
  concurrency: 2,
} as const;

export class CrawlFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CrawlFetchError";
  }
}

/* -------------------------------------------------------------------------- */
/* IP address screening (SSRF)                                                */
/* -------------------------------------------------------------------------- */

function parseIPv4(value: string): [number, number, number, number] | null {
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    octets.push(n);
  }
  return octets as [number, number, number, number];
}

/** Blocks private, loopback, link-local, multicast, metadata and reserved IPv4. */
export function isBlockedIPv4(value: string): boolean {
  const octets = parseIPv4(value);
  if (!octets) return true;
  const [a, b, c] = octets;
  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 0 && c === 0) return true;
  if (a === 192 && b === 0 && c === 2) return true;
  if (a === 192 && b === 168) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 198 && b === 51 && c === 100) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

/** Parses an IPv6 literal into eight 16-bit groups, or null when malformed. */
export function parseIPv6(value: string): number[] | null {
  let input = value.trim();
  if (!input.includes(":")) return null;
  const zone = input.indexOf("%");
  if (zone >= 0) input = input.slice(0, zone);

  const lastColon = input.lastIndexOf(":");
  const v4Tail = input.slice(lastColon + 1);
  if (v4Tail.includes(".")) {
    const embeddedV4 = parseIPv4(v4Tail);
    if (!embeddedV4) return null;
    input = input.slice(0, lastColon + 1);
    input += `${((embeddedV4[0] << 8) | embeddedV4[1]).toString(16)}:${((embeddedV4[2] << 8) | embeddedV4[3]).toString(16)}`;
  }

  const doubleColon = input.indexOf("::");
  if (doubleColon !== input.lastIndexOf("::")) return null;
  let headText: string;
  let tailText: string;
  if (doubleColon >= 0) {
    headText = input.slice(0, doubleColon);
    tailText = input.slice(doubleColon + 2);
  } else {
    headText = input;
    tailText = "";
  }
  const toGroups = (text: string): number[] | null => {
    if (!text) return [];
    const groups: number[] = [];
    for (const group of text.split(":")) {
      if (!/^[0-9a-f]{1,4}$/i.test(group)) return null;
      groups.push(Number.parseInt(group, 16));
    }
    return groups;
  };
  const head = toGroups(headText);
  const tailGroups = toGroups(tailText);
  if (!head || !tailGroups) return null;
  if (doubleColon < 0) return head.length === 8 ? head : null;
  const fill = 8 - head.length - tailGroups.length;
  if (fill < 1) return null;
  return [...head, ...new Array<number>(fill).fill(0), ...tailGroups];
}

/** Screens embedded IPv4 inside mapped/compatible/NAT64 IPv6 forms. */
function isBlockedEmbeddedV4(groups: number[]): boolean {
  const hi = groups[6];
  const lo = groups[7];
  const v4 = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
  return isBlockedIPv4(v4);
}

/** Blocks loopback, unspecified, link-local, unique-local, multicast and
 * private/documentation IPv6, and screens embedded IPv4 addresses. */
export function isBlockedIPv6(value: string): boolean {
  const groups = parseIPv6(value);
  if (!groups) return true;
  const isZeroPrefix = (count: number) => groups.slice(0, count).every((g) => g === 0);
  if (groups.every((g) => g === 0)) return true;
  if (isZeroPrefix(7) && groups[7] === 1) return true;
  // IPv4-mapped ::ffff:a.b.c.d (0xffff in group 5) and deprecated
  // IPv4-compatible ::a.b.c.d (zeros through group 5).
  if (isZeroPrefix(5) && groups[5] === 0xffff) return isBlockedEmbeddedV4(groups);
  if (isZeroPrefix(6) && (groups[6] !== 0 || groups[7] !== 0)) {
    return isBlockedEmbeddedV4(groups);
  }
  const first = groups[0];
  if ((first & 0xffc0) === 0xfe80) return true;
  if ((first & 0xfe00) === 0xfc00) return true;
  if ((first & 0xff00) === 0xff00) return true;
  if (first === 0x0100 && groups.slice(1, 4).every((g) => g === 0)) return true;
  if (first === 0x2001 && groups[1] === 0x0db8) return true;
  if (first === 0x0064 && groups[1] === 0xff9b && groups[2] === 0 && groups[3] === 0) {
    return isBlockedEmbeddedV4(groups);
  }
  return false;
}

/** True when an IP literal must never be fetched (v4 or v6). */
export function isBlockedAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isBlockedIPv4(ip);
  if (version === 6) return isBlockedIPv6(ip);
  return true;
}

const BLOCKED_HOSTNAME_SUFFIXES = [".localhost", ".local", ".internal", ".home.arpa"];

/** Cheap pre-DNS rejection for obviously internal hostnames. */
export function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLocaleLowerCase("en").replace(/\.$/, "");
  if (!host || host === "localhost" || host.endsWith(".localhost")) return true;
  return BLOCKED_HOSTNAME_SUFFIXES.some((suffix) => host.endsWith(suffix));
}


/* -------------------------------------------------------------------------- */
/* URL validation                                                             */
/* -------------------------------------------------------------------------- */

export type UrlCheck = { url: URL; addresses: string[] };

async function defaultResolve(hostname: string): Promise<string[]> {
  const records = await dnsLookup(hostname, { all: true, verbatim: true });
  return records.map((record) => record.address);
}

/**
 * Validates a URL is plain http(s) on port 80/443, resolves its DNS and
 * rejects any answer that maps to a blocked address.
 */
export async function assertSafeUrl(
  rawUrl: string | URL,
  resolve: (hostname: string) => Promise<string[]> = defaultResolve,
): Promise<UrlCheck> {
  let url: URL;
  try {
    url = typeof rawUrl === "string" ? new URL(rawUrl) : new URL(rawUrl.toString());
  } catch {
    throw new CrawlFetchError("Invalid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new CrawlFetchError("Only http(s) URLs are crawled.");
  }
  const port = url.port || (url.protocol === "https:" ? "443" : "80");
  if (port !== "80" && port !== "443") {
    throw new CrawlFetchError("Only ports 80 and 443 are crawled.");
  }
  if (url.username || url.password) {
    throw new CrawlFetchError("URLs with embedded credentials are not crawled.");
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (isBlockedHostname(hostname)) {
    throw new CrawlFetchError("This host is not crawled.");
  }
  if (isIP(hostname)) {
    if (isBlockedAddress(hostname)) throw new CrawlFetchError("This address is not crawled.");
    return { url, addresses: [hostname] };
  }
  const addresses = await resolve(hostname);
  if (!addresses.length) throw new CrawlFetchError("DNS returned no addresses.");
  for (const address of addresses) {
    if (isBlockedAddress(address)) {
      throw new CrawlFetchError("This host resolves to a private address.");
    }
  }
  return { url, addresses };
}

/* -------------------------------------------------------------------------- */
/* Guarded page fetch                                                         */
/* -------------------------------------------------------------------------- */

export type FetchedPage = {
  url: string;
  status: number;
  contentType: string;
  body: string;
  headers: Headers;
};

export type FetchPageOptions = {
  userAgent?: string;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  resolve?: (hostname: string) => Promise<string[]>;
  fetchFn?: typeof fetch;
  /** Content-type substrings accepted in the response (default text/html). */
  acceptContentTypes?: string[];
};

async function readBodyCapped(response: Response, maxBytes: number): Promise<Buffer> {
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new CrawlFetchError("Page exceeds the 1 MB size limit.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/**
 * Fetches one page with SSRF re-validation on every redirect hop (max 3),
 * an 8 second timeout, a 1 MB body cap and a text/html content-type
 * requirement. Throws CrawlFetchError when any guard fails.
 */
export async function fetchPage(
  rawUrl: string | URL,
  options: FetchPageOptions = {},
): Promise<FetchedPage> {
  const fetchFn = options.fetchFn ?? fetch;
  const timeoutMs = options.timeoutMs ?? CRAWL_LIMITS.timeoutMs;
  const maxBytes = options.maxBytes ?? CRAWL_LIMITS.maxPageBytes;
  const maxRedirects = options.maxRedirects ?? CRAWL_LIMITS.maxRedirects;
  const userAgent = options.userAgent ?? BOT_USER_AGENT;

  let current: string | URL = rawUrl;
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const { url } = await assertSafeUrl(current, options.resolve);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetchFn(url, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "user-agent": userAgent,
          accept: "text/html,application/xhtml+xml",
        },
      });
    } catch (error) {
      if (error instanceof CrawlFetchError) throw error;
      throw new CrawlFetchError(
        controller.signal.aborted
          ? "Request timed out."
          : `Request failed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    } finally {
      clearTimeout(timer);
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (hop === maxRedirects) throw new CrawlFetchError("Too many redirects.");
      if (!location) throw new CrawlFetchError("Redirect without a location.");
      current = new URL(location, url);
      continue;
    }

    if (!response.ok) throw new CrawlFetchError(`HTTP ${response.status}.`);
    const contentType = (response.headers.get("content-type") ?? "").toLocaleLowerCase("en");
    const accepted = options.acceptContentTypes ?? ["text/html"];
    if (!accepted.some((candidate) => contentType.includes(candidate))) {
      throw new CrawlFetchError("Content-type is not text/html.");
    }
    const buffer = await readBodyCapped(response, maxBytes);
    return {
      url: url.toString(),
      status: response.status,
      contentType,
      body: buffer.toString("utf8"),
      headers: response.headers,
    };
  }
  throw new CrawlFetchError("Too many redirects.");
}


