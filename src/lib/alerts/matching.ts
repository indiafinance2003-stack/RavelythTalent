export type JobAlertMatchCriteria = {
  q?: string;
  location?: string;
  locations?: string[];
  category?: string;
  roles?: string[];
  skills?: string[];
};

export type AlertMatchJob = {
  title: string;
  description?: string | null;
  city?: string | null;
  state?: string | null;
  locations?: string[];
  workMode?: string | null;
  category?: string | null;
  skills?: string[];
};

function normalized(value: string): string {
  return value.toLocaleLowerCase("en-IN").trim();
}

function includesAny(needles: string[], haystack: string): boolean {
  const text = normalized(haystack);
  return needles.some((needle) => {
    const item = normalized(needle);
    return item.length > 0 && text.includes(item);
  });
}

export function matchesJobAlert(
  criteria: JobAlertMatchCriteria,
  job: AlertMatchJob,
): boolean {
  const text = [job.title, job.description ?? "", ...(job.skills ?? [])].join(" ");
  const roleTerms = criteria.roles?.filter(Boolean) ?? [];
  const skillTerms = criteria.skills?.filter(Boolean) ?? [];
  const q = criteria.q?.trim();
  if (q && !includesAny(q.split(/\s+/), text)) return false;
  if (roleTerms.length && !includesAny(roleTerms, job.title)) return false;
  if (skillTerms.length && !includesAny(skillTerms, text)) return false;
  if (
    criteria.category &&
    normalized(job.category ?? "") !== normalized(criteria.category)
  ) return false;
  const locations = [
    ...(criteria.locations ?? []),
    ...(criteria.location ? [criteria.location] : []),
  ].filter(Boolean);
  if (locations.length) {
    const jobLocations = [
      job.city ?? "",
      job.state ?? "",
      ...(job.locations ?? []),
      job.workMode === "remote" ? "remote" : "",
    ];
    if (!locations.some((location) =>
      jobLocations.some((jobLocation) =>
        normalized(jobLocation).includes(normalized(location)),
      ),
    )) return false;
  }
  return true;
}

export function mayEmailJobAlerts(user: {
  role: string;
  status: string;
  emailVerifiedAt: Date | null;
  deletedAt: Date | null;
  jobAlertEmailConsent: boolean;
}): boolean {
  return user.role === "job_seeker" &&
    user.status === "active" &&
    user.emailVerifiedAt !== null &&
    user.deletedAt === null &&
    user.jobAlertEmailConsent;
}

export function canSendDailyAlertEmail(
  lastSentAt: Date | null,
  now: Date,
): boolean {
  if (!lastSentAt) return true;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(lastSentAt) !== formatter.format(now);
}

export function jobAlertOptOutState(): {
  consent: false;
  active: false;
} {
  return { consent: false, active: false };
}

export function isWeeklyAlertDay(now: Date): boolean {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
  }).format(now) === "Mon";
}
