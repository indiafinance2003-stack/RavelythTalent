import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, formatIndianDateTime } from "./utils";

describe("Indian timestamp formatting", () => {
  it("formats a UTC instant in the required Asia/Kolkata form", () => {
    const timestamp = new Date("2026-10-06T11:37:00.000Z");
    expect(formatIndianDateTime(timestamp)).toBe("06 Oct 2026, 5:07 pm IST");
    expect(formatDateTime(timestamp)).toBe("06 Oct 2026, 5:07 pm IST");
    expect(formatDate(timestamp)).toBe("06 Oct 2026, 5:07 pm IST");
  });

  it("renders invalid or absent timestamps as an em dash", () => {
    expect(formatIndianDateTime("not-a-date")).toBe("—");
    expect(formatIndianDateTime(null)).toBe("—");
  });
});
