import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current-user";
import { SendingPausedBanner } from "@/components/admin/assistant/sending-paused-banner";

export const dynamic = "force-dynamic";

export default async function AssistantLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireAdmin();
  return (
    <div className="mx-auto w-full max-w-6xl">
      <Suspense fallback={null}>
        <SendingPausedBanner />
      </Suspense>
      {children}
    </div>
  );
}