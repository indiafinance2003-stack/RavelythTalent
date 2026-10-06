import { describe, expect, it } from "vitest";
import {
  canSendDailyAlertEmail,
  jobAlertOptOutState,
  matchesJobAlert,
  mayEmailJobAlerts,
} from "./matching";

describe("job-alert matching and delivery policy", () => {
  it("matches profile role, skill and preferred location together", () => {
    const profileCriteria = {
      roles: ["Frontend Engineer"],
      skills: ["React"],
      locations: ["Bengaluru"],
    };
    expect(matchesJobAlert(profileCriteria, {
      title: "Frontend Engineer",
      description: "Build accessible web experiences",
      city: "Bengaluru",
      skills: ["React", "TypeScript"],
    })).toBe(true);
    expect(matchesJobAlert(profileCriteria, {
      title: "Frontend Engineer",
      city: "Mumbai",
      skills: ["React"],
    })).toBe(false);
    expect(matchesJobAlert(profileCriteria, {
      title: "Backend Engineer",
      city: "Bengaluru",
      skills: ["React"],
    })).toBe(false);
  });

  it("requires explicit consent and a verified active candidate for email", () => {
    const eligible = {
      role: "job_seeker",
      status: "active",
      emailVerifiedAt: new Date("2026-01-01T00:00:00Z"),
      deletedAt: null,
      jobAlertEmailConsent: true,
    };
    expect(mayEmailJobAlerts(eligible)).toBe(true);
    expect(mayEmailJobAlerts({ ...eligible, jobAlertEmailConsent: false })).toBe(false);
    expect(mayEmailJobAlerts({ ...eligible, role: "recruiter" })).toBe(false);
    expect(mayEmailJobAlerts({ ...eligible, status: "suspended" })).toBe(false);
    expect(mayEmailJobAlerts({ ...eligible, emailVerifiedAt: null })).toBe(false);
  });

  it("enforces the one-email-per-candidate-per-India-calendar-day cap", () => {
    const morning = new Date("2026-10-06T03:00:00.000Z");
    const sameIndianDayEvening = new Date("2026-10-06T17:00:00.000Z");
    const nextIndianDay = new Date("2026-10-06T19:00:00.000Z");
    expect(canSendDailyAlertEmail(null, morning)).toBe(true);
    expect(canSendDailyAlertEmail(morning, sameIndianDayEvening)).toBe(false);
    expect(canSendDailyAlertEmail(morning, nextIndianDay)).toBe(true);
  });

  it("treats unsubscribe as a global email opt-out", () => {
    const optOut = jobAlertOptOutState();
    const accountAfterUnsubscribe = {
      role: "job_seeker",
      status: "active",
      emailVerifiedAt: new Date("2026-01-01T00:00:00Z"),
      deletedAt: null,
      jobAlertEmailConsent: optOut.consent,
    };
    expect(optOut.active).toBe(false);
    expect(mayEmailJobAlerts(accountAfterUnsubscribe)).toBe(false);
  });
});
