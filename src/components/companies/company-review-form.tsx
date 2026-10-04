"use client";

import { useActionState } from "react";
import { Alert, Button, Field, Select, Textarea } from "@/components/ui/primitives";
import { initialFormState } from "@/lib/form-state";
import { submitCompanyReviewAction } from "@/lib/company-reviews/actions";

export function CompanyReviewForm({ companyId }: { companyId: string }) {
  const [state, action, pending] = useActionState(submitCompanyReviewAction, initialFormState);
  return (
    <form action={action} className="space-y-4">
      {state.message ? (
        <Alert tone={state.status === "error" ? "error" : "success"}>{state.message}</Alert>
      ) : null}
      <input name="companyId" type="hidden" value={companyId} />
      <Field label="Rating" htmlFor="review-rating" required>
        <Select id="review-rating" name="rating" defaultValue="5" required>
          <option value="5">5 - Excellent</option>
          <option value="4">4 - Good</option>
          <option value="3">3 - Average</option>
          <option value="2">2 - Poor</option>
          <option value="1">1 - Very poor</option>
        </Select>
      </Field>
      <Field label="Review title" htmlFor="review-title">
        <input id="review-title" className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm" name="title" maxLength={140} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="What went well?" htmlFor="review-pros">
          <Textarea id="review-pros" name="pros" maxLength={1500} />
        </Field>
        <Field label="What could be better?" htmlFor="review-cons">
          <Textarea id="review-cons" name="cons" maxLength={1500} />
        </Field>
      </div>
      <Field label="Your review" htmlFor="review-body" hint="Please share a fair, firsthand account (30-5,000 characters)." required>
        <Textarea id="review-body" name="body" minLength={30} maxLength={5000} required />
      </Field>
      <Button type="submit" disabled={pending}>{pending ? "Submitting…" : "Submit for moderation"}</Button>
    </form>
  );
}
