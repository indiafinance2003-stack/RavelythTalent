"use client";

import { useActionState } from "react";
import {
  createAlertAction,
  deleteAlertAction,
  toggleAlertAction,
} from "@/lib/alerts/actions";
import { initialFormState } from "@/lib/form-state";
import { formatDate } from "@/lib/utils";
import {
  Alert,
  Badge,
  Button,
  Card,
  Field,
  Input,
  Select,
} from "@/components/ui/primitives";

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
  criteria: Record<string, string>;
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
                  alert.criteria.q,
                  alert.criteria.location,
                  alert.criteria.category,
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
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
