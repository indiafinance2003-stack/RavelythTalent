import { ImageResponse } from "next/og";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies, jobs } from "@/lib/db/schema";
import { socialCardVisible } from "@/lib/social/eligibility";
import {
  buildSocialCardModel,
  SOCIAL_CARD_COLORS as COLORS,
  SOCIAL_CARD_CTA,
} from "@/lib/social/card";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public 1080x1080 branded job card for social posts. Returns 404 for any
 * job that is not currently published and contains no personal data - only
 * the same fields shown on the public job page. Cached briefly by clients.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ jobId: string }> },
): Promise<Response> {
  const { jobId } = await context.params;

  const [row] = await db
    .select({
      job: jobs,
      companyName: companies.name,
    })
    .from(jobs)
    .innerJoin(companies, eq(companies.id, jobs.companyId))
    .where(and(eq(jobs.id, jobId), isNull(jobs.deletedAt)))
    .limit(1);

  if (!row || !socialCardVisible(row.job)) {
    return new Response("Not found", { status: 404 });
  }

  const model = buildSocialCardModel(row.job, row.companyName);

  const image = new ImageResponse(
    (
      <div
        style={{
          width: "1080px",
          height: "1080px",
          display: "flex",
          flexDirection: "column",
          backgroundColor: COLORS.offWhite,
          padding: "72px",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: COLORS.navy,
            borderRadius: "24px",
            padding: "32px 40px",
          }}
        >
          <span style={{ color: "#FFFFFF", fontSize: "44px", fontWeight: 700 }}>
            {model.brand}
          </span>
          <span style={{ color: COLORS.teal, fontSize: "30px", fontWeight: 600 }}>
            {model.cta}
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", marginTop: "64px", gap: "24px" }}>
          <span style={{ color: COLORS.navy, fontSize: "76px", fontWeight: 800, lineHeight: 1.05 }}>
            {model.title}
          </span>
          <span style={{ color: COLORS.royal, fontSize: "44px", fontWeight: 700 }}>
            {model.company}
          </span>
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "20px",
            marginTop: "48px",
          }}
        >
          {model.chips.map((chip) => (
            <span
              key={chip}
              style={{
                backgroundColor: COLORS.sky,
                color: COLORS.navy,
                borderRadius: "999px",
                padding: "18px 34px",
                fontSize: "34px",
                fontWeight: 600,
              }}
            >
              {chip}
            </span>
          ))}
        </div>

        {model.salary ? (
          <span style={{ color: COLORS.teal, fontSize: "42px", fontWeight: 700, marginTop: "40px" }}>
            {model.salary}
          </span>
        ) : null}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginTop: "auto",
            backgroundColor: COLORS.royal,
            borderRadius: "24px",
            padding: "30px",
            color: "#FFFFFF",
            fontSize: "40px",
            fontWeight: 700,
          }}
        >
          {SOCIAL_CARD_CTA}
        </div>
      </div>
    ),
    {
      width: 1080,
      height: 1080,
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=600",
      },
    },
  );

  return image;
}
