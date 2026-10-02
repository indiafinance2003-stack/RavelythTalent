'use client';

import { useCallback, useEffect, useState } from 'react';
import { portalGet } from '@/lib/portal-client/client';
import { formatApiError } from '@/lib/client/api';
import type { PortalUser } from '@/lib/portal-client/types';

/**
 * The signed-in portal user, resolved from the HttpOnly session cookie.
 *
 * `status` is explicit so a component can tell "still loading" apart from "not
 * signed in" and "signed in". Collapsing those into a single boolean is how a
 * UI ends up flashing a sign-in wall at someone who is simply mid-load.
 *
 * A 401 is treated as "not signed in", not as an error: that is the normal state
 * for a logged-out visitor, and it must not produce an error banner.
 */
export type SessionStatus = 'loading' | 'authenticated' | 'anonymous';

export interface SessionState {
  status: SessionStatus;
  user: PortalUser | null;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useSession(): SessionState {
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [user, setUser] = useState<PortalUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await portalGet<{ user: PortalUser | null }>('/api/portal/auth/me');
      setUser(data.user);
      setStatus(data.user ? 'authenticated' : 'anonymous');
      setError(null);
    } catch (caught) {
      // A 401 is the anonymous case, not a failure worth reporting.
      setUser(null);
      setStatus('anonymous');
      setError(null);
      if (caught instanceof Error && !caught.message.includes('session')) {
        setError(formatApiError(caught));
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { status, user, error, refresh };
}
