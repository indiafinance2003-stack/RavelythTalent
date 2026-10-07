import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, gte, lt } from "drizzle-orm";
import { Alert, Badge, Button, Card, PageHeader } from "@/components/ui/primitives";
import { DigestCopyButton } from "@/components/admin/social/digest-copy";
import { db } from "@/lib/db";
import { companies, jobs, whatsappDigests } from "@/lib/db/schema";
import { markDigestPostedAction } from "@/lib/social/digest-actions";
import { buildDigestLine } from "@/lib/social/content";
import { istDayKey, startOfIstDay } from "@/lib/social/schedule";
import { appUrl } from "@/lib/email/urls";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "WhatsApp digest" };

type SearchParams = { date?: string };

export default async function AdminSocialDigestPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const requested = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? "") ? params.date! : undefined;
  const date = requested ?? istDayKey(new Date());

  const dayStart = startOfIstDay(new Date(`${date}T00:00:00+05:30`));
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const [dayJobs, posted] = await Promise.all([
    db
      .select({ job: jobs, companyName: companies.name })
      .from(jobs)
      .innerJoin(companies, eq(companies.id, jobs.companyId))
      .where(
        and(
          eq(jobs.status, "published"),
          gte(jobs.publishedAt, dayStart),
          lt(jobs.publishedAt, dayEnd),
        ),
      )
      .orderBy(desc(jobs.publishedAt))
      .limit(10),
    db
      .select({ digestDate: whatsappDigests.digestDate })
      .from(whatsappDigests)
      .where(eq(whatsappDigests.digestDate, date))
      .limit(1),
  ]);

  const lines = dayJobs.map((row, index) =>
    buildDigestLine({
      job: row.job,
      companyName: row.companyName,
      appUrl: appUrl(),
      index: index + 1,
    }),
  );
  const digestText = [
    `New jobs on Ravelyth Talent (${date}):`,
    "",
    ...lines.flatMap((line) => [line, ""]),
    "Search and apply: https://ravelyth.in/jobs",
    "You are receiving this because you follow Ravelyth Talent job updates.",
  ].join("\n");

  const isPosted = Boolean(posted.length);

  return (
    <div className="space-y-6">
      <PageHeader
        title="WhatsApp digest"
        description="Generate a ready-to-paste message for up to 10 jobs published on a date. Manual only — nothing is sent automatically."
        action={
          <Link
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-navy hover:border-royal"
            href="/admin/social"
          >
            Back to queue
          </Link>
        }
      />

      <Card>
        <form className="flex flex-wrap items-end gap-3" method="get">
          <label className="text-sm font-semibold text-navy">
            Date
            <input
              className="mt-1 block rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-navy focus:border-royal focus:outline-none focus:ring-2 focus:ring-royal/25"
              defaultValue={date}
              name="date"
              type="date"
            />
          </label>
          <Button size="sm" type="submit">
            Generate
          </Button>
        </form>

        <div className="mt-4 flex items-center gap-3">
          <Badge tone={isPosted ? "success" : "neutral"}>
            {isPosted ? "marked as posted" : "not posted yet"}
          </Badge>
          <DigestCopyButton text={digestText} />
          <form action={markDigestPostedAction}>
            <input name="digestDate" type="hidden" value={date} />
            <Button disabled={isPosted} type="submit" variant="secondary">
              Mark as posted
            </Button>
          </form>
        </div>
      </Card>

      <Card>
        <h2 className="text-base font-bold text-navy">Digest preview</h2>
        {dayJobs.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">
            No jobs were published on {date}. Pick another date or publish a job first.
          </p>
        ) : (
          <>
            <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-slate-50 p-4 font-sans text-sm text-slate-800">
              {digestText}
            </pre>
            <h3 className="mt-6 text-sm font-bold text-navy">Job card images</h3>
            <ul className="mt-2 space-y-1 text-sm">
              {dayJobs.map((row) => (
                <li key={row.job.id}>
                  <a
                    className="font-semibold text-royal hover:underline"
                    download={`ravelyth-card-${row.job.slug}.png`}
                    href={appUrl(`/api/social/card/${row.job.id}`)}
                  >
                    Download card — {row.job.title}
                  </a>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <Alert tone="info" title="Manual by design">
        WhatsApp Channels have no official posting API. Copy the message into WhatsApp yourself;
        the &quot;mark as posted&quot; button only records the date here.
      </Alert>
    </div>
  );
}
