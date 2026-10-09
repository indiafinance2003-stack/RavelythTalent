import { db } from "@/lib/db";
import { assistantSettings, auditLogs } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { Alert, Button } from "@/components/ui/primitives";
import { setSendingPausedAction } from "@/lib/assistant/settings-actions";
import { appUrl } from "@/lib/email/urls";

export async function SendingPausedBanner() {
  const [settings, lastAudit] = await Promise.all([
    db.select().from(assistantSettings).where(eq(assistantSettings.id, 1)).limit(1),
    db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.action, "assistant.sending_paused"),
          eq(auditLogs.entityType, "assistant_settings"),
        ),
      )
      .orderBy(desc(auditLogs.createdAt))
      .limit(1),
  ]);
  if (!settings[0]?.sendingPaused) return null;

  const pausedBy = lastAudit[0]?.description ?? "An administrator paused all outreach sends.";
  return (
    <Alert tone="error" title="Outreach is paused — no emails are being sent" className="mb-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm opacity-90">{pausedBy}</p>
        <form action={setSendingPausedAction}>
          <input type="hidden" name="paused" value="false" />
          <Button type="submit" variant="danger">Resume sending</Button>
        </form>
      </div>
      <p className="mt-2 text-xs opacity-80">
        Queued campaign messages and automatic replies are waiting and will resume once sending is
        re-enabled. Manual admin actions (target review, drafts, settings) still work. See{" "}
        <a className="underline" href={appUrl("/admin/assistant/settings")}>
          Outreach settings
        </a>
        .
      </p>
    </Alert>
  );
}