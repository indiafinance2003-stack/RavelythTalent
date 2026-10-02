'use client';

import Link from 'next/link';
import { useAsync } from '@/lib/portal-client/use-async';
import { portalGet } from '@/lib/portal-client/client';
import type { CreditBalance, CreditLedgerEntry } from '@/lib/portal-client/types';
import { formatDate, formatDateTime, titleCase } from '@/lib/portal-client/format';
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  LoadingState,
  Meter,
  PageHeader,
} from '@/components/portal/ui';

/**
 * The credit ledger.
 *
 * Credits are an append-only ledger on the server, never a number the browser
 * keeps. Every grant and every consumption appears here, so an employer can see
 * exactly why their balance changed.
 */
export function CreditsPage(): React.ReactElement {
  const credits = useAsync(
    () =>
      portalGet<{ balance: CreditBalance; ledger: CreditLedgerEntry[] }>(
        '/api/portal/employer/credits'
      ),
    []
  );

  const balance = credits.data?.balance;
  const entries = credits.data?.ledger ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Job credits"
        title="Credit balance and history"
        description="Every credit you buy and every one you spend, in the order it happened."
        action={
          <Link href="/employer/packages" className="text-sm text-accent-soft">
            Buy more credits
          </Link>
        }
      />

      {credits.loading ? <LoadingState label="Loading your credits…" /> : null}
      {credits.error ? <ErrorState message={credits.error} onRetry={credits.reload} /> : null}

      {balance ? (
        <Card>
          <CardHeader title="Balance" />
          <div className="space-y-3 p-5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">
                {balance.available} available of {balance.total} purchased
              </span>
              <span className="text-slate-500">{balance.used} used</span>
            </div>
            <Meter
              value={balance.available}
              max={Math.max(balance.total, 1)}
              label="Credits available"
              tone={balance.available > 0 ? 'bg-emerald-500' : 'bg-red-500'}
            />
            {balance.earliestExpiry ? (
              <p className="text-xs text-slate-500">
                Your earliest-expiring credits lapse on {formatDate(balance.earliestExpiry)}.
              </p>
            ) : null}
          </div>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Ledger" description="Positive numbers are credits added; negative are credits used." />
        <div className="p-5">
          {entries.length === 0 ? (
            <EmptyState
              title="No credit activity yet"
              description="Purchase a package to get started."
            />
          ) : (
            <ul className="divide-y divide-line">
              {entries.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">
                      {titleCase(entry.reason)}
                      {entry.notes ? `: ${entry.notes}` : ''}
                    </p>
                    <p className="text-xs text-slate-500">{formatDateTime(entry.createdAt)}</p>
                  </div>
                  <Badge
                    tone={
                      entry.amount > 0
                        ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/40'
                        : 'bg-slate-800 text-slate-300 ring-slate-600'
                    }
                  >
                    {entry.amount > 0 ? `+${entry.amount}` : entry.amount}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}
