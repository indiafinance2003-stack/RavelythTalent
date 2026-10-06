import { AppError } from "@/lib/errors";

export function resolveSubscriptionCompanyId(input: {
  audience: string;
  userRole: string;
  requestedCompanyId?: string | null;
}): string | null {
  if (input.audience === "employer") {
    if (input.userRole !== "recruiter") {
      throw new AppError("This employer plan must be purchased by an employer account.", 403, "plan_owner_mismatch");
    }
    if (!input.requestedCompanyId) {
      throw new AppError("Choose a company to subscribe.", 400, "company_required");
    }
    return input.requestedCompanyId;
  }

  if (input.audience === "candidate") {
    if (input.userRole !== "job_seeker" || input.requestedCompanyId) {
      throw new AppError("This candidate plan must be purchased by a candidate account.", 403, "plan_owner_mismatch");
    }
    return null;
  }

  throw new AppError("This plan cannot be purchased as a subscription.", 400, "invalid_plan_audience");
}
