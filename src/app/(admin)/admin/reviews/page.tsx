import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { Badge, Card, PageHeader } from "@/components/ui/primitives";
import { moderateCompanyReviewAction } from "@/lib/admin/review-actions";
import { db } from "@/lib/db";
import { companies, companyReviews } from "@/lib/db/schema";
import { formatIndianDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Company review moderation" };

const textareaClass = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2";

export default async function AdminReviewsPage() {
  const rows = await db
    .select({
      id: companyReviews.id,
      companyId: companyReviews.companyId,
      companyName: companies.name,
      companySlug: companies.slug,
      rating: companyReviews.rating,
      title: companyReviews.title,
      pros: companyReviews.pros,
      cons: companyReviews.cons,
      body: companyReviews.body,
      status: companyReviews.status,
      moderationNotes: companyReviews.moderationNotes,
      createdAt: companyReviews.createdAt,
    })
    .from(companyReviews)
    .innerJoin(companies, eq(companies.id, companyReviews.companyId))
    .orderBy(desc(companyReviews.createdAt));

  return (
    <div className="space-y-6">
      <PageHeader title="Company reviews" description="Moderate candidate-submitted company reviews before publication." />
      {rows.map((review) => (
        <Card key={review.id}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-bold text-navy">{review.companyName}</h2>
              <p className="text-sm text-slate-600">Rating: {review.rating}/5 · {formatIndianDateTime(review.createdAt)}</p>
            </div>
            <Badge tone={review.status === "published" ? "success" : review.status === "rejected" ? "danger" : "warning"}>
              {review.status}
            </Badge>
          </div>
          {review.title ? <h3 className="mt-4 font-semibold text-navy">{review.title}</h3> : null}
          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{review.body}</p>
          {review.pros || review.cons ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {review.pros ? <p className="text-sm"><strong>Pros:</strong> {review.pros}</p> : null}
              {review.cons ? <p className="text-sm"><strong>Cons:</strong> {review.cons}</p> : null}
            </div>
          ) : null}
          <form action={moderateCompanyReviewAction} className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
            <input name="reviewId" type="hidden" value={review.id} />
            <label className="text-sm font-medium text-navy">
              Moderation note
              <textarea className={textareaClass} defaultValue={review.moderationNotes ?? ""} maxLength={1000} name="notes" rows={2} />
            </label>
            <button className="self-end rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white" name="status" type="submit" value="published">Publish</button>
            <button className="self-end rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white" name="status" type="submit" value="rejected">Reject</button>
          </form>
        </Card>
      ))}
      {rows.length === 0 ? <Card><p className="text-sm text-slate-600">No reviews have been submitted.</p></Card> : null}
    </div>
  );
}
