'use client';

import { Button } from '@/components/portal/ui';

/**
 * Page navigation for endpoints that return a page of rows but no total.
 *
 * `hasNext` is derived from the page being FULL, not from it being short. A
 * short page is conclusive, but a full page is only evidence that there *may*
 * be more, so the Next control stays enabled and simply comes back empty if
 * this was the last page. That is the honest reading of an API that does not
 * report a count.
 */
export function PageNav({
  offset,
  limit,
  hasNext,
  onChange,
}: {
  offset: number;
  limit?: number;
  hasNext: boolean;
  onChange: (offset: number) => void;
}): React.ReactElement | null {
  const step = limit ?? 25;
  if (offset === 0 && !hasNext) return null;

  return (
    <div className="flex items-center justify-between text-sm">
      <p className="text-slate-500">{offset === 0 ? 'First page' : `After row ${offset}`}</p>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={offset === 0}
          onClick={() => onChange(Math.max(offset - step, 0))}
        >
          Previous
        </Button>
        <Button variant="secondary" size="sm" disabled={!hasNext} onClick={() => onChange(offset + step)}>
          Next
        </Button>
      </div>
    </div>
  );
}

export function Pager({
  offset,
  limit,
  total,
  onChange,
}: {
  offset: number;
  limit: number;
  total: number;
  onChange: (offset: number) => void;
}): React.ReactElement | null {
  const hasNext = offset + limit < total;
  const hasPrevious = offset > 0;
  if (!hasNext && !hasPrevious) return null;

  return (
    <div className="flex items-center justify-between text-sm">
      <p className="text-slate-500">
        {total === 0 ? '0 results' : `${offset + 1}–${Math.min(offset + limit, total)} of ${total}`}
      </p>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={!hasPrevious}
          onClick={() => onChange(Math.max(offset - limit, 0))}
        >
          Previous
        </Button>
        <Button variant="secondary" size="sm" disabled={!hasNext} onClick={() => onChange(offset + limit)}>
          Next
        </Button>
      </div>
    </div>
  );
}
