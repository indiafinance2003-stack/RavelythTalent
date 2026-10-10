"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Card } from "@/components/ui/primitives";
import { formatPaise } from "@/lib/utils";
import { openRazorpayCheckout } from "./razorpay-checkout";

export function InternshipCreditPurchase({
  companyId,
  paymentAvailable,
  unitPricePaise,
}: {
  companyId: string;
  paymentAvailable: boolean;
  unitPricePaise: number;
}) {
  const router = useRouter();
  const [count, setCount] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function buyCredits() {
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      const response = await fetch("/api/billing/order", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          purpose: "internship_post",
          companyId,
          count,
        }),
      });
      const body = (await response.json()) as {
        ok: boolean;
        data?: {
          keyId: string | number | null;
          orderId: string | number | null;
          amount: string | number | null;
          currency: string | number | null;
          planName?: string | number | null;
        };
        error?: { message?: string };
      };
      if (!response.ok || !body.ok || !body.data) {
        throw new Error(body.error?.message ?? "Could not start internship credit checkout.");
      }
      await openRazorpayCheckout(
        body.data,
        () => {
          setMessage(`Payment verified. ${count} internship credit${count === 1 ? "" : "s"} added.`);
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
      <h2 className="text-lg font-bold text-navy">Internship credits</h2>
      <p className="mt-2 flex-1 text-sm text-slate-600">
        Each credit lets you post one internship once your free ones are used.
      </p>
      <div className="mt-4 flex items-center gap-3">
        <label className="text-sm font-medium text-navy">
          Credits
          <input
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            min="1"
            max="50"
            name="count"
            onChange={(event) => setCount(Math.max(1, Math.min(50, Number(event.target.value) || 1)))}
            type="number"
            value={count}
          />
        </label>
        <p className="mt-5 text-sm text-slate-500">
          {formatPaise(unitPricePaise)} each
        </p>
        <p className="mt-5 font-semibold text-navy">{formatPaise(unitPricePaise * count)}</p>
      </div>
      {!paymentAvailable ? (
        <p className="mt-4 text-sm text-amber-900">
          Online payment will be available soon.{" "}
          <Link className="font-semibold underline" href="/contact">
            Contact us to subscribe
          </Link>
          .
        </p>
      ) : null}
      {error ? <Alert className="mt-4" tone="error">{error}</Alert> : null}
      {message ? <Alert className="mt-4" tone="success">{message}</Alert> : null}
      <button
        className="mt-5 rounded-xl bg-royal px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy disabled:opacity-60"
        disabled={!paymentAvailable || busy}
        onClick={buyCredits}
        type="button"
      >
        {busy ? "Starting checkout..." : "Buy internship credits"}
      </button>
    </Card>
  );
}