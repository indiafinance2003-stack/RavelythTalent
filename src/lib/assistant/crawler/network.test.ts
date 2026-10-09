import { describe, expect, it } from "vitest";
import {
  CrawlFetchError,
  assertSafeUrl,
  fetchPage,
  isBlockedAddress,
  isBlockedHostname,
  isBlockedIPv4,
  isBlockedIPv6,
} from "./network";

describe("SSRF address screening", () => {
  it.each([
    "0.0.0.0", "10.1.2.3", "127.0.0.1", "169.254.169.254", "172.16.0.1",
    "172.31.255.255", "192.0.0.1", "192.0.2.5", "192.168.1.1", "198.18.0.1",
    "198.51.100.7", "203.0.113.9", "100.64.0.1", "224.0.0.1", "255.255.255.255",
  ])("blocks private/reserved IPv4 %s", (ip) => {
    expect(isBlockedIPv4(ip)).toBe(true);
    expect(isBlockedAddress(ip)).toBe(true);
  });

  it.each(["8.8.8.8", "1.1.1.1", "203.0.112.1", "93.184.216.34"])(
    "allows public IPv4 %s",
    (ip) => {
      expect(isBlockedIPv4(ip)).toBe(false);
    },
  );

  it.each([
    "::1", "::", "fe80::1", "fc00::1", "fd12:3456::1", "ff02::1",
    "::ffff:127.0.0.1", "::ffff:10.0.0.1", "2001:db8::1", "64:ff9b::192.168.0.1",
  ])("blocks private/reserved IPv6 %s", (ip) => {
    expect(isBlockedIPv6(ip)).toBe(true);
    expect(isBlockedAddress(ip)).toBe(true);
  });

  it("allows a public IPv6 address", () => {
    expect(isBlockedIPv6("2606:4700:4700::1111")).toBe(false);
  });

  it("rejects malformed addresses", () => {
    expect(isBlockedAddress("not-an-ip")).toBe(true);
    expect(isBlockedIPv4("999.1.1.1")).toBe(true);
  });

  it("rejects obviously internal hostnames", () => {
    expect(isBlockedHostname("localhost")).toBe(true);
    expect(isBlockedHostname("db.internal")).toBe(true);
    expect(isBlockedHostname("example.in")).toBe(false);
  });
});

describe("assertSafeUrl", () => {
  it("accepts a public http(s) URL", async () => {
    const check = await assertSafeUrl("https://example.in/contact", async () => ["93.184.216.34"]);
    expect(check.url.hostname).toBe("example.in");
  });

  it("rejects non-http protocols", async () => {
    await expect(assertSafeUrl("ftp://example.in")).rejects.toBeInstanceOf(CrawlFetchError);
  });

  it("rejects ports other than 80 and 443", async () => {
    await expect(assertSafeUrl("http://example.in:8080/")).rejects.toBeInstanceOf(CrawlFetchError);
  });

  it("rejects URLs with embedded credentials", async () => {
    await expect(assertSafeUrl("http://user:pass@example.in/")).rejects.toBeInstanceOf(CrawlFetchError);
  });

  it("rejects a host that resolves to a private address", async () => {
    await expect(assertSafeUrl("https://evil.in/", async () => ["10.0.0.5"]))
      .rejects.toBeInstanceOf(CrawlFetchError);
  });
});

describe("fetchPage guards", () => {
  const resolve = async () => ["93.184.216.34"];

  it("returns the body for a text/html page", async () => {
    const fetchFn = (async () => new Response("<html>ok</html>", {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    })) as unknown as typeof fetch;
    const page = await fetchPage("https://example.in/", { resolve, fetchFn });
    expect(page.body).toContain("ok");
  });

  it("re-validates every redirect hop and blocks a redirect to a private host", async () => {
    const fetchFn = (async () => new Response(null, {
      status: 302,
      headers: { location: "http://169.254.169.254/latest/meta-data/" },
    })) as unknown as typeof fetch;
    await expect(fetchPage("https://example.in/", { resolve, fetchFn }))
      .rejects.toThrow(/private address|crawled/i);
  });

  it("rejects a non-html content type", async () => {
    const fetchFn = (async () => new Response("{}", {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
    await expect(fetchPage("https://example.in/", { resolve, fetchFn }))
      .rejects.toThrow(/text\/html/i);
  });

  it("enforces the maximum body size", async () => {
    const fetchFn = (async () => new Response("x".repeat(2048), {
      status: 200,
      headers: { "content-type": "text/html" },
    })) as unknown as typeof fetch;
    await expect(fetchPage("https://example.in/", { resolve, fetchFn, maxBytes: 100 }))
      .rejects.toThrow(/size limit/i);
  });

  it("stops after the maximum number of redirects", async () => {
    const fetchFn = (async () => new Response(null, {
      status: 302,
      headers: { location: "https://example.in/loop" },
    })) as unknown as typeof fetch;
    await expect(fetchPage("https://example.in/", { resolve, fetchFn }))
      .rejects.toThrow(/redirects/i);
  });
});
