import { Button, Input, Select, Textarea } from "@/components/ui/primitives";
import { saveCampaignAction } from "@/lib/assistant/campaign-actions";
import type { outreachCampaigns } from "@/lib/db/schema";

type MailAccountOption = { id: string; configured: boolean };

export function CampaignEditor({
  campaign,
  statuses,
  allowActivate = false,
}: {
  campaign?: typeof outreachCampaigns.$inferSelect;
  statuses: MailAccountOption[];
  allowActivate?: boolean;
}) {
  const followups = campaign?.followupSequence ?? [];
  const step2 = followups[0];
  const step3 = followups[1];

  return (
    <form action={saveCampaignAction} className="space-y-4">
      {campaign ? <input name="id" type="hidden" value={campaign.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold text-navy">
          Campaign name
          <Input className="mt-1" defaultValue={campaign?.name ?? ""} maxLength={200} name="name" required />
        </label>
        <label className="text-sm font-semibold text-navy">
          Sender account
          <Select className="mt-1" defaultValue={campaign?.senderAccountId ?? "gmail"} name="senderAccountId">
            {statuses.map((account) => (
              <option key={account.id} value={account.id}>
                {account.id}{account.configured ? "" : " (Not configured)"}
              </option>
            ))}
          </Select>
        </label>
        <label className="text-sm font-semibold text-navy sm:col-span-2">
          Subject template
          <Input className="mt-1" defaultValue={campaign?.subjectTemplate ?? "A hiring resource for {{company}}"} maxLength={998} name="subjectTemplate" required />
        </label>
        <label className="text-sm font-semibold text-navy sm:col-span-2">
          First email body
          <Textarea className="mt-1" defaultValue={campaign?.bodyTemplate ?? "Hi {{contact_name}},\n\nI am reaching out about hiring at {{company}} in {{city}}.\n\nIf you do not want to receive further emails, unsubscribe here: {{unsubscribe_url}}"} maxLength={20_000} name="bodyTemplate" required rows={8} />
        </label>
      </div>
      <p className="text-xs text-slate-500">
        Variables: {"{{company}}, {{contact_name}}, {{designation}}, {{city}}"}; include an explicit unsubscribe line with {"{{unsubscribe_url}}"} to activate.
      </p>
      <details className="rounded-xl border border-slate-200 p-4" open={Boolean(step2 || step3)}>
        <summary className="cursor-pointer font-semibold text-navy">
          Follow-up sequence (step 2 after 3 days; step 3 after 7 days from step 1)
        </summary>
        <div className="mt-4 grid gap-4">
          <label className="flex items-center gap-2 text-sm font-semibold text-navy">
            <input defaultChecked={step2?.enabled ?? false} name="step2Enabled" type="checkbox" /> Enable step 2
          </label>
          <label className="text-sm font-medium text-slate-700">
            Step 2 delay in days
            <Input defaultValue={step2?.delayDays ?? 3} max={60} min={1} name="step2DelayDays" required type="number" />
          </label>
          <Input aria-label="Step 2 subject" defaultValue={step2?.subject ?? "Following up"} maxLength={998} name="step2Subject" placeholder="Step 2 subject" />
          <Textarea aria-label="Step 2 body" defaultValue={step2?.body ?? "Hi {{contact_name}},\n\nA quick follow-up about {{company}}. Opt out: {{unsubscribe_url}}"} maxLength={20_000} name="step2Body" rows={5} />
          <label className="flex items-center gap-2 text-sm font-semibold text-navy">
            <input defaultChecked={step3?.enabled ?? false} name="step3Enabled" type="checkbox" /> Enable step 3
          </label>
          <label className="text-sm font-medium text-slate-700">
            Step 3 delay in days from step 1
            <Input defaultValue={step3?.delayDays ?? 7} max={60} min={1} name="step3DelayDays" required type="number" />
          </label>
          <Input aria-label="Step 3 subject" defaultValue={step3?.subject ?? "One last note"} maxLength={998} name="step3Subject" placeholder="Step 3 subject" />
          <Textarea aria-label="Step 3 body" defaultValue={step3?.body ?? "Hi {{contact_name}},\n\nOne last note about {{company}}. Opt out: {{unsubscribe_url}}"} maxLength={20_000} name="step3Body" rows={5} />
        </div>
      </details>
      <label className="flex items-center gap-2 text-sm font-semibold text-navy">
        <input defaultChecked={campaign?.autoApproveFollowups ?? false} name="autoApproveFollowups" type="checkbox" />
        Auto-approve follow-ups after I approve the first email
      </label>
      <details className="rounded-xl border border-slate-200 p-4" open={campaign?.followsUpPrevious ?? false}>
        <summary className="cursor-pointer font-semibold text-navy">Follow-up campaign mode</summary>
        <div className="mt-4 space-y-3">
          <label className="flex items-center gap-2 text-sm font-semibold text-navy">
            <input defaultChecked={campaign?.followsUpPrevious ?? false} name="followsUpPrevious" type="checkbox" />
            This campaign follows up an earlier email I sent outside the system
          </label>
          <label className="text-sm font-medium text-slate-700">
            Minimum days since last contact
            <Input defaultValue={campaign?.minDaysSinceLastContact ?? 3} max={60} min={2} name="minDaysSinceLastContact" required type="number" />
          </label>
          <p className="text-xs text-slate-500">
            When enabled, recently-emailed leads wait this many days before receiving the first email, which bypasses the usual 14-day gap.
          </p>
        </div>
      </details>
      <div className="flex flex-wrap gap-3">
        <Button type="submit">Save draft</Button>
        {allowActivate ? (
          <Button name="intent" type="submit" value="activate" variant="secondary">
            Save and activate
          </Button>
        ) : null}
      </div>
    </form>
  );
}
