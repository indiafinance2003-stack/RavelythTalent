"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Card } from "@/components/ui/primitives";
import { formatPaise } from "@/lib/utils";
import { openRazorpayCheckout } from "./razorpay-checkout";

export type AddonOption = {
  id: string;
  name: string;
  description: string | null;
  type: "per_job" | "per_company" | "subscription";
  pricePaise: number;
  durationDays: number;
};

export function AddonPurchase({
  addon,
  companyId,
  jobs,
  paymentAvailable,
}: {
  addon: AddonOption;
  companyId: string;
  jobs: Array<{ id: string; title: string }>;
  paymentAvailable: boolean;
}) {
  const router = useRouter();
  const [jobId, setJobId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function buyAddon() {
    setError(null);
    setMessage(null);
    if (addon.type === "per_job" && !jobId) {
      setError("Choose a published job for this add-on.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/billing/order", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          purpose: "addon",
          addonId: addon.id,
          companyId,
          ...(jobId ? { jobId } : {}),
        }),
      });
      const body = (await response.json()) as {
        ok: boolean;
        data?: {
          keyId: string | number | null;
          orderId: string | number | null;
          amount: string | number | null;
          currency: string | number | null;
          addonName?: string | number | null;
        };
        error?: { message?: string };
      };
      if (!response.ok || !body.ok || !body.data) {
        throw new Error(body.error?.message ?? "Could not start add-on checkout.");
      }
      await openRazorpayCheckout(
        body.data,
        () => {
          setMessage("Payment verified. Your add-on is active.");
          router.refresh();
        },
        setError,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start checkout.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col">
      <h2 className="text-lg font-bold text-navy">{addon.name}</h2>
      {addon.description ? <p className="mt-2 flex-1 text-sm text-slate-600">{addon.description}</p> : null}
      <p className="mt-4 font-semibold text-navy">{formatPaise(addon.pricePaise)}</p>
      <p className="mt-1 text-xs text-slate-500">Active for {addon.durationDays} days</p>
      {!paymentAvailable ? (
        <p className="mt-4 text-sm text-amber-900">
          Online payment will be available soon.{" "}
          <Link className="font-semibold underline" href="/contact">Contact us to subscribe</Link>.
        </p>
      ) : null}
      {addon.type === "per_job" ? (
        <label className="mt-4 block text-sm font-medium text-navy">
          Published job
          <select
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
            value={jobId}
            onChange={(event) => setJobId(event.target.value)}
          >
            <option value="">Choose a job</option>
            {jobs.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}
          </select>
        </label>
      ) : null}
      {error ? <Alert className="mt-4" tone="error">{error}</Alert> : null}
      {message ? <Alert className="mt-4" tone="success">{message}</Alert> : null}
      <button
        className="mt-5 rounded-xl bg-royal px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy disabled:opacity-60"
        disabled={!paymentAvailable || busy || (addon.type === "per_job" && jobs.length === 0)}
        onClick={buyAddon}
        type="button"
      >
        {busy ? "Starting checkout..." : "Purchase add-on"}
      </button>
      {addon.type === "per_job" && jobs.length === 0 ? (
        <p className="mt-2 text-xs text-slate-500">Publish a job before buying this add-on.</p>
      ) : null}
    </Card>
  );
}
