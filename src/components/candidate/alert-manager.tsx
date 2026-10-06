"use client";

import { useActionState } from "react";
import {
  createAlertAction,
  deleteAlertAction,
  saveAlertPreferencesAction,
  toggleAlertAction,
  updateAlertAction,
} from "@/lib/alerts/actions";
import { initialFormState } from "@/lib/form-state";
import { formatDate } from "@/lib/utils";
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Field,
  Input,
  Select,
} from "@/components/ui/primitives";

export function JobAlertPreferencesForm({
  consent,
  frequency,
}: {
  consent: boolean;
  frequency: "daily" | "weekly";
}) {
  const [state, formAction, pending] = useActionState(
    saveAlertPreferencesAction,
    initialFormState,
  );
  return (
    <Card>
      <h2 className="text-base font-bold text-navy">Job-alert email preferences</h2>
      <p className="mt-1 text-sm text-slate-600">
        Email consent is optional. Turning it off prevents future job-alert emails;
        you can still manage saved alerts and in-app notifications.
      </p>
      <form action={formAction} className="mt-4 space-y-4">
        {state.status === "success" ? <Alert tone="success">{state.message}</Alert> : null}
        {state.status === "error" ? <Alert tone="error">{state.message}</Alert> : null}
        <Checkbox
          id="job-alert-email-consent"
          name="consent"
          label="Email me new jobs that match my profile"
          defaultChecked={consent}
        />
        <Field label="Email frequency" htmlFor="job-alert-frequency">
          <Select id="job-alert-frequency" name="frequency" defaultValue={frequency}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </Select>
        </Field>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Save job-alert preferences"}
        </Button>
      </form>
    </Card>
  );
}

export function CreateAlertForm({
  categories,
}: {
  categories: Array<{ value: string; label: string }>;
}) {
  const [state, formAction, pending] = useActionState(
    createAlertAction,
    initialFormState,
  );

  return (
    <Card>
      <h2 className="text-base font-bold text-navy">Create an alert</h2>
      <form action={formAction} className="mt-4 space-y-4">
        {state.status === "success" ? (
          <Alert tone="success">{state.message}</Alert>
        ) : null}
        {state.status === "error" ? <Alert tone="error">{state.message}</Alert> : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Alert name" htmlFor="name">
            <Input id="name" name="name" placeholder="Frontend roles in Bengaluru" />
          </Field>
          <Field label="Keywords" htmlFor="q">
            <Input id="q" name="q" placeholder="react, frontend" />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Location" htmlFor="location">
            <Input id="location" name="location" placeholder="Bengaluru" />
          </Field>
          <Field label="Category" htmlFor="category">
            <Select id="category" name="category" defaultValue="">
              <option value="">Any category</option>
              {categories.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Frequency" htmlFor="frequency">
            <Select id="frequency" name="frequency" defaultValue="daily">
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </Select>
          </Field>
        </div>

        <Button type="submit" disabled={pending}>
          {pending ? "Creating..." : "Create alert"}
        </Button>
      </form>
    </Card>
  );
}

export type AlertRow = {
  id: string;
  name: string;
  criteria: Record<string, unknown>;
  frequency: string;
  isActive: boolean;
  lastSentAt: Date | null;
};

export function AlertList({ alerts }: { alerts: AlertRow[] }) {
  if (alerts.length === 0) {
    return (
      <Card>
        <p className="text-sm text-slate-600">You have no job alerts yet.</p>
      </Card>
    );
  }

  return (
    <Card>
      <h2 className="text-base font-bold text-navy">Your alerts</h2>
      <ul className="mt-4 divide-y divide-slate-100">
        {alerts.map((alert) => (
          <li key={alert.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-navy">{alert.name}</p>
              <p className="text-xs text-slate-600">
                {[
                  stringValue(alert.criteria.q),
                  stringValue(alert.criteria.location) ||
                    stringValue((alert.criteria.locations as string[] | undefined)?.[0]),
                  stringValue(alert.criteria.category),
                ]
                  .filter(Boolean)
                  .join(" | ") || "All jobs"}
                {" - "}
                {alert.frequency}
                {alert.lastSentAt ? ` - last sent ${formatDate(alert.lastSentAt)}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={alert.isActive ? "success" : "neutral"}>
                {alert.isActive ? "Active" : "Paused"}
              </Badge>
              <form action={toggleAlertAction}>
                <input type="hidden" name="alertId" value={alert.id} />
                <input
                  type="hidden"
                  name="isActive"
                  value={alert.isActive ? "false" : "true"}
                />
                <button
                  type="submit"
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-navy hover:border-royal hover:text-royal"
                >
                  {alert.isActive ? "Pause" : "Resume"}
                </button>
              </form>
              <form action={deleteAlertAction}>
                <input type="hidden" name="alertId" value={alert.id} />
                <button
                  type="submit"
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-red-300 hover:text-red-600"
                >
                  Delete
                </button>
              </form>
              <UpdateAlertForm alert={alert} />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function UpdateAlertForm({ alert }: { alert: AlertRow }) {
  const [state, formAction, pending] = useActionState(
    updateAlertAction,
    initialFormState,
  );
  const location = stringValue(alert.criteria.location) ||
    stringValue((alert.criteria.locations as string[] | undefined)?.[0]);
  return (
    <details className="basis-full">
      <summary className="cursor-pointer text-xs font-semibold text-royal">Edit alert</summary>
      <form action={formAction} className="mt-3 grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="alertId" value={alert.id} />
        <Field label="Alert name" htmlFor={`alert-name-${alert.id}`}>
          <Input id={`alert-name-${alert.id}`} name="name" defaultValue={alert.name} />
        </Field>
        <Field label="Keywords" htmlFor={`alert-q-${alert.id}`}>
          <Input id={`alert-q-${alert.id}`} name="q" defaultValue={stringValue(alert.criteria.q)} />
        </Field>
        <Field label="Location" htmlFor={`alert-location-${alert.id}`}>
          <Input id={`alert-location-${alert.id}`} name="location" defaultValue={location} />
        </Field>
        <Field label="Category" htmlFor={`alert-category-${alert.id}`}>
          <Input id={`alert-category-${alert.id}`} name="category" defaultValue={stringValue(alert.criteria.category)} />
        </Field>
        <Field label="Frequency" htmlFor={`alert-frequency-${alert.id}`}>
          <Select id={`alert-frequency-${alert.id}`} name="frequency" defaultValue={alert.frequency}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </Select>
        </Field>
        {state.message ? (
          <Alert tone={state.status === "success" ? "success" : "error"}>{state.message}</Alert>
        ) : null}
        <div><Button type="submit" size="sm" disabled={pending}>{pending ? "Saving..." : "Save changes"}</Button></div>
      </form>
    </details>
  );
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}
