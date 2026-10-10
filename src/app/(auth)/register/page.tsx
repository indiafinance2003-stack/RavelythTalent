import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getSiteSettings } from "@/lib/settings";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = {
  title: "Create your account",
  description:
    "Join Ravelyth Talent to find jobs and build your career, or to hire great talent across India.",
  robots: { index: false, follow: true },
};

export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");
  const settings = await getSiteSettings();
  return <RegisterForm freeJobPosts={settings.freeJobPosts} />;
}