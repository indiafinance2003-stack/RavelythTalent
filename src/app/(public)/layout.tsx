import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";

/**
 * Public site shell. Every page inside (public) renders on the server at
 * request time because it reads live data (jobs, categories, settings).
 */
export const dynamic = "force-dynamic";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center px-4 sm:px-6 lg:px-8">
          <Logo />
        </div>
      </header>
      <main id="main-content" className="flex-1">
        {children}
      </main>
      <footer className="border-t border-slate-200 bg-white py-8">
        <div className="mx-auto max-w-7xl px-4 text-sm text-slate-500 sm:px-6 lg:px-8">
          Ravelyth Talent - Connecting Great People with Great Opportunities
        </div>
      </footer>
    </div>
  );
}
