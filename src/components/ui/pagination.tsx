import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function Pagination({
  page,
  totalPages,
  basePath,
  params,
}: {
  page: number;
  totalPages: number;
  basePath: string;
  params: Record<string, string | undefined>;
}) {
  if (totalPages <= 1) return null;

  const href = (target: number) => {
    const sp = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value && key !== "page") sp.set(key, value);
    }
    if (target > 1) sp.set("page", String(target));
    const qs = sp.toString();
    return `${basePath}${qs ? `?${qs}` : ""}`;
  };

  const window = 2;
  const pages: number[] = [];
  for (
    let p = Math.max(1, page - window);
    p <= Math.min(totalPages, page + window);
    p += 1
  ) {
    pages.push(p);
  }

  return (
    <nav aria-label="Pagination" className="mt-10 flex items-center justify-center gap-1.5">
      <PageLink href={href(Math.max(1, page - 1))} disabled={page <= 1} aria-label="Previous page">
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </PageLink>

      {pages[0] && pages[0] > 1 ? (
        <>
          <PageLink href={href(1)}>1</PageLink>
          {pages[0] > 2 ? <span className="px-1 text-slate-400">…</span> : null}
        </>
      ) : null}

      {pages.map((p) => (
        <PageLink key={p} href={href(p)} active={p === page} aria-current={p === page ? "page" : undefined}>
          {p}
        </PageLink>
      ))}

      {pages.at(-1) && pages.at(-1)! < totalPages ? (
        <>
          {pages.at(-1)! < totalPages - 1 ? (
            <span className="px-1 text-slate-400">…</span>
          ) : null}
          <PageLink href={href(totalPages)}>{totalPages}</PageLink>
        </>
      ) : null}

      <PageLink
        href={href(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages}
        aria-label="Next page"
      >
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </PageLink>
    </nav>
  );
}

function PageLink({
  href,
  children,
  active,
  disabled,
  ...rest
}: {
  href: string;
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
} & React.ComponentProps<"a">) {
  const className = cn(
    "inline-flex h-9 min-w-9 items-center justify-center rounded-xl px-3 text-sm font-semibold transition",
    active
      ? "bg-royal text-white"
      : "border border-slate-300 bg-white text-navy hover:border-royal hover:text-royal",
    disabled && "pointer-events-none opacity-40",
  );

  return (
    <Link href={href} className={className} aria-disabled={disabled || undefined} {...rest}>
      {children}
    </Link>
  );
}