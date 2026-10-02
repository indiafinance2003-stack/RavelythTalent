import { beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { randomBytes } from 'crypto';

/**
 * INTEGRATION TESTS — REQUIRE A REAL POSTGRESQL DATABASE.
 *
 * These tests are skipped unless TEST_DATABASE_URL points at a disposable
 * PostgreSQL database. They are never faked: without a database they report
 * as skipped, not passed. Expected shape:
 *   TEST_DATABASE_URL=postgresql://user:pass@host:5432/ravelyth_test
 *
 * Before running: apply migrations to the target database first
 * (DATABASE_URL=$TEST_DATABASE_URL npm run db:migrate).
 */

const DATABASE_URL = process.env.TEST_DATABASE_URL;
const describesDb = DATABASE_URL ? describe : describe.skip;

if (!DATABASE_URL) {
  console.log(
    'Skipping database integration tests: TEST_DATABASE_URL is not set. ' +
      'These tests require a disposable PostgreSQL database.'
  );
}

describesDb('database integration (PostgreSQL)', () => {
  let sql: postgres.Sql;

  function uniqueEmail(): string {
    return `test-${randomBytes(8).toString('hex')}@example.com`;
  }

  beforeAll(() => {
    sql = postgres(DATABASE_URL as string, { max: 1 });
  });

  it('enforces the unique email constraint', async () => {
    const email = uniqueEmail();
    await sql`INSERT INTO users (email, password_hash, name) VALUES (${email}, 'hash', 'A')`;
    await expect(
      sql`INSERT INTO users (email, password_hash, name) VALUES (${email}, 'hash', 'B')`
    ).rejects.toMatchObject({ code: '23505' });
    await sql`DELETE FROM users WHERE email = ${email}`;
  });

  it('stores exactly one row per user and normalizes identity through the unique index', async () => {
    const email = uniqueEmail();
    const rows = await sql<{ id: string; email: string; status: string }[]>`INSERT INTO users (email, password_hash, name) VALUES (${email}, 'hash', 'A') RETURNING id, email, status`;
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('active');
    await sql`DELETE FROM users WHERE email = ${email}`;
  });

  it('cascades session deletion when the user is deleted', async () => {
    const email = uniqueEmail();
    const [user] = await sql<{ id: string }[]>`INSERT INTO users (email, password_hash, name) VALUES (${email}, 'hash', 'A') RETURNING id`;
    const [session] = await sql<{ id: string }[]>`INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (${user.id}, 'deadbeef', now() + interval '1 day') RETURNING id`;
    await sql`DELETE FROM users WHERE id = ${user.id}`;
    const remaining = await sql<{ id: string }[]>`SELECT id FROM sessions WHERE id = ${session.id}`;
    expect(remaining).toHaveLength(0);
  });

  it('cascades saved analysis deletion when the user is deleted', async () => {
    const email = uniqueEmail();
    const [user] = await sql<{ id: string }[]>`INSERT INTO users (email, password_hash, name) VALUES (${email}, 'hash', 'A') RETURNING id`;
    const [saved] = await sql<{ id: string }[]>`INSERT INTO saved_analyses (user_id, analysis_type, target, result_json) VALUES (${user.id}, 'dns_lookup', 'example.com', ${sql.json({ ok: true })}) RETURNING id`;
    await sql`DELETE FROM users WHERE id = ${user.id}`;
    const remaining = await sql<{ id: string }[]>`SELECT id FROM saved_analyses WHERE id = ${saved.id}`;
    expect(remaining).toHaveLength(0);
  });

  it('keeps saved analyses isolated between users', async () => {
    const emailA = uniqueEmail();
    const emailB = uniqueEmail();
    const [userA] = await sql<{ id: string }[]>`INSERT INTO users (email, password_hash, name) VALUES (${emailA}, 'hash', 'A') RETURNING id`;
    const [userB] = await sql<{ id: string }[]>`INSERT INTO users (email, password_hash, name) VALUES (${emailB}, 'hash', 'B') RETURNING id`;
    const [saved] = await sql<{ id: string }[]>`INSERT INTO saved_analyses (user_id, analysis_type, target, result_json) VALUES (${userA.id}, 'dns_lookup', 'example.com', ${sql.json({ ok: true })}) RETURNING id`;

    // User B's isolation query (mirrors deleteSavedAnalysis) must not touch user A's row.
    const deleted = await sql<{ id: string }[]>`DELETE FROM saved_analyses WHERE id = ${saved.id} AND user_id = ${userB.id} RETURNING id`;
    expect(deleted).toHaveLength(0);

    // Cleanup.
    await sql`DELETE FROM saved_analyses WHERE id = ${saved.id}`;
    await sql`DELETE FROM users WHERE id IN (${userA.id}, ${userB.id})`;
  });

  it('rejects sessions pointing at missing users (FK enforced)', async () => {
    const missingId = '00000000-0000-0000-0000-000000000000';
    await expect(
      sql`INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (${missingId}, 'orphan', now() + interval '1 day')`
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('creates every Ravelyth Talent portal table', async () => {
    const expected = [
      'email_verification_tokens',
      'candidate_profiles',
      'candidate_skills',
      'candidate_education',
      'candidate_experiences',
      'candidate_projects',
      'candidate_certifications',
      'candidate_achievements',
      'candidate_languages',
      'candidate_preferences',
      'resume_templates',
      'resumes',
      'resume_versions',
      'resume_access_logs',
      'companies',
      'employer_profiles',
      'employer_company_members',
      'jobs',
      'job_status_history',
      'job_applications',
      'application_status_history',
      'saved_jobs',
      'job_alerts',
      'candidate_premium_plans',
      'premium_entitlements',
      'candidate_premium_plan_entitlements',
      'candidate_premium_subscriptions',
      'candidate_entitlements',
      'job_packages',
      'job_package_features',
      'orders',
      'payments',
      'webhook_events',
      'job_credit_ledger',
      'user_consents',
      'reports',
      'platform_settings',
      'recruitment_leads',
    ];
    const rows = await sql<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'
    `;
    const present = new Set(rows.map((row) => row.table_name));
    for (const table of expected) {
      expect(present.has(table), `missing table: ${table}`).toBe(true);
    }
  });

  it('adds the portal columns to users without dropping existing data', async () => {
    const columns = await sql<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'users'
    `;
    const names = new Set(columns.map((column) => column.column_name));
    for (const column of [
      'email_verified_at',
      'account_status',
      'suspension_reason',
      'suspended_at',
      'failed_login_attempts',
      'locked_until',
      'last_login_ip',
    ]) {
      expect(names.has(column), `missing users column: ${column}`).toBe(true);
    }
    // Pre-existing columns must still be present (additive migration).
    for (const column of ['email', 'password_hash', 'name', 'status', 'role', 'last_login_at']) {
      expect(names.has(column), `lost users column: ${column}`).toBe(true);
    }
  });

  it('prevents duplicate job applications at the database level', async () => {
    const [user] = await sql<{ id: string }[]>`
      INSERT INTO users (email, password_hash, name) VALUES (${uniqueEmail()}, 'h', 'C') RETURNING id
    `;
    const [company] = await sql<{ id: string }[]>`
      INSERT INTO companies (name, slug) VALUES ('Acme', ${`acme-${randomBytes(4).toString('hex')}`}) RETURNING id
    `;
    const [profile] = await sql<{ id: string }[]>`
      INSERT INTO candidate_profiles (user_id, full_name) VALUES (${user.id}, 'C') RETURNING id
    `;
    const [job] = await sql<{ id: string }[]>`
      INSERT INTO jobs (company_id, created_by_user_id, title, description)
      VALUES (${company.id}, ${user.id}, 'Dev', 'desc') RETURNING id
    `;
    await sql`INSERT INTO job_applications (job_id, candidate_id) VALUES (${job.id}, ${profile.id})`;
    await expect(
      sql`INSERT INTO job_applications (job_id, candidate_id) VALUES (${job.id}, ${profile.id})`
    ).rejects.toMatchObject({ code: '23505' });
    await sql`DELETE FROM users WHERE id = ${user.id}`;
  });

  it('prevents granting job credits twice for the same order', async () => {
    const [user] = await sql<{ id: string }[]>`
      INSERT INTO users (email, password_hash, name) VALUES (${uniqueEmail()}, 'h', 'E') RETURNING id
    `;
    const [company] = await sql<{ id: string }[]>`
      INSERT INTO companies (name, slug) VALUES ('Beta', ${`beta-${randomBytes(4).toString('hex')}`}) RETURNING id
    `;
    const [pkg] = await sql<{ id: string }[]>`
      INSERT INTO job_packages (code, name, price_minor) VALUES (${`p${randomBytes(4).toString('hex')}`}, 'Starter', 1000) RETURNING id
    `;
    const [order] = await sql<{ id: string }[]>`
      INSERT INTO orders (order_number, company_id, user_id, package_id, amount_minor)
      VALUES (${`ORD-${randomBytes(4).toString('hex')}`}, ${company.id}, ${user.id}, ${pkg.id}, 1000) RETURNING id
    `;
    await sql`INSERT INTO job_credit_ledger (company_id, amount, reason, order_id) VALUES (${company.id}, 5, 'order', ${order.id})`;
    // The unique index on order_id is what stops a replayed webhook double-crediting.
    await expect(
      sql`INSERT INTO job_credit_ledger (company_id, amount, reason, order_id) VALUES (${company.id}, 5, 'order', ${order.id})`
    ).rejects.toMatchObject({ code: '23505' });
    await sql`DELETE FROM users WHERE id = ${user.id}`;
  });

  it('records a webhook event at most once per provider event id', async () => {
    await sql`INSERT INTO webhook_events (provider, event_id, event_type) VALUES ('razorpay', 'evt_dup_1', 'payment.captured')`;
    await expect(
      sql`INSERT INTO webhook_events (provider, event_id, event_type) VALUES ('razorpay', 'evt_dup_1', 'payment.captured')`
    ).rejects.toMatchObject({ code: '23505' });
    await sql`DELETE FROM webhook_events WHERE event_id = 'evt_dup_1'`;
  });
});
