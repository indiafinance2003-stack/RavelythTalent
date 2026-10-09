import Link from "next/link";
import { Badge, Card } from "@/components/ui/primitives";
import type { AssistantOverview } from "@/lib/assistant/overview";
import { appUrl } from "@/lib/email/urls";
import { formatDateTime } from "@/lib/utils";
import type { BadgeTone } from "@/components/ui/primitives";

export function OverviewTally({ summary }: { summary: AssistantOverview }) {
  const areas: Array<{ label: string; count: number; href: string; tone: BadgeTone }> = [
    { label: "Campaign approvals", count: summary.approvalsWaiting, href: "/admin/assistant/campaigns", tone: "brand" },
    { label: "Threads needing attention", count: summary.threadsAttention, href: "/admin/assistant", tone: "warning" },
    { label: "Targets to review", count: summary.targetsToReview, href: "/admin/assistant/targets", tone: "navy" },
    { label: "Contact forms queued", count: summary.formsPending, href: "/admin/assistant/contact-forms", tone: "teal" },
  ];

  return (
    <Card className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-navy">Overview</h2>
          <p className="text-sm text-slate-600">Your outreach at a glance.</p>
        </div>
        {summary.sendingPaused ? <Badge tone="danger">Sending paused</Badge> : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {summary.likedTerms.map((term) => (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2" key={term.label}>
            <p className="text-sm text-slate-500">{term.label}</p>
            <p className="text-xl font-bold text-navy">{term.value}</p>
          </div>
        ))}
      </div>

      <ul className="grid gap-2 sm:grid-cols-2">
        {areas.map((area) => (
          <li key={area.label}>
            <Link
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-2.5 hover:border-royal hover:bg-sky-tint/50"
              href={appUrl(area.href)}
            >
              <span className="text-sm font-semibold text-navy">{area.label}</span>
              <Badge tone={area.count > 0 ? area.tone : "neutral"}>{area.count}</Badge>
            </Link>
          </li>
        ))}
      </ul>

      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500">Sends today vs cap</dt>
          <dd className="font-semibold text-navy">
            {summary.sentToday} <span className="text-slate-400">of {summary.dailyCap}</span>
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500">Last campaign send</dt>
          <dd className="font-semibold text-navy">
            {summary.lastCampaignSend ? formatDateTime(summary.lastCampaignSend) : "Never"}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500">Last inbox sync</dt>
          <dd className="font-semibold text-navy">
            {summary.lastInboxSync ? formatDateTime(summary.lastInboxSync) : "Never"}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500">Bounce rate (last 20)</dt>
          <dd className="font-semibold text-navy">
            {summary.bounceRatePercent === null ? "Too few sends" : `${summary.bounceRatePercent}%`}
          </dd>
        </div>
      </dl>
    </Card>
  );
}