import { describe, expect, it } from "vitest";
import { shouldPauseJobForReports } from "./reports";

describe("automatic job report pause threshold", () => {
  it("does not pause before three distinct reporters", () => {
    expect(shouldPauseJobForReports(0)).toBe(false);
    expect(shouldPauseJobForReports(1)).toBe(false);
    expect(shouldPauseJobForReports(2)).toBe(false);
  });

  it("pauses at three distinct reporters and remains true above threshold", () => {
    expect(shouldPauseJobForReports(3)).toBe(true);
    expect(shouldPauseJobForReports(4)).toBe(true);
  });
});
