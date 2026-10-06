import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { adminFormErrorUrl } from "./form-error-message";

describe("admin form error redirects", () => {
  it("returns the real client-safe validation message for inline display", () => {
    expect(adminFormErrorUrl(
      "/admin/billing",
      new AppError("Choose an active plan that matches the subscription owner.", 422),
    )).toBe("/admin/billing?adminError=Choose%20an%20active%20plan%20that%20matches%20the%20subscription%20owner.");
  });

  it("maps Zod validation errors", () => {
    const parsed = z.string().min(2).safeParse("x");
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const url = adminFormErrorUrl("/admin/plans", parsed.error);
    expect(url?.split("adminError=")[1]).toBe(encodeURIComponent(parsed.error.issues[0]!.message));
  });

  it("does not turn server failures into form validation messages", () => {
    expect(adminFormErrorUrl("/admin/plans", new AppError("Unexpected failure.", 500)))
      .toBeNull();
  });
});
