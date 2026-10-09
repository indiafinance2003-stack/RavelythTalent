import "server-only";
import { resolveMx } from "node:dns/promises";
import { and, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  assistantSettings,
  companyLeads,
  companyTargets,
  suppressedEmails,
  targetEmails,
} from "@/lib/db/schema";
import { CRAWL_LIMITS, fetchPage } from "./crawler/network";
import { fetchRobots, robotsAllows } from "./crawler/robots";
import {
  detectContactForm,
  discoverCandidatePaths,
  extractEmailsFromHtml,
  type ExtractedEmail,
} from "./crawler/extract";
import { normalizeTargetDomain } from "./targets-csv";

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export type CrawlTarget = typeof companyTargets.$inferSelect;
export type CrawlOptions = {
  maxPages?: number;
  resolve?: (hostname: string) => Promise<string[]>;
  fetchFn?: typeof fetch;
  hasMx?: (domain: string) => Promise<boolean>;
};

export type CrawlOutcome = {
  targetId: string;
  status: CrawlTarget["status"];
  emailsFound: number;
  pagesCrawled: number;
  contactFormUrl: string | null;
  error: string | null;
};

/**
 * Checks whether a domain has at least one MX record. Returns false on any DNS
 * failure so a lookup problem is treated as "not verified" rather than fatal.
 */
export async function domainHasMx(domain: string): Promise<boolean> {
  try {
    const records = await resolveMx(domain);
    return records.some((record) => record.exchange && record.exchange.trim() !== "");
  } catch {
    return false;
  }
}

function homepageUrl(domain: string): string {
  return `https://${domain}/`;
}

/**
 * Crawls one target: fetches robots.txt, then up to maxPagesPerSite pages
 * (homepage plus discovered contact/about/careers paths), collecting emails on
 * the site's own domain and detecting contact forms. Never submits forms.
 */
export async function crawlTarget(
  target: CrawlTarget,
  options: CrawlOptions = {},
): Promise<CrawlOutcome> {
  const maxPages = options.maxPages ?? CRAWL_LIMITS.maxPagesPerSite;
  const domain = target.domain || normalizeTargetDomain(target.websiteUrl);
  const origin = `https://${domain}`;

  const collected = new Map<string, ExtractedEmail>();
  let contactFormUrl: string | null = null;
  let pagesCrawled = 0;

  try {
    const robots = await fetchRobots(origin, {
      resolve: options.resolve,
      fetchFn: options.fetchFn,
    });

    const visited = new Set<string>();
    const queue: string[] = [homepageUrl(domain)];

    while (queue.length && pagesCrawled < maxPages) {
      const current = queue.shift()!;
      const path = new URL(current).pathname;
      if (visited.has(path)) continue;
      visited.add(path);
      if (!robotsAllows(robots, path)) continue;

      let page: { url: string; body: string };
      try {
        const fetched = await fetchPage(current, {
          resolve: options.resolve,
          fetchFn: options.fetchFn,
        });
        page = { url: fetched.url, body: fetched.body };
      } catch {
        continue;
      }
      pagesCrawled += 1;

      for (const email of extractEmailsFromHtml(page.body, page.url, domain)) {
        if (!collected.has(email.email)) collected.set(email.email, email);
      }
      if (contactFormUrl === null && detectContactForm(page.body)) {
        contactFormUrl = page.url;
      }

      for (const discovered of discoverCandidatePaths(page.body, page.url)) {
        const resolved = new URL(discovered, origin).pathname;
        if (!visited.has(resolved) && !queue.includes(resolved)) {
          queue.push(new URL(discovered, origin).toString());
        }
      }
      await sleep(CRAWL_LIMITS.sameHostDelayMs);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Crawl failed.";
    return {
      targetId: target.id,
      status: "no_contact_found",
      emailsFound: 0,
      pagesCrawled,
      contactFormUrl: null,
      error: message.slice(0, 500),
    };
  }

  const rawEmails = [...collected.values()];
  const usable = new Set(await filterKnownEmails(rawEmails.map((item) => item.email)));
  const emails = rawEmails.filter((item) =>
    usable.has(item.email.toLocaleLowerCase("en")),
  );
  const hasMx = options.hasMx ? await options.hasMx(domain) : await domainHasMx(domain);

  await persistCrawl(target.id, emails, hasMx);

  let status: CrawlTarget["status"];
  if (emails.length) {
    status = "emails_found";
  } else if (contactFormUrl) {
    status = "contact_form_only";
  } else {
    status = "no_contact_found";
  }

  return {
    targetId: target.id,
    status,
    emailsFound: emails.length,
    pagesCrawled,
    contactFormUrl,
    error: null,
  };
}

async function persistCrawl(
  targetId: string,
  emails: ExtractedEmail[],
  hasMx: boolean,
): Promise<void> {
  if (!emails.length) return;
  await db.transaction(async (tx) => {
    for (const email of emails) {
      await tx.insert(targetEmails)
        .values({
          targetId,
          email: email.email,
          kind: email.kind,
          sourceUrl: email.sourceUrl,
          mxOk: hasMx,
        })
        .onConflictDoNothing();
    }
  });
}

/**
 * Removes emails already suppressed or already stored as a CRM lead so they are
 * never recorded or re-surfaced for this target. Case-insensitive match.
 */
export async function filterKnownEmails(emails: string[]): Promise<string[]> {
  if (!emails.length) return [];
  const lowered = emails.map((email) => email.toLocaleLowerCase("en"));
  const [suppressed, leads] = await Promise.all([
    db.select({ email: suppressedEmails.email }).from(suppressedEmails)
      .where(inArray(sql`lower(${suppressedEmails.email})`, lowered)),
    db.select({ email: companyLeads.email }).from(companyLeads)
      .where(inArray(sql`lower(${companyLeads.email})`, lowered)),
  ]);
  const known = new Set([
    ...suppressed.map((row) => row.email.toLocaleLowerCase("en")),
    ...leads.map((row) => row.email.toLocaleLowerCase("en")),
  ]);
  return emails.filter((email) => !known.has(email.toLocaleLowerCase("en")));
}

/** Runs `worker` over `items` with a fixed concurrency limit. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const runners = Array.from(
    { length: Math.max(1, Math.min(limit, items.length)) },
    async () => {
      for (;;) {
        const index = next++;
        if (index >= items.length) return;
        results[index] = await worker(items[index]!);
      }
    },
  );
  await Promise.all(runners);
  return results;
}

/**
 * Claims each target (marks it crawling), crawls it and records the result,
 * at most `CRAWL_LIMITS.concurrency` sites at once. The "crawling" status is
 * only overwritten after that target's crawl finishes.
 */
export async function crawlTargets(ids: string[]): Promise<CrawlOutcome[]> {
  if (!ids.length) return [];
  const rows = await db.select().from(companyTargets)
    .where(inArray(companyTargets.id, ids));
  return mapWithConcurrency(rows, CRAWL_LIMITS.concurrency, async (target) => {
    const now = new Date();
    await db.update(companyTargets)
      .set({ status: "crawling", updatedAt: now })
      .where(eq(companyTargets.id, target.id));
    const outcome = await crawlTarget(target);
    await db.update(companyTargets)
      .set({
        status: outcome.status,
        contactFormUrl: outcome.contactFormUrl,
        crawlError: outcome.error,
        pagesCrawled: outcome.pagesCrawled,
        lastCrawledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(companyTargets.id, target.id));
    return outcome;
  });
}

/** Targets the cron job should process: never-crawled first, then stale (>7d). */
export async function selectDueTargetIds(limit: number): Promise<string[]> {
  const staleBefore = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const rows = await db.select({ id: companyTargets.id })
    .from(companyTargets)
    .where(and(
      inArray(companyTargets.status, ["new", "crawled", "no_contact_found"]),
      or(
        isNull(companyTargets.lastCrawledAt),
        lte(companyTargets.lastCrawledAt, staleBefore),
      ),
    ))
    .orderBy(companyTargets.lastCrawledAt, companyTargets.createdAt)
    .limit(limit);
  return rows.map((row) => row.id);
}

/**
 * Cron entry point. Honors the crawlEnabled switch and crawlPerRun cap
 * (clamped to 1..50), selecting never-crawled then stale targets. A disabled
 * switch returns immediately without crawling anything.
 */
export async function runScheduledCrawl(): Promise<{
  enabled: boolean;
  crawled: number;
  outcomes: CrawlOutcome[];
}> {
  await db.insert(assistantSettings).values({ id: 1 }).onConflictDoNothing();
  const [settings] = await db.select({
    crawlEnabled: assistantSettings.crawlEnabled,
    crawlPerRun: assistantSettings.crawlPerRun,
  })
    .from(assistantSettings)
    .where(eq(assistantSettings.id, 1))
    .limit(1);
  if (!settings?.crawlEnabled) {
    return { enabled: false, crawled: 0, outcomes: [] };
  }
  const limit = Math.max(1, Math.min(settings.crawlPerRun, 50));
  const ids = await selectDueTargetIds(limit);
  const outcomes = await crawlTargets(ids);
  return { enabled: true, crawled: outcomes.length, outcomes };
}
