"use client";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

export type RazorpayOrder = {
  keyId: string | number | null;
  orderId: string | number | null;
  amount: string | number | null;
  currency: string | number | null;
  planName?: string | number | null;
  addonName?: string | number | null;
};

export async function openRazorpayCheckout(
  order: RazorpayOrder,
  onDone: () => void,
  onError: (message: string) => void,
): Promise<void> {
  try {
    if (!document.getElementById("razorpay-checkout-script")) {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement("script");
        script.id = "razorpay-checkout-script";
        script.src = "https://checkout.razorpay.com/v1/checkout.js";
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Could not load Razorpay checkout."));
        document.body.appendChild(script);
      });
    }

    const Razorpay = window.Razorpay;
    if (!Razorpay) throw new Error("Razorpay checkout unavailable.");

    const instance = new Razorpay({
      key: String(order.keyId),
      amount: Number(order.amount),
      currency: String(order.currency),
      name: "Ravelyth Talent",
      description: String(order.planName ?? order.addonName ?? "Payment"),
      order_id: String(order.orderId),
      prefill: {},
      notes: {},
      theme: { color: "#1F6FEB" },
      handler: async (response: Record<string, string>) => {
        try {
          const verify = await fetch("/api/billing/verify", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            }),
          });
          const body = (await verify.json()) as {
            ok?: boolean;
            error?: { message?: string };
          };
          if (!verify.ok || !body.ok) {
            throw new Error(body.error?.message ?? "Payment verification failed.");
          }
          onDone();
        } catch (error) {
          onError(error instanceof Error ? error.message : "Payment verification failed.");
        }
      },
      modal: { ondismiss: () => undefined },
    });

    instance.open();
  } catch (error) {
    onError(error instanceof Error ? error.message : "Could not start checkout.");
  }
}
