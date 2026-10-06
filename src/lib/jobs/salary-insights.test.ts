import { describe, expect, it } from "vitest";
import {
  buildSalaryInsightsQuery,
  SALARY_INSIGHT_MIN_SAMPLE,
} from "./salary-insights";

describe("salary insight aggregation", () => {
  it("aggregates display location instead of selecting ungrouped city/state", () => {
    const query = buildSalaryInsightsQuery().toSQL();
    expect(query.sql).toContain("min(trim(concat_ws");
    expect(query.sql).toContain('"jobs"."city"');
    expect(query.sql).toContain('"jobs"."state"');
  });

  it("continues to require five disclosed postings per group", () => {
    const query = buildSalaryInsightsQuery().toSQL();
    expect(SALARY_INSIGHT_MIN_SAMPLE).toBe(5);
    expect(query.sql).toContain("having count(*) >= $");
    expect(query.params).toContain(5);
  });
});
