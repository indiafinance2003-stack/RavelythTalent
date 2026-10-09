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

  it("omits the history key when the CSV has no history columns", () => {
    const rows = parseLeadCsv(
      "Company Name,Contact Email\nAcme,acme@example.com\n",
    );
    expect(rows).toEqual([{
      row: 2,
      data: expect.objectContaining({ company: "Acme" }),
      error: null,
    }]);
    expect(rows[0]).not.toHaveProperty("history");
  });
});

describe("parseLeadCsv outreach history", () => {
  const noonIst = (isoDay: string) => new Date(`${isoDay}T06:30:00.000Z`);

  it("maps status text (case-insensitive, separator-insensitive) to lead statuses", () => {
    const rows = parseLeadCsv(
      [
        "Company,Email,Status,Last Contacted",
        "A,a@example.com,Email Sent,07/10/2026",
        "B,b@example.com,NOT contacted,",
        "C,c@example.com,do-not-contact,",
        "D,d@example.com,Opted_Out,",
        "E,e@example.com,Interested,",
        "F,f@example.com,Replied,",
        "G,g@example.com,Bounced,",
        "H,h@example.com,Some Unknown Value,",
      ].join("\n"),
    );
    expect(rows.map((row) => row.error)).toEqual([null, null, null, null, null, null, null, null]);
    expect(rows.map((row) => row.history?.status)).toEqual([
      "emailed",
      "new",
      "do_not_contact",
      "do_not_contact",
      "interested",
      "replied",
      "bounced",
      null,
    ]);
    expect(rows[0]?.history?.lastContactedAt?.getTime()).toBe(noonIst("2026-10-07").getTime());
  });

  it("parses every supported date format as 12:00 noon IST", () => {
    const rows = parseLeadCsv(
      [
        "Company,Email,Status,Last Contacted",
        "A,a@example.com,Contacted,07/10/2026",
        "B,b@example.com,Contacted,07-10-2026",
        "C,c@example.com,Contacted,07.10.2026",
        "D,d@example.com,Contacted,2026-10-07",
      ].join("\n"),
    );
    expect(rows.map((row) => row.error)).toEqual([null, null, null, null]);
    expect(rows.every((row) => row.history?.lastContactedAt?.getTime() === noonIst("2026-10-07").getTime()))
      .toBe(true);
  });

  it("treats a date without a status as emailed", () => {
    const rows = parseLeadCsv(
      "Company,Email,Last Contacted\nAcme,acme@example.com,07/10/2026\n",
    );
    expect(rows[0]?.history).toEqual({
      status: "emailed",
      lastContactedAt: noonIst("2026-10-07"),
    });
  });

  it("rejects invalid calendar dates and unparsable values with the date error", () => {
    const rows = parseLeadCsv(
      [
        "Company,Email,Last Contacted",
        "A,a@example.com,31/02/2026",
        "B,b@example.com,not-a-date",
        "C,c@example.com,2026-13-01",
      ].join("\n"),
    );
    expect(rows.map((row) => row.error)).toEqual([
      "Last Contacted must be a date like 07/10/2026 or 2026-10-07.",
      "Last Contacted must be a date like 07/10/2026 or 2026-10-07.",
      "Last Contacted must be a date like 07/10/2026 or 2026-10-07.",
    ]);
  });

  it("rejects a row marked emailed without a Last Contacted date", () => {
    const rows = parseLeadCsv(
      [
        "Company,Email,Status,Last Contacted",
        "A,a@example.com,emailed,",
        "B,b@example.com,emailed,07/10/2026",
        "C,c@example.com,replied,",
      ].join("\n"),
    );
    expect(rows.map((row) => row.error)).toEqual([
      "Rows marked as emailed need a Last Contacted date.",
      null,
      null,
    ]);
    expect(rows[2]?.history).toEqual({ status: "replied", lastContactedAt: null });
  });

  it("keeps non-emailed statuses without dates and provides history on every row", () => {
    const rows = parseLeadCsv(
      [
        "Company,Email,Outreach Status",
        "A,a@example.com,New",
        "B,b@example.com,",
      ].join("\n"),
    );
    expect(rows[0]?.history).toEqual({ status: "new", lastContactedAt: null });
    expect(rows[1]?.history).toEqual({ status: null, lastContactedAt: null });
  });

  it("maps 'no reply' and 'no response' status text to no_reply", () => {
    const rows = parseLeadCsv(
      [
        "Company,Email,Status",
        "A,a@example.com,No Reply",
        "B,b@example.com,no_response",
        "C,c@example.com,No response",
      ].join("\n"),
    );
    expect(rows.map((row) => row.error)).toEqual([null, null, null]);
    expect(rows.map((row) => row.history?.status)).toEqual(["no_reply", "no_reply", "no_reply"]);
  });
});
