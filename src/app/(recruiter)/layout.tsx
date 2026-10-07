import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { DashboardShell } from "@/components/dashboard/shell";
import { Logo } from "@/components/brand/logo";

export const dynamic = "force-dynamic";

/** Shared shell for every `/recruiter/*` route (route group `(recruiter)`). */
export default async function RecruiterLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Frecruiter");
  if (!user.emailVerifiedAt) redirect("/verify-email");
  if (user.role === "job_seeker") redirect("/dashboard");

  return (
    <DashboardShell
      bell={{
        href: "/recruiter/applications",
        label: "Applicants",
      }}
      brand={<Logo href="/recruiter" />}
      user={{ name: user.fullName, role: user.role }}
      variant="employer"
    >
      {children}
    </DashboardShell>
  );
}
