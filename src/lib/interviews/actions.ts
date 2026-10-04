"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireApiRole } from "@/lib/auth/current-user";
import { AppError } from "@/lib/errors";
import { assertSameOrigin } from "@/lib/security";
import {
  confirmCandidateInterview,
  scheduleApplicationInterview,
} from "./service";

const scheduleSchema = z.object({
  applicationId: z.uuid(),
  scheduledAt: z.string().min(16).max(16),
  durationMinutes: z.coerce.number().int().min(15).max(240),
  mode: z.enum(["video", "phone", "in_person"]),
  location: z.string().trim().max(500).optional(),
  meetingLink: z.string().trim().max(1000).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export async function scheduleInterviewAction(formData: FormData): Promise<void> {
  await assertSameOrigin();
  const recruiter = await requireApiRole("recruiter");
  const parsed = scheduleSchema.safeParse({
    applicationId: formData.get("applicationId"),
    scheduledAt: formData.get("scheduledAt"),
    durationMinutes: formData.get("durationMinutes"),
    mode: formData.get("mode"),
    location: String(formData.get("location") ?? "").trim() || undefined,
    meetingLink: String(formData.get("meetingLink") ?? "").trim() || undefined,
    notes: String(formData.get("notes") ?? "").trim() || undefined,
  });
  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0]?.message ?? "Invalid interview details.", 422);
  }
  const scheduledAt = new Date(`${parsed.data.scheduledAt}:00+05:30`);
  if (!Number.isFinite(scheduledAt.getTime())) {
    throw new AppError("Choose a valid interview date and time.", 422);
  }
  const location = parsed.data.location || null;
  const meetingLink = parsed.data.meetingLink || null;
  if (parsed.data.mode === "video" && !meetingLink) {
    throw new AppError("Add the video meeting link.", 422);
  }
  if (parsed.data.mode === "in_person" && !location) {
    throw new AppError("Add the interview location.", 422);
  }
  if (meetingLink) {
    let url: URL;
    try {
      url = new URL(meetingLink);
    } catch {
      throw new AppError("Meeting link must be a valid URL.", 422);
    }
    if (!["http:", "https:"].includes(url.protocol)) {
      throw new AppError("Meeting link must use HTTP or HTTPS.", 422);
    }
  }

  await scheduleApplicationInterview({
    applicationId: parsed.data.applicationId,
    recruiterId: recruiter.id,
    scheduledAt,
    durationMinutes: parsed.data.durationMinutes,
    mode: parsed.data.mode,
    location,
    meetingLink,
    notes: parsed.data.notes || null,
  });
  revalidatePath("/recruiter/interviews");
  revalidatePath("/recruiter/applications");
  revalidatePath("/dashboard/interviews");
}

const confirmSchema = z.object({
  interviewId: z.uuid(),
  candidateNotes: z.string().trim().max(1000).optional(),
});

export async function confirmInterviewAction(formData: FormData): Promise<void> {
  await assertSameOrigin();
  const candidate = await requireApiRole("job_seeker");
  const parsed = confirmSchema.safeParse({
    interviewId: formData.get("interviewId"),
    candidateNotes: String(formData.get("candidateNotes") ?? "").trim() || undefined,
  });
  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0]?.message ?? "Invalid confirmation.", 422);
  }
  await confirmCandidateInterview({
    interviewId: parsed.data.interviewId,
    candidateUserId: candidate.id,
    candidateNotes: parsed.data.candidateNotes ?? null,
  });
  revalidatePath("/dashboard/interviews");
  revalidatePath("/recruiter/applications");
}
