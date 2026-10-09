import { describe, expect, it } from "vitest";
import { fetchRobots, isPathAllowed, parseRobots, robotsAllows } from "./robots";

describe("parseRobots", () => {
  it("matches our own user-agent group", () => {
    const rules = parseRobots(
      "User-agent: ravelythtalentbot\nDisallow: /private\n\nUser-agent: *\nDisallow: /",
      "ravelythtalentbot",
    );
    expect(rules.disallowAll).toBe(false);
    expect(isPathAllowed(rules, "/private/x")).toBe(false);
    expect(isPathAllowed(rules, "/jobs")).toBe(true);
  });

  it("falls back to the wildcard group", () => {
    const rules = parseRobots("User-agent: *\nDisallow: /admin", "ravelythtalentbot");
    expect(isPathAllowed(rules, "/admin")).toBe(false);
    expect(isPathAllowed(rules, "/")).toBe(true);
  });

  it("detects a site-wide disallow", () => {
    const rules = parseRobots("User-agent: *\nDisallow: /", "ravelythtalentbot");
    expect(rules.disallowAll).toBe(true);
    expect(robotsAllows(rules, "/anything")).toBe(false);
  });

  it("lets an Allow override a shorter Disallow", () => {
    const rules = parseRobots(
      "User-agent: *\nDisallow: /cgi\nAllow: /cgi/public",
      "ravelythtalentbot",
    );
    expect(isPathAllowed(rules, "/cgi/private")).toBe(false);
    expect(isPathAllowed(rules, "/cgi/public")).toBe(true);
  });

  it("allows everything when robots.txt is empty", () => {
    const rules = parseRobots("", "ravelythtalentbot");
    expect(robotsAllows(rules, "/jobs")).toBe(true);
  });
});

describe("fetchRobots", () => {
  it("parses a fetched robots.txt", async () => {
    const fetchFn = (async () => new Response(
      "User-agent: *\nDisallow: /careers",
      { status: 200, headers: { "content-type": "text/plain" } },
    )) as unknown as typeof fetch;
    const rules = await fetchRobots("https://example.in", {
      fetchFn,
      resolve: async () => ["93.184.216.34"],
    });
    expect(isPathAllowed(rules, "/careers")).toBe(false);
  });

  it("treats a missing robots.txt as allow-all", async () => {
    const fetchFn = (async () => new Response(null, { status: 404 })) as unknown as typeof fetch;
    const rules = await fetchRobots("https://example.in", {
      fetchFn,
      resolve: async () => ["93.184.216.34"],
    });
    expect(robotsAllows(rules, "/anything")).toBe(true);
  });
});
