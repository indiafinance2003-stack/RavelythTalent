"use client";

import { useMemo, useState } from "react";
import { Badge, Button } from "@/components/ui/primitives";

export type CampaignLeadOption = {
  id: string;
  label: string;
  status: string;
  eligible: boolean;
  reason: string | null;
  eligibleFrom: string | null;
};

/**
 * Lead picker for campaign activation.
 *
 * Every checkbox is associated with the single `<form>` by the `form` attribute
 * rather than by DOM nesting. Nesting inputs inside one form is correct in
 * React, but this keeps the submit control, helpers and live counter together
 * while the (potentially 1,000-row) list scrolls independently, and it mirrors
 * the pattern already used on the company leads page.
 */
export function CampaignLeadSelector({
  campaignId,
  action,
  leads,
  disabled = false,
}: {
  campaignId: string;
  action: (formData: FormData) => void | Promise<void>;
  leads: CampaignLeadOption[];
  disabled?: boolean;
}) {
  const formId = "campaign-lead-form";
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const eligibleIds = useMemo(
    () => leads.filter((lead) => lead.eligible).map((lead) => lead.id),
    [leads],
  );

  function setChecked(id: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function selectMany(ids: string[]) {
    setSelected((current) => {
      const next = new Set(current);
      for (const id of ids) next.add(id);
      return next;
    });
  }

  function clearAll() {
    setSelected(new Set());
  }

  return (
    <div className="space-y-3">
      <form action={action} id={formId}>
        <input name="campaignId" type="hidden" value={campaignId} />
      </form>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          disabled={disabled || !eligibleIds.length}
          onClick={() => selectMany(eligibleIds)}
          size="sm"
          type="button"
          variant="secondary"
        >
          Select all eligible
        </Button>
        <Button
          disabled={disabled || eligibleIds.length < 1}
          onClick={() => selectMany(eligibleIds.slice(0, 15))}
          size="sm"
          type="button"
          variant="secondary"
        >
          Select first 15
        </Button>
        <Button
          disabled={disabled || !selected.size}
          onClick={clearAll}
          size="sm"
          type="button"
          variant="ghost"
        >
          Clear
        </Button>
        <span className="text-sm font-semibold text-navy" aria-live="polite">
          {selected.size} selected
        </span>
      </div>
      {leads.length ? (
        <div className="max-h-80 space-y-2 overflow-auto rounded-xl border border-slate-200 p-3">
          {leads.map((lead) => (
            <label
              className={`flex items-start gap-2 text-sm ${
                lead.eligible ? "text-slate-700" : "text-slate-400"
              }`}
              key={lead.id}
            >
              <input
                checked={selected.has(lead.id)}
                className="mt-0.5 h-4 w-4 accent-royal"
                disabled={disabled || !lead.eligible}
                form={formId}
                name="leadIds"
                onChange={(event) => setChecked(lead.id, event.target.checked)}
                type="checkbox"
                value={lead.id}
              />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-navy">{lead.label}</span>
                  <Badge tone={lead.eligible ? "neutral" : "warning"}>
                    {lead.status.replaceAll("_", " ")}
                  </Badge>
                </span>
                {!lead.eligible && lead.reason ? (
                  <span className="mt-0.5 block text-xs text-amber-700">
                    {lead.reason}
                    {lead.eligibleFrom ? ` Eligible from ${lead.eligibleFrom}.` : ""}
                  </span>
                ) : null}
              </span>
            </label>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-600">
          No leads are available. Add them manually or import a CSV first.
        </p>
      )}
      <Button
        disabled={disabled || !selected.size}
        form={formId}
        type="submit"
      >
        Activate and queue for approval
      </Button>
    </div>
  );
}
