import 'server-only';
import type { NextRequest } from 'next/server';
import { config } from '@/lib/config';

/**
 * Resolves a stable client identity for rate limiting.
 *
 * The X-Forwarded-For / X-Real-IP headers are only trusted when
 * TRUST_PROXY_HEADERS is enabled, which corresponds to running behind a reverse
 * proxy that overwrites them. When it is not enabled, every request falls into
 * one shared bucket rather than a client-controlled one, because a spoofable
 * header would otherwise let an attacker reset their own limit at will.
 */
export function clientIdentityFromRequest(req: NextRequest): string {
  if (config.TRUST_PROXY_HEADERS) {
    const forwarded = req.headers.get('x-forwarded-for');
    const ip = forwarded?.split(',')[0]?.trim();
    if (ip) return `ip:${ip.slice(0, 64)}`;
    const realIp = req.headers.get('x-real-ip');
    if (realIp) return `ip:${realIp.slice(0, 64)}`;
  }
  return 'untrusted';
}

/** Best-effort client IP for audit records. Never used for authorization. */
export function clientIpForAudit(req: NextRequest): string | null {
  return clientIdentityFromRequest(req).startsWith('ip:')
    ? clientIdentityFromRequest(req).slice(3)
    : null;
}
