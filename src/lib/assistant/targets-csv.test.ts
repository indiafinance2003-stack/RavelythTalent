import { describe, expect, it } from "vitest";
import { normalizeTargetDomain, parseTargetCsv } from "./targets-csv";

describe("parseTargetCsv", () => {
  it("returns an empty array for a CSV with only a header", () => {
    expect(parseTargetCsv("Company Name,Website" + "\n")).toEqual([]);
  });

  it("returns an empty array for an empty string", () => {
    expect(parseTargetCsv("")).toEqual([]);
  });

  it("parses a valid row and normalizes the domain", () => {
    const rows = parseTargetCsv(
      "Company Name,Website,City,State,Industry,Source\n" +
      "Acme,Https://www.Acme.in/careers,Pune,Maharashtra,IT,import\n",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.error).toBeNull();
    expect(rows[0]?.data).toMatchObject({
      companyName: "Acme",
      domain: "acme.in",
      city: "Pune",
      industry: "IT",
    });
  });

  it("reports a missing required column", () => {
    expect(() => parseTargetCsv("Website\nacme.in\n")).toThrow(/Company Name and Website/i);
  });

  it("flags an invalid website and a duplicate domain", () => {
    const rows = parseTargetCsv(
      "Company Name,Website\n" +
      "Bad,not a website\n" +
      "Acme,acme.in\n" +
      "Acme 2,https://acme.in/contact\n",
    );
    expect(rows[0]?.error).toMatch(/valid http/i);
    expect(rows[1]?.data?.domain).toBe("acme.in");
    expect(rows[2]?.error).toMatch(/duplicate/i);
  });

  it("rejects a file larger than 2 MB", () => {
    expect(() => parseTargetCsv("a".repeat(2_000_001))).toThrow(/2 MB/);
  });
});

describe("normalizeTargetDomain", () => {
  it("normalizes schemes, www. and paths", () => {
    expect(normalizeTargetDomain("https://www.Acme.in/careers?x=1")).toBe("acme.in");
    expect(normalizeTargetDomain("acme.in")).toBe("acme.in");
  });

  it("rejects localhost and non-http schemes", () => {
    expect(normalizeTargetDomain("localhost")).toBe("");
    expect(normalizeTargetDomain("ftp://acme.in")).toBe("");
  });
});
