import Link from "next/link";
import { Card, PageHeader } from "@/components/ui/primitives";
import { applyCampaignUnsubscribe } from "@/lib/assistant/apply-unsubscribe";
import { getEnv } from "@/lib/env";
import { verifyUnsubscribeToken } from "@/lib/assistant/unsubscribe-token";

export const dynamic = "force-dynamic";

export default async function UnsubscribePage({
  params,
}: {
  params: Promise<{ "signed-token": string }>;
}) {
  const { "signed-token": token } = await params;
  const verified = verifyUnsubscribeToken(token, getEnv().SESSION_SECRET);
  if (verified) await applyCampaignUnsubscribe(verified.email);

  return (
    <main className="mx-auto min-h-[70vh] max-w-2xl px-4 py-16 sm:px-6">
      <Card className="space-y-4">
        <PageHeader
          title={verified ? "You are unsubscribed" : "Unsubscribe link unavailable"}
          description={verified
            ? "This address has been added to Ravelyth Talent's outreach suppression list. No further campaign messages will be sent."
            : "This link is invalid or has expired. Contact the sender if you need help."}
        />
        <Link className="text-sm font-semibold text-royal hover:underline" href="/">Return to Ravelyth Talent</Link>
      </Card>
    </main>
  );
}
