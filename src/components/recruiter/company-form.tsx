"use client";

import { useActionState } from "react";
import {
  createCompanyAction,
  updateCompanyAction,
  uploadVerificationAction,
} from "@/lib/recruiter/actions";
import { initialFormState } from "@/lib/form-state";
import {
  Alert,
  Button,
  Card,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ui/primitives";

export type CompanyFormValues = {
  companyId: string;
  name: string;
  about: string | null;
  industry: string | null;
  size: string | null;
  website: string | null;
  foundedYear: number | null;
  headquarters: string | null;
  locations: string[];
  contactEmail: string | null;
  contactPhone: string | null;
};

const SIZES = ["1-10", "11-50", "51-200", "201-500", "501-1000", "1001-5000", "5001-10000", "10000+"];

export function CompanyProfileForm({ values }: { values: CompanyFormValues }) {
  const [state, formAction, pending] = useActionState(
    updateCompanyAction,
    initialFormState,
  );

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="companyId" value={values.companyId} />
      <Card>
        <h2 className="text-base font-bold text-navy">Company profile</h2>
        <p className="mt-1 text-sm text-slate-600">
          This appears on your public company page and every job posting.
        </p>
        <div className="mt-4 space-y-4">
          {state.status === "success" ? (
            <Alert tone="success">{state.message}</Alert>
          ) : null}
          {state.status === "error" ? (
            <Alert tone="error">{state.message}</Alert>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Company name" htmlFor="name" required>
              <Input id="name" name="name" defaultValue={values.name} maxLength={160} required />
            </Field>
            <Field label="Industry" htmlFor="industry">
              <Input id="industry" name="industry" defaultValue={values.industry ?? ""} placeholder="Fintech" maxLength={120} />
            </Field>
          </div>

          <Field label="About" htmlFor="about" hint="What the company does, culture, highlights.">
            <Textarea id="about" name="about" rows={5} maxLength={5000} defaultValue={values.about ?? ""} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Company size" htmlFor="size">
              <Select id="size" name="size" defaultValue={values.size ?? ""}>
                <option value="">Prefer not to say</option>
                {SIZES.map((s) => (
                  <option key={s} value={s}>{s} employees</option>
                ))}
              </Select>
            </Field>
            <Field label="Website" htmlFor="website">
              <Input id="website" name="website" type="url" defaultValue={values.website ?? ""} placeholder="https://example.com" maxLength={300} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Founded year" htmlFor="foundedYear">
              <Input id="foundedYear" name="foundedYear" type="number" min={1800} max={2100} defaultValue={values.foundedYear ?? ""} />
            </Field>
            <Field label="Headquarters" htmlFor="headquarters">
              <Input id="headquarters" name="headquarters" defaultValue={values.headquarters ?? ""} placeholder="Mumbai, Maharashtra" maxLength={200} />
            </Field>
          </div>

          <Field label="Hiring locations" htmlFor="locations" hint="Comma separated: Bengaluru, Pune, Remote">
            <Input id="locations" name="locations" defaultValue={values.locations.join(", ")} maxLength={600} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Contact email" htmlFor="contactEmail">
              <Input id="contactEmail" name="contactEmail" type="email" defaultValue={values.contactEmail ?? ""} maxLength={200} />
            </Field>
            <Field label="Contact phone" htmlFor="contactPhone">
              <Input id="contactPhone" name="contactPhone" defaultValue={values.contactPhone ?? ""} maxLength={30} />
            </Field>
          </div>
        </div>
      </Card>

      <Button type="submit" disabled={pending}>
        {pending ? "Saving..." : "Save profile"}
      </Button>
    </form>
  );
}

export function CreateCompanyForm() {
  const [state, formAction, pending] = useActionState(
    createCompanyAction,
    initialFormState,
  );

  return (
    <form action={formAction} className="space-y-6">
      <Card>
        <h2 className="text-base font-bold text-navy">Create your company</h2>
        <div className="mt-4 space-y-4">
          {state.status === "error" ? <Alert tone="error">{state.message}</Alert> : null}
          <Field label="Company name" htmlFor="newCompanyName" required>
            <Input id="newCompanyName" name="name" required minLength={2} maxLength={160} />
          </Field>
          <Field label="Website" htmlFor="newCompanyWebsite">
            <Input id="newCompanyWebsite" name="website" type="url" placeholder="https://example.com" maxLength={300} />
          </Field>
        </div>
      </Card>
      <Button type="submit" disabled={pending}>
        {pending ? "Creating..." : "Create company"}
      </Button>
    </form>
  );
}

export function VerificationUploadForm({ companyId }: { companyId: string }) {
  const [state, formAction, pending] = useActionState(
    uploadVerificationAction,
    initialFormState,
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="companyId" value={companyId} />
      <input type="hidden" name="docType" value="company_registration" />
      {state.status === "success" ? <Alert tone="success">{state.message}</Alert> : null}
      {state.status === "error" ? <Alert tone="error">{state.message}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Registration document"
          htmlFor="document"
          hint="PDF, PNG or JPG up to 5 MB - GST certificate, incorporation proof or Udyam."
          required
        >
          <Input id="document" name="document" type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" required />
        </Field>
        <div className="flex items-end">
          <Button type="submit" disabled={pending}>
            {pending ? "Uploading..." : "Submit for review"}
          </Button>
        </div>
      </div>
    </form>
  );
}
