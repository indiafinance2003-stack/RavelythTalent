import { describe, expect, it } from "vitest";
import { parseLeadCsv } from "./leads-csv";

describe("parseLeadCsv", () => {
  it("maps named columns, normalizes email, and preserves quoted commas", () => {
    const rows = parseLeadCsv(
      'Company Name,Contact Person,Contact Email,City\n"Acme, India",Riya,RIYA@EXAMPLE.COM,Mumbai\n',
    );
    expect(rows).toEqual([{
      row: 2,
      data: expect.objectContaining({
        company: "Acme, India",
        contactName: "Riya",
        email: "riya@example.com",
        city: "Mumbai",
      }),
      error: null,
    }]);
  });

  it("reports invalid and duplicate email rows without discarding valid rows", () => {
    const rows = parseLeadCsv(
      "Company Name,Contact Email\nAcme,valid@example.com\nBad,not-an-email\nDuplicate,VALID@example.com\n",
    );
    expect(rows.map(({ error }) => error)).toEqual([
      null,
      expect.stringContaining("email"),
      "Duplicate email in this CSV.",
    ]);
  });

  it("requires the company and email headers", () => {
    expect(() => parseLeadCsv("Name,Phone\nA,123")).toThrow(
      "CSV must include Company Name and Contact Email columns.",
    );
  });
});
