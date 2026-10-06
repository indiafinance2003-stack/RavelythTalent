"use client";

import { useState } from "react";
import { Alert, Button } from "@/components/ui/primitives";

const REPORT_REASONS = [
  ["scam_or_asks_for_money", "Scam or asks for money"],
  ["fake_or_already_filled", "Fake or already filled"],
  ["discriminatory", "Discriminatory"],
  ["other", "Other"],
] as const;

export function ReportJobButton({ jobId }: { jobId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<(typeof REPORT_REASONS)[number][0]>(
    "scam_or_asks_for_money",
  );
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/jobs/${jobId}/report`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason, note }),
      });
      const result = (await response.json()) as {
        ok: boolean;
        error?: { message?: string };
      };
      if (!response.ok || !result.ok) {
        setError(result.error?.message ?? "Could not submit the report.");
        return;
      }
      setMessage("Thank you. Your report has been sent to the moderation team.");
      setOpen(false);
      setNote("");
    } catch {
      setError("Could not submit the report. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={() => setOpen((value) => !value)}
      >
        Report this job
      </Button>
      {message ? <Alert className="mt-3" tone="success">{message}</Alert> : null}
      {error ? <Alert className="mt-3" tone="error">{error}</Alert> : null}
      {open ? (
        <form className="mt-3 space-y-3 rounded-xl border border-slate-200 p-4" onSubmit={submit}>
          <label className="block text-sm font-medium text-navy">
            Reason
            <select
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
              onChange={(event) => setReason(event.target.value as typeof reason)}
              value={reason}
            >
              {REPORT_REASONS.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium text-navy">
            Note (optional)
            <textarea
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              maxLength={1000}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              value={note}
            />
          </label>
          <div className="flex gap-2">
            <Button disabled={pending} size="sm" type="submit">
              {pending ? "Sending..." : "Send report"}
            </Button>
            <Button onClick={() => setOpen(false)} size="sm" type="button" variant="secondary">
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
