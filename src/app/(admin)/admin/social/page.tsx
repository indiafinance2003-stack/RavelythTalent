import Link from "next/link";
import { and, count, desc, eq } from "drizzle-orm";
import { Alert, Badge, Button, Card, EmptyState, PageHeader, Select } from "@/components/ui/primitives";
import { db } from "@/lib/db";
import { jobs, socialPosts } from "@/lib/db/schema";
import {
  cancelSocialPostAction,
  postJobNowAction,
  retrySocialPostAction,
} from "@/lib/social/queue-actions";
import { setSocialPauseAction } from "@/lib/social/settings-actions";
import { getSocialConnectionStatuses, getSocialSettings } from "@/lib/social/settings";
import { formatDateTime } from "@/lib/utils";
import { z } from "zod";

export const dynamic = "force-dynamic";

type SearchParams = { platform?: string; status?: string };

const POST_STATUSES = [
  "queued",
  "publishing",
  "published",
  "failed",
  "cancelled",
  "skipped",
] as const;

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "neutral" | "brand"> = {
  queued: "brand",
  publishing: "brand",
  published: "success",
  failed: "danger",
  cancelled: "neutral",
  skipped: "warning",
};

export default async function AdminSocialPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const platform = z.enum(["facebook", "instagram"]).safeParse(params.platform).success
    ? params.platform
    : undefined;
  const status = (POST_STATUSES as readonly string[]).includes(params.status ?? "")
    ? params.status
    : undefined;

  const filters = [];
  if (platform) filters.push(eq(socialPosts.platform, platform as "facebook" | "instagram"));
  if (status) filters.push(eq(socialPosts.status, status as (typeof POST_STATUSES)[number]));

  const settings = await getSocialSettings();
  const connections = getSocialConnectionStatuses(settings);

  const [posts, statusCounts, eligibleJobs] = await Promise.all([
    db
      .select({ post: socialPosts, jobTitle: jobs.title, jobSlug: jobs.slug })
      .from(socialPosts)
      .innerJoin(jobs, eq(jobs.id, socialPosts.jobId))
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(socialPosts.updatedAt))
      .limit(200),
    db
      .select({ status: socialPosts.status, total: count() })
      .from(socialPosts)
      .groupBy(socialPosts.status),
    db
      .select({ id: jobs.id, title: jobs.title })
      .from(jobs)
      .where(eq(jobs.status, "published"))
      .orderBy(desc(jobs.publishedAt))
      .limit(50),
  ]);

  const countsByStatus = new Map(statusCounts.map((row) => [row.status, row.total]));
  const tokenErrors = connections.filter((connection) => connection.tokenError);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Social auto-posting"
        description="Publish new jobs to Ravelyth's Facebook Page and Instagram account. WhatsApp digest is manual."
        action={
          <div className="flex gap-2">
            <Link
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-navy hover:border-royal"
              href="/admin/social/settings"
            >
              Settings
            </Link>
            <Link
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-navy hover:border-royal"
              href="/admin/social/digest"
            >
              WhatsApp digest
            </Link>
          </div>
        }
      />

      {!settings.enabled ? (
        <Alert tone="info" title="Auto-posting is off">
          The master switch is disabled in social settings. Publishing jobs will not enqueue
          social posts until it is turned on.
        </Alert>
      ) : null}
      {settings.pauseAll ? (
        <Alert tone="error" title="Kill switch engaged">
          All social posting is paused. Turn off &quot;pause all&quot; in settings to resume.
        </Alert>
      ) : null}
      {tokenErrors.map((connection) => (
        <Alert key={connection.platform} tone="error" title={`${connection.platform} token error`}>
          {connection.tokenError} — update the access token in the server environment, then
          requeue failed posts.
        </Alert>
      ))}

      <div className="grid gap-4 sm:grid-cols-2">
        {connections.map((connection) => (
          <Card key={connection.platform}>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold capitalize text-navy">{connection.platform}</h2>
              <Badge tone={connection.configured ? "success" : "neutral"}>
                {connection.configured ? "Connected" : "Not configured"}
              </Badge>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              {connection.configured
                ? "Credentials found in the server environment."
                : "Add the environment variables to enable this platform. Nothing else breaks."}
            </p>
          </Card>
        ))}
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-navy">Kill switch</h2>
            <p className="mt-1 text-sm text-slate-600">
              {settings.pauseAll
                ? "Every platform is paused. Queued posts are held until you resume."
                : "Pause every platform immediately, without changing any other setting."}
            </p>
          </div>
          <form action={setSocialPauseAction}>
            <input name="pauseAll" type="hidden" value={settings.pauseAll ? "" : "on"} />
            <Button type="submit" variant={settings.pauseAll ? "primary" : "danger"}>
              {settings.pauseAll ? "Resume posting" : "Pause all posting"}
            </Button>
          </form>
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-bold text-navy">Queue and history</h2>
          <form className="flex items-center gap-2" method="get">
            <Select aria-label="Filter by platform" defaultValue={platform ?? ""} name="platform">
              <option value="">All platforms</option>
              <option value="facebook">Facebook</option>
              <option value="instagram">Instagram</option>
            </Select>
            <Select aria-label="Filter by status" defaultValue={status ?? ""} name="status">
              <option value="">All statuses</option>
              {POST_STATUSES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
            <Button size="sm" type="submit">
              Filter
            </Button>
          </form>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
          {POST_STATUSES.map((item) => (
            <span className="rounded-full bg-slate-100 px-2.5 py-1" key={item}>
              {item}: {countsByStatus.get(item) ?? 0}
            </span>
          ))}
        </div>

        {posts.length === 0 ? (
          <EmptyState
            title="No social posts yet"
            description="No social posts match this filter yet. Posts are queued when a job is published and the master switch is on."
          />
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-2 py-2">Job</th>
                  <th className="px-2 py-2">Platform</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Attempts</th>
                  <th className="px-2 py-2">Next attempt</th>
                  <th className="px-2 py-2">Published</th>
                  <th className="px-2 py-2">Error</th>
                  <th className="px-2 py-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {posts.map((row) => (
                  <tr key={row.post.id}>
                    <td className="max-w-[14rem] truncate px-2 py-2 font-semibold text-navy">
                      <Link className="hover:underline" href={`/jobs/${row.jobSlug}`}>
                        {row.jobTitle}
                      </Link>
                    </td>
                    <td className="px-2 py-2 capitalize">{row.post.platform}</td>
                    <td className="px-2 py-2">
                      <Badge tone={STATUS_TONE[row.post.status] ?? "neutral"}>
                        {row.post.status}
                      </Badge>
                    </td>
                    <td className="px-2 py-2">{row.post.attempts}</td>
                    <td className="px-2 py-2">{formatDateTime(row.post.nextAttemptAt)}</td>
                    <td className="px-2 py-2">{formatDateTime(row.post.publishedAt)}</td>
                    <td className="max-w-[16rem] truncate px-2 py-2 text-xs text-slate-600">
                      {row.post.lastError ?? "—"}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex gap-3">
                        {row.post.status !== "published" && row.post.status !== "queued" ? (
                          <form action={retrySocialPostAction}>
                            <input name="id" type="hidden" value={row.post.id} />
                            <button className="font-semibold text-royal hover:underline" type="submit">
                              Retry
                            </button>
                          </form>
                        ) : null}
                        {row.post.status === "queued" || row.post.status === "failed" ? (
                          <form action={cancelSocialPostAction}>
                            <input name="id" type="hidden" value={row.post.id} />
                            <button className="font-semibold text-red-600 hover:underline" type="submit">
                              Cancel
                            </button>
                          </form>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="text-base font-bold text-navy">Post a published job now</h2>
        <p className="mt-1 text-sm text-slate-600">
          Bypasses the daily cap, spacing and window for one job. Eligibility rules and the kill
          switch still apply.
        </p>
        <form action={postJobNowAction} className="mt-4 flex flex-wrap items-end gap-3">
          <label className="text-sm font-semibold text-navy">
            Job
            <Select defaultValue="" name="jobId">
              <option value="">Select a published job…</option>
              {eligibleJobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.title}
                </option>
              ))}
            </Select>
          </label>
          <label className="text-sm font-bold text-navy">
            Platform
            <Select defaultValue="facebook" name="platform">
              <option value="facebook">Facebook</option>
              <option value="instagram">Instagram</option>
            </Select>
          </label>
          <Button type="submit">Post now</Button>
        </form>
      </Card>
    </div>
  );
}

