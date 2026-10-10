import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { countUnreadNotifications } from "@/lib/notifications";
import { isGlobalChatEnabled } from "@/lib/chat/gate";
import { DashboardShell } from "@/components/dashboard/shell";
import { Logo } from "@/components/brand/logo";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Fdashboard");
  if (!user.emailVerifiedAt) redirect("/verify-email");

  const unread = await countUnreadNotifications(user.id);
  const chatEnabled = await isGlobalChatEnabled();

  return (
    <DashboardShell
      bell={{
        count: unread,
        href: "/dashboard/notifications",
        label: "Notifications",
      }}
      brand={<Logo href="/dashboard" />}
      chatEnabled={chatEnabled}
      user={{ name: user.fullName, role: user.role }}
      variant="candidate"
    >
      {children}
    </DashboardShell>
  );
}
