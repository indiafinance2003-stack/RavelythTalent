"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type NavLink = { href: string; label: string };

export function MobileNav({ links, action }: { links: NavLink[]; action?: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="mobile-nav"
        aria-label={open ? "Close menu" : "Open menu"}
        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300 text-navy"
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      <div
        id="mobile-nav"
        hidden={!open}
        className="fixed inset-x-0 top-16 z-40 border-b border-slate-200 bg-white shadow-lift"
      >
        <nav className="mx-auto max-w-7xl space-y-1 px-4 py-4 sm:px-6">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className={cn(
                "block rounded-xl px-3 py-2.5 text-sm font-semibold text-navy",
                "hover:bg-sky-tint/50",
              )}
            >
              {link.label}
            </Link>
          ))}
          {action ? <div className="pt-2">{action}</div> : null}
        </nav>
      </div>
    </div>
  );
}