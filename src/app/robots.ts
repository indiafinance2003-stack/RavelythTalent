import type { MetadataRoute } from "next";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * robots.txt. Authenticated areas and APIs are disallowed; the cron and
 * webhook paths are disallowed so crawlers never trigger background work.
 */
export default function robots(): MetadataRoute.Robots {
  const base = getEnv().APP_URL.replace(/\/+$/, "");

  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/jobs",
          "/companies",
          "/blog",
          "/about",
          "/pricing",
          "/faq",
          "/contact",
          "/salary-insights",
        ],
        disallow: [
          "/api/",
          "/dashboard/",
          "/recruiter/",
          "/admin/",
          "/account",
          "/login",
          "/register",
          "/reset-password",
          "/verify-email",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
