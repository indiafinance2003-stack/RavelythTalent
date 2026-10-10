import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/current-user";
import { Alert, PageHeader } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Messages",
  description: "Conversations with candidates.",
};

export default async function RecruiterMessagesPage() {
  const user = await requireUser("/recruiter/messages");
  return (
    <div className="space-y-6">
      <PageHeader title="Messages" description="Conversations with candidates." />
      <Alert tone="info" title="Chat coming soon">
        The chat interface is being set up.
      </Alert>
    </div>
  );
}