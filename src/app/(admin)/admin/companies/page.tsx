import type { Metadata } from "next";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { decideCompanyAction } from "@/lib/admin/actions";
import { listCompanyReviewQueue } from "@/lib/admin/moderation";

export const metadata: Metadata = { title: "Company reviews" };

export default async function AdminCompaniesPage() {
  const queue = await listCompanyReviewQueue();

  return (
    <div className="space-y-6">
      <PageHeader title="Company verification" description="Review pending company profiles and submitted documents." />
      {queue.companies.length === 0 ? (
        <EmptyState title="No pending companies" description="New company submissions will appear here." />
      ) : (
        <div className="space-y-4">
          {queue.companies.map((company) => (
            <Card key={company.id}>
              <h2 className="text-lg font-bold text-navy">{company.name}</h2>
              <p className="mt-1 text-sm text-slate-600">
                Owner: {company.ownerName} ({company.ownerEmail})
                {company.website ? ` · ${company.website}` : ""}
              </p>
              <p className="mt-1 text-xs text-slate-500">Submitted {company.createdAt.toLocaleDateString("en-IN")}</p>
              <ul className="mt-4 space-y-2 text-sm">
                {queue.documents.filter((doc) => doc.companyId === company.id).map((doc) => (
                  <li key={doc.id}>
                    <a className="font-semibold text-royal underline" href={`/api/files/verification/${doc.id}`}>
                      {doc.docType}: {doc.originalName} ({doc.mimeType})
                    </a>
                  </li>
                ))}
              </ul>
              <div className="mt-5 grid gap-4 border-t border-slate-200 pt-4 sm:grid-cols-2">
                <form action={decideCompanyAction} className="flex flex-wrap items-end gap-2">
                  <input name="id" type="hidden" value={company.id} />
                  <input name="decision" type="hidden" value="approved" />
                  <button className="rounded-lg bg-royal px-4 py-2 text-sm font-semibold text-white hover:bg-navy" type="submit">Approve</button>
                </form>
                <form action={decideCompanyAction} className="space-y-2">
                  <input name="id" type="hidden" value={company.id} />
                  <input name="decision" type="hidden" value="rejected" />
                  <label className="block text-sm font-medium text-navy">
                    Rejection reason
                    <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" maxLength={1000} minLength={1} name="reason" required />
                  </label>
                  <button className="rounded-lg border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50" type="submit">Reject</button>
                </form>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
