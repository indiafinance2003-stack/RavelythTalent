import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

/**
 * Frontend/backend call contract.
 *
 * Every portal API call the UI makes is matched against the verbs that route
 * actually implements. A verb mismatch is a silent runtime failure: the screen
 * looks correct, the form validates, the request goes out, and the server
 * answers 405. Nothing in the component would hint at it.
 *
 * This is not hypothetical — the employer company screen sent `PUT` to a route
 * implementing only `PATCH`, so company details could never be saved, and no
 * unit test of that component would have failed.
 */

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const API_ROOT = join(SRC, 'app', 'api', 'portal');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (['node_modules', '.next', '.git'].includes(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/**
 * A path argument is a single-quoted string or a template literal. The template
 * branch deliberately allows single quotes, because a path such as
 * `/packages${flag ? '?includeInactive=1' : ''}` contains them and a single
 * combined character class would truncate the match at the first inner quote.
 */
const PATH = "(?:`([^`]+)`|'([^']+)')";

const RE_SEND = new RegExp(
  "portalSend<?[^>]*?>?\\s*\\(\\s*['\"]?(GET|POST|PUT|PATCH|DELETE)['\"]?\\s*,\\s*" + PATH,
  'g'
);
const RE_POST = new RegExp('portal(?:Post|Upload)<?[^>]*?>?\\s*\\(\\s*' + PATH, 'g');
const RE_GET = new RegExp('portal(?:Get|Delete)<?[^>]*?>?\\s*\\(\\s*' + PATH, 'g');

/**
 * A slash-prefixed interpolation is a path segment (`/jobs/${jobId}`) and
 * becomes '*', so it can match a route's `[id]`. A bare interpolation is
 * conditional query building and is dropped. Both happen before the query split,
 * because the bare form can itself contain a '?'.
 */
function normalise(raw: string): string {
  return (
    raw
      .replace(/\/\$\{[^}]*\}/g, '/*')
      .replace(/\$\{[^}]*\}/g, '')
      .replace(/\[[^\]]+\]/g, '*')
      .split('?')[0]!
      .replace(/\/+/g, '/')
      .replace(/\/$/, '') || '/'
  );
}

interface Contract {
  called: Map<string, Set<string>>;
  defined: Map<string, Set<string>>;
}

function collect(): Contract {
  const called = new Map<string, Set<string>>();
  const add = (verb: string, templated?: string, single?: string): void => {
    const raw = templated ?? single;
    if (!raw || !raw.startsWith('/api/portal')) return;
    const key = normalise(raw);
    if (!called.has(key)) called.set(key, new Set());
    called.get(key)!.add(verb);
  };

  for (const file of walk(SRC)) {
    if (!/\.tsx?$/.test(file)) continue;
    // Route handlers are not the UI; this checks the screens a user operates.
    if (file.startsWith(join(SRC, 'app', 'api'))) continue;
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(RE_SEND)) add(m[1]!, m[2], m[3]);
    for (const m of text.matchAll(RE_POST)) add('POST', m[1], m[2]);
    for (const m of text.matchAll(RE_GET)) add('GET', m[1], m[2]);
  }

  const defined = new Map<string, Set<string>>();
  for (const file of walk(API_ROOT)) {
    if (!file.endsWith('route.ts')) continue;
    const text = readFileSync(file, 'utf8');
    const rel = file.slice(API_ROOT.length).replace(/\\/g, '/').replace('/route.ts', '');
    const set = new Set<string>();
    for (const m of text.matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)/g)) {
      set.add(m[1]!);
    }
    defined.set(normalise(`/api/portal${rel}`), set);
  }

  return { called, defined };
}

const { called, defined } = collect();

describe('frontend/backend API contract', () => {
  it('found a meaningful number of portal call sites and routes', () => {
    // Guards against the collector silently matching nothing, which would make
    // every assertion below pass vacuously.
    expect(called.size).toBeGreaterThan(20);
    expect(defined.size).toBeGreaterThan(20);
  });

  it('every API path the UI calls is actually routed', () => {
    const missing = [...called.keys()].filter((path) => !defined.has(path)).sort();
    expect(missing).toEqual([]);
  });

  it('every verb the UI uses is implemented by the route it targets', () => {
    const mismatches: string[] = [];
    for (const [path, verbs] of called) {
      const available = defined.get(path);
      if (!available) continue;
      for (const verb of verbs) {
        if (!available.has(verb)) mismatches.push(`${verb} ${path}`);
      }
    }
    expect(mismatches.sort()).toEqual([]);
  });

  it('the gateway webhook is never called from the browser', () => {
    // The webhook is the payment provider's callback. A browser that could
    // reach it would be able to feed the server a forged "paid" event.
    expect(called.has('/api/portal/payments/webhook')).toBe(false);
  });

  it('the payment confirmation is reached from the checkout flow', () => {
    // The one call allowed to finalise a payment, and it must be used.
    expect(called.has('/api/portal/payments/confirm')).toBe(true);
  });
});
