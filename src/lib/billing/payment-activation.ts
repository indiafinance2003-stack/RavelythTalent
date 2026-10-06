import { activateSubscription } from "@/lib/billing/activate";
import type { ActivateResult } from "@/lib/billing/activate";

export async function activateSubscriptionFromPayment(input: {
  orderId: string;
  paymentId: string;
  amountPaise: number;
  userId: string;
  companyId: string | null;
  planId: string;
  billingPeriod: "monthly" | "yearly";
  method?: string | null;
}): Promise<ActivateResult> {
  return activateSubscription({
    ...input,
    signatureVerified: true,
  });
}
