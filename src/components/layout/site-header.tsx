import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { MobileNav, type NavLink } from "./mobile-nav";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getSiteSettings } from "@/lib/settings";
import { buttonClasses } from "@/components/ui/primitives";

const NAV_LINKS: NavLink[] = [
  { href: "/jobs", label: "Find Jobs" },
  { href: "/companies", label: "Companies" },
  { href: "/blog", label: "Career Advice" },
  { href: "/pricing", label: "Pricing" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

function dashboardHref(role: string): string {
  if (role === "admin") return "/admin";
  if (role === "recruiter") return "/recruiter";
  return "/dashboard";
}

export async function SiteHeader() {
  const [user, settings] = await Promise.all([getCurrentUser(), getSiteSettings()]);
  const showBlog = settings.featureBlog;

  const links = NAV_LINKS.filter((l) => (l.href === "/blog" ? showBlog : true));

  const authArea = user ? (
    <div className="flex items-center gap-2">
      <Link href={dashboardHref(user.role)} className={buttonClasses("secondary", "sm")}>
        Dashboard
      </Link>
    </div>
  ) : (
    <div className="flex items-center gap-2">
      <Link href="/login" className={buttonClasses("ghost", "sm")}>
        Sign in
      </Link>
      <Link href="/register" className={buttonClasses("primary", "sm")}>
        Get started
      </Link>
    </div>
  );

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6 lg:px-8">
        <Logo />

        <nav aria-label="Primary" className="hidden md:block md:flex-1">
          <ul className="flex items-center gap-1">
            {links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="rounded-lg px-3 py-2 text-sm font-semibold text-navy transition hover:bg-sky-tint/50 hover:text-royal"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto hidden md:block">{authArea}</div>

        <div className="ml-auto md:hidden">
          <MobileNav links={links} />
        </div>
      </div>
    </header>
  );
}