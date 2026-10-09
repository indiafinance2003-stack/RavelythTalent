import Link from "next/link";
import { desc, eq, gte, sql } from "drizzle-orm";
import { Alert, Button, Card, Input, PageHeader, Textarea } from "@/components/ui/primitives";
import { db } from "@/lib/db";
import { aiUsage, assistantFaq, assistantSettings } from "@/lib/db/schema";
import { getEnv } from "@/lib/env";
import {
  saveAssistantSettingsAction,
  saveFaqAction,
  toggleFaqAction,
} from "@/lib/assistant/settings-actions";

export const dynamic = "force-dynamic";

function monthStartUtc(): Date {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  if (!year || !month) throw new Error("Could not determine the India calendar month.");
  return new Date(`${year}-${month}-01T00:00:00+05:30`);
}

export default async function AssistantSettingsPage() {
  const [settingsRow, faqs, usageRows] = await Promise.all([
    db.select().from(assistantSettings).where(eq(assistantSettings.id, 1)).limit(1),
    db.select().from(assistantFaq).orderBy(desc(assistantFaq.updatedAt)).limit(200),
    db.select({
      total: sql<number>`coalesce(sum(${aiUsage.estimatedCostUsdMicros}), 0)::int`,
    }).from(aiUsage).where(gte(aiUsage.createdAt, monthStartUtc())),
  ]);
  const settings = settingsRow[0];
  const env = getEnv();
  const capUsd = settings?.monthlySpendCapUsd ?? 0;
  const spendMicros = usageRows[0]?.total ?? 0;
  const configured = Boolean(env.ANTHROPIC_API_KEY);

  return (
    <div className="space-y-6">
      <PageHeader title="Assistant settings and FAQ" description="AI is optional. Inbox and CRM features remain available without an AI provider key." />
      <nav aria-label="Assistant sections" className="flex flex-wrap gap-4 text-sm font-semibold">
        <Link className="text-royal hover:underline" href="/admin/assistant">Inbox</Link>
        <Link className="text-royal hover:underline" href="/admin/assistant/leads">Company leads</Link>
        <Link className="text-royal hover:underline" href="/admin/assistant/campaigns">Campaigns</Link>
        <Link className="text-royal hover:underline" href="/admin/assistant/targets">Targets</Link>
        <Link className="text-royal hover:underline" href="/admin/assistant/contact-forms">Contact forms</Link>
        <Link className="text-royal hover:underline" href="/admin/assistant/settings">Settings and FAQ</Link>
      </nav>
      <Card className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-navy">AI and sending controls</h2>
          <p className="text-sm text-slate-600">AI drafts are never sent automatically. Campaign messages require separate human approval.</p>
        </div>
        {!configured ? <Alert tone="info">Add an API key to enable AI. The key is read only from the server environment and is never shown here.</Alert> : null}
        <p className="rounded-xl bg-slate-50 p-3 text-sm font-semibold text-navy">
          Month-to-date AI spend: ${(spendMicros / 1_000_000).toFixed(4)} / ${capUsd.toFixed(2)}
          {!settings?.aiEnabled || !configured ? " · AI is in manual mode" : " · AI enabled"}
        </p>
        <form action={saveAssistantSettingsAction} className="grid gap-4 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm font-semibold text-navy sm:col-span-2">
            <input defaultChecked={Boolean(settings?.aiEnabled && configured)} disabled={!configured} name="aiEnabled" type="checkbox" />
            Enable optional AI features
          </label>
          <label className="text-sm font-semibold text-navy">Model<Input className="mt-1" disabled value={settings?.model ?? "claude-haiku-4-5"} /></label>
          <label className="text-sm font-semibold text-navy">Monthly spend cap (USD)<Input className="mt-1" defaultValue={capUsd} max={100000} min={0} name="monthlySpendCapUsd" required type="number" /></label>
          <label className="text-sm font-semibold text-navy">Campaign daily cap (max 40 per sender)<Input className="mt-1" defaultValue={settings?.dailySendCap ?? 15} max={40} min={1} name="dailySendCap" required type="number" /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm font-semibold text-navy">Send window start (IST)<Input className="mt-1" defaultValue={settings?.sendWindowStart ?? "10:00"} name="sendWindowStart" required type="time" /></label>
            <label className="text-sm font-semibold text-navy">Send window end (IST)<Input className="mt-1" defaultValue={settings?.sendWindowEnd ?? "17:00"} name="sendWindowEnd" required type="time" /></label>
          </div>
          <label className="text-sm font-semibold text-navy">Mark leads as no reply after (days)<Input className="mt-1" defaultValue={settings?.noReplyAfterDays ?? 3} max={90} min={1} name="noReplyAfterDays" required type="number" /></label>
          <label className="text-sm font-semibold text-navy sm:col-span-2">Business description for AI only<Textarea className="mt-1" defaultValue={settings?.businessDescription ?? ""} maxLength={5000} name="businessDescription" rows={4} /></label>
          <label className="text-sm font-semibold text-navy sm:col-span-2">Email signature<Textarea className="mt-1" defaultValue={settings?.signatureText ?? ""} maxLength={2000} name="signatureText" rows={3} /></label>
          <label className="text-sm font-semibold text-navy sm:col-span-2">Opt-out confirmation text<Textarea className="mt-1" defaultValue={settings?.optOutText ?? "Reply to this email with unsubscribe to opt out."} maxLength={500} name="optOutText" required rows={2} /></label>
          <label className="flex items-center gap-2 text-sm font-semibold text-navy">
            <input defaultChecked={Boolean(settings?.sendingPaused)} name="sendingPaused" type="checkbox" />
            Pause all outreach sends
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold text-navy">
            <input defaultChecked={Boolean(settings?.digestEnabled)} name="digestEnabled" type="checkbox" />
            Email a daily operations digest
          </label>
          <label className="text-sm font-semibold text-navy sm:col-span-2">Digest recipient email (optional override)<Input className="mt-1" defaultValue={settings?.digestEmail ?? ""} maxLength={254} name="digestEmail" placeholder="Leave blank for the first active admin" type="email" /></label>
          <div className="sm:col-span-2"><Button type="submit">Save assistant settings</Button></div>
        </form>
      </Card>

      <Card className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-navy">FAQ knowledge base</h2>
          <p className="text-sm text-slate-600">Only active entries are sent to the AI provider when drafting. Do not add personal, candidate, resume, payment, or secret data.</p>
        </div>
        <form action={saveFaqAction} className="space-y-3 rounded-xl border border-slate-200 p-4">
          <label className="block text-sm font-semibold text-navy">Question<Input className="mt-1" maxLength={1000} name="question" required /></label>
          <label className="block text-sm font-semibold text-navy">Answer<Textarea className="mt-1" maxLength={5000} name="answer" required rows={4} /></label>
          <Button type="submit" variant="secondary">Add FAQ entry</Button>
        </form>
        {faqs.length ? (
          <div className="space-y-3">
            {faqs.map((faq) => (
              <div className="space-y-3 rounded-xl border border-slate-200 p-4" key={faq.id}>
                <form action={saveFaqAction} className="space-y-3">
                  <input name="id" type="hidden" value={faq.id} />
                  <label className="block text-sm font-semibold text-navy">Question<Input className="mt-1" maxLength={1000} name="question" required defaultValue={faq.question} /></label>
                  <label className="block text-sm font-semibold text-navy">Answer<Textarea className="mt-1" maxLength={5000} name="answer" required rows={4} defaultValue={faq.answer} /></label>
                  <Button size="sm" type="submit" variant="secondary">Save FAQ</Button>
                </form>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-slate-500">{faq.isActive ? "Included in AI prompts" : "Inactive"}</p>
                  <form action={toggleFaqAction}><input name="id" type="hidden" value={faq.id} /><input name="isActive" type="hidden" value={String(!faq.isActive)} /><Button size="sm" type="submit" variant="secondary">{faq.isActive ? "Deactivate" : "Activate"}</Button></form>
                </div>
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-slate-500">No FAQ entries yet.</p>}
      </Card>
    </div>
  );
}
