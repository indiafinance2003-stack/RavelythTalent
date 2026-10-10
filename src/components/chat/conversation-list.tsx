import Link from "next/link";
import { Badge } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import type { ChatListItem } from "@/lib/chat/queries";

export function ConversationList({
  items,
  basePath,
  activeId,
}: {
  items: ChatListItem[];
  basePath: string;
  activeId?: string | null;
}) {
  return (
    <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {items.map((item) => {
        const active = item.id === activeId;
        return (
          <li key={item.id}>
            <Link
              href={`${basePath}?c=${item.id}`}
              className={cn(
                "block px-4 py-3 transition hover:bg-sky-tint/40",
                active && "bg-sky-tint/60",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-semibold text-navy">
                  {item.counterpartName}
                </p>
                {item.unreadCount > 0 ? (
                  <Badge tone="brand">{item.unreadCount}</Badge>
                ) : null}
              </div>
              <p className="truncate text-xs text-slate-500">{item.jobTitle}</p>
              {item.lastMessagePreview ? (
                <p className="mt-1 truncate text-xs text-slate-500">
                  {item.lastMessagePreview}
                </p>
              ) : null}
              {item.preApply ? (
                <span className="mt-1 inline-block text-[11px] font-medium text-royal">
                  Pre-application question
                </span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
