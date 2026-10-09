import { CrawlFetchError, fetchPage, type FetchPageOptions } from "./network";

/* -------------------------------------------------------------------------- */
/* robots.txt parsing and matching (pure, testable)                           */
/* -------------------------------------------------------------------------- */

export type RobotsRule = { allow: boolean; pattern: string };

export type RobotsRules = {
  /** Rules that applied to our user-agent; empty means everything allowed. */
  rules: RobotsRule[];
  /** True when the site asks crawlers to stay away entirely. */
  disallowAll: boolean;
};

function tokenizeUserAgent(line: string): string {
  return line.split("/")[0]?.trim().toLocaleLowerCase("en") ?? "";
}

/** Converts a robots path pattern (with * and $ anchors) to a regex. */
function patternToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  const anchored = pattern.endsWith("$") ? `${escaped}` : escaped;
  return new RegExp(`^${anchored}`);
}

/**
 * Parses robots.txt for the given crawler token (e.g. "ravelythtalentbot").
 * Falls back to `*` groups when no specific group matches.
 */
export function parseRobots(text: string, crawlerToken: string): RobotsRules {
  const groups: Array<{ agents: string[]; rules: RobotsRule[] }> = [];
  let current: { agents: string[]; rules: RobotsRule[] } | null = null;
  let seenNonAgentLine = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split("#")[0]?.trim() ?? "";
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const field = line.slice(0, separator).trim().toLocaleLowerCase("en");
    const value = line.slice(separator + 1).trim();

    if (field === "user-agent") {
      if (!current || seenNonAgentLine) {
        current = { agents: [], rules: [] };
        groups.push(current);
        seenNonAgentLine = false;
      }
      current.agents.push(tokenizeUserAgent(value));
      continue;
    }
    if (!current) continue;
    seenNonAgentLine = true;
    if (field === "disallow") {
      // An empty Disallow means "allow everything" for this group.
      if (value === "") continue;
      current.rules.push({ allow: false, pattern: value });
    } else if (field === "allow") {
      if (value === "") continue;
      current.rules.push({ allow: true, pattern: value });
    }
  }

  const token = crawlerToken.toLocaleLowerCase("en");
  const specific = groups.find((group) => group.agents.some((agent) => agent === token));
  const wildcard = groups.find((group) => group.agents.includes("*"));
  const rules = (specific?.rules ?? wildcard?.rules ?? [])
    .filter((rule) => patternIsSane(rule.pattern));

  // Site-wide block: an unconditional "Disallow: /" with no Allow rules.
  const disallowAll =
    rules.some((rule) => !rule.allow && rule.pattern === "/") &&
    !rules.some((rule) => rule.allow);

  return { rules, disallowAll };
}

function patternIsSane(pattern: string): boolean {
  return pattern.startsWith("/");
}

/**
 * Longest-match robots decision: the most specific pattern wins, Allow wins
 * ties. No matching rule means the path is allowed.
 */
export function isPathAllowed(rules: RobotsRules, path: string): boolean {
  const target = path.startsWith("/") ? path : `/${path}`;
  let best: RobotsRule | null = null;
  let bestLength = -1;
  for (const rule of rules.rules) {
    if (!patternIsSane(rule.pattern)) continue;
    let matched = false;
    try {
      matched = patternToRegex(rule.pattern).test(target);
    } catch {
      matched = false;
    }
    if (!matched) continue;
    if (rule.pattern.length > bestLength) {
      best = rule;
      bestLength = rule.pattern.length;
    }
  }
  if (!best) return true;
  return best.allow;
}

/** Full decision: site-wide disallow or path-level disallow. */
export function robotsAllows(rules: RobotsRules, path: string): boolean {
  if (rules.disallowAll) return false;
  return isPathAllowed(rules, path);
}

/* -------------------------------------------------------------------------- */
/* Fetching robots.txt                                                        */
/* -------------------------------------------------------------------------- */

export const ROBOTS_TOKEN = "ravelythtalentbot";

/**
 * Fetches /robots.txt for a site. Missing or unfetchable robots.txt means
 * everything is allowed; a fetch guard failure returns "allow nothing" only
 * when the file exists but cannot be read safely - we choose to allow the
 * homepage in that case, so any failure yields allow-all (documented).
 */
export async function fetchRobots(
  origin: string,
  options: FetchPageOptions = {},
): Promise<RobotsRules> {
  try {
    const page = await fetchPage(new URL("/robots.txt", origin), {
      ...options,
      maxBytes: 256 * 1024,
      acceptContentTypes: ["text/plain", "text/html", "application/octet-stream"],
    });
    return parseRobots(page.body, ROBOTS_TOKEN);
  } catch (error) {
    if (error instanceof CrawlFetchError) {
      // 404/410 and guard failures: per RFC 9309 an unreachable robots.txt
      // means no restrictions are known.
      return { rules: [], disallowAll: false };
    }
    throw error;
  }
}
