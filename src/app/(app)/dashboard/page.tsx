import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";

/** Entry point for /dashboard: sends each signed-in user to the right home. */
export default async function DashboardIndexPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Fdashboard");
  if (!user.emailVerifiedAt) redirect("/verify-email");
  if (user.role === "admin") redirect("/admin");
  if (user.role === "recruiter") redirect("/recruiter");
  redirect("/dashboard/profile");
}
