import type { Metadata } from "next";
import Link from "next/link";
import { Alert, Button, Card, PageHeader } from "@/components/ui/primitives";
import { saveSocialSettingsAction } from "@/lib/social/settings-actions";
import { getSocialConnectionStatuses, getSocialSettings } from "@/lib/social/settings";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Social settings" };

const inputClass =
  "mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-navy focus:border-royal focus:outline-none focus:ring-2 focus:ring-royal/25";

export default async function AdminSocialSettingsPage() {
  const settings = await getSocialSettings();
  const connections = getSocialConnectionStatuses(settings);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Social auto-posting settings"
        description="Master switch, platforms, caps, posting window and caption template. Credentials come from the server environment only."
        action={
          <Link
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-navy hover:border-royal"
            href="/admin/social"
          >
            Back to queue
          </Link>
        }
      />

      {connections.some((connection) => !connection.configured) ? (
        <Alert tone="info" title="Some platforms are not configured">
          Missing credentials show &quot;Not configured&quot; and never break the admin area. Add
          the SOCIAL_* environment variables on the server to connect them.
        </Alert>
      ) : null}

      <Card>
        <form action={saveSocialSettingsAction} className="grid gap-4 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm font-semibold text-navy sm:col-span-2">
            <input defaultChecked={settings.enabled} name="enabled" type="checkbox" />
            Master switch — enable automatic posting (default off)
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold text-navy">
            <input defaultChecked={settings.facebookEnabled} name="facebookEnabled" type="checkbox" />
            Facebook
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold text-navy">
            <input
              defaultChecked={settings.instagramEnabled}
              name="instagramEnabled"
              type="checkbox"
            />
            Instagram
          </label>

          <label className="text-sm font-semibold text-navy">
            Max posts per day, per platform
            <input
              className={inputClass}
              defaultValue={settings.maxPostsPerDay}
              max={50}
              min={1}
              name="maxPostsPerDay"
              type="number"
            />
          </label>
          <label className="text-sm font-semibold text-navy">
            Minimum minutes between posts
            <input
              className={inputClass}
              defaultValue={settings.minMinutesBetweenPosts}
              max={1440}
              min={1}
              name="minMinutesBetweenPosts"
              type="number"
            />
          </label>
          <label className="text-sm font-semibold text-navy">
            Posting window start (IST)
            <input
              className={inputClass}
              defaultValue={settings.windowStart}
              name="windowStart"
              type="time"
            />
          </label>
          <label className="text-sm font-semibold text-navy">
            Posting window end (IST)
            <input
              className={inputClass}
              defaultValue={settings.windowEnd}
              name="windowEnd"
              type="time"
            />
          </label>
          <label className="text-sm font-semibold text-navy sm:col-span-2">
            Hashtags (space or comma separated)
            <input
              className={inputClass}
              defaultValue={settings.hashtags}
              maxLength={500}
              name="hashtags"
              placeholder="hiring jobs india remote"
            />
          </label>
          <label className="text-sm font-semibold text-navy sm:col-span-2">
            Caption template
            <textarea
              className={inputClass}
              defaultValue={settings.captionTemplate}
              maxLength={2000}
              name="captionTemplate"
              rows={3}
            />
            <span className="mt-1 block text-xs font-normal text-slate-600">
              {"Variables: {{title}} {{company}} {{city}} {{location}} {{job_type}} {{work_mode}} {{salary}} {{link}}. The salary variable is empty when the salary is hidden; the link carries UTM parameters."}
            </span>
          </label>

          <label className="flex items-center gap-2 text-sm font-semibold text-red-700 sm:col-span-2">
            <input defaultChecked={settings.pauseAll} name="pauseAll" type="checkbox" />
            Pause all — kill switch that stops every platform immediately
          </label>

          <div className="sm:col-span-2">
            <Button type="submit">Save settings</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

