import "dotenv/config";
import { and, eq } from "drizzle-orm";
import {
  categories,
  companies,
  companyMembers,
  jobs,
  users,
} from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { closeDb, db, log } from "./script-db";

/**
 * Development/demo data only.
 *
 * Refuses to run when NODE_ENV=production. Everything it creates is clearly
 * labelled as demo content and uses @example.com addresses.
 */

const DEMO_PASSWORD = "Demo@12345";

function assertNotProduction(): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Refusing to run: seed:demo is disabled when NODE_ENV=production.",
    );
  }
}

async function upsertUser(
  email: string,
  fullName: string,
  role: "job_seeker" | "recruiter",
) {
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing.at(0)) {
    log(`user already present: ${email}`);
    return existing.at(0)!.id;
  }
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const inserted = await db
    .insert(users)
    .values({
      email,
      fullName,
      role,
      passwordHash,
      emailVerifiedAt: new Date(),
    })
    .returning({ id: users.id });
  log(`user created: ${email}`);
  return inserted[0]!.id;
}

async function main(): Promise<void> {
  assertNotProduction();

  const recruiterId = await upsertUser(
    "demo.recruiter@example.com",
    "Demo Recruiter",
    "recruiter",
  );
  const candidateId = await upsertUser(
    "demo.candidate@example.com",
    "Demo Candidate",
    "job_seeker",
  );

  // Demo company (approved so jobs can be published).
  const companySlug = "demo-acme-technologies";
  let companyId = (
    await db
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.slug, companySlug))
      .limit(1)
  ).at(0)?.id;

  if (!companyId) {
    companyId = (
      await db
        .insert(companies)
        .values({
          ownerUserId: recruiterId,
          name: "Acme Demo Technologies (sample)",
          slug: companySlug,
          about:
            "Sample company created by seed:demo. Safe to delete. It exists only so the job search, apply and reporting flows can be exercised locally.",
          industry: "IT & Software",
          size: "51-200",
          website: "https://example.com",
          headquarters: "Bengaluru, Karnataka",
          locations: [{ city: "Bengaluru", state: "Karnataka", country: "India" }],
          contactEmail: "hr@example.com",
          status: "approved",
          verifiedAt: new Date(),
        })
        .returning({ id: companies.id })
    )[0]!.id;
    log("company created: Acme Demo Technologies (sample)");
  } else {
    log("company already present: Acme Demo Technologies (sample)");
  }

  const existingMember = await db
    .select({ id: companyMembers.id })
    .from(companyMembers)
    .where(
      and(
        eq(companyMembers.companyId, companyId),
        eq(companyMembers.userId, recruiterId),
      ),
    )
    .limit(1);
  if (!existingMember.at(0)) {
    await db.insert(companyMembers).values({
      companyId,
      userId: recruiterId,
      role: "owner",
      status: "active",
      joinedAt: new Date(),
    });
  }

  const itCategory = (
    await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.slug, "it-software"))
      .limit(1)
  ).at(0)?.id;

  const demoJobs = [
    {
      title: "Frontend Engineer (Sample)",
      slug: "demo-frontend-engineer",
      description:
        "Sample job created by seed:demo for local testing of search, apply and reporting.",
      city: "Bengaluru",
      state: "Karnataka",
    },
    {
      title: "Backend Engineer (Sample)",
      slug: "demo-backend-engineer",
      description:
        "Sample job created by seed:demo for local testing of search, apply and reporting.",
      city: "Hyderabad",
      state: "Telangana",
    },
    {
      title: "Data Analyst (Sample)",
      slug: "demo-data-analyst",
      description:
        "Sample job created by seed:demo for local testing of search, apply and reporting.",
      city: "Pune",
      state: "Maharashtra",
    },
  ];

  for (const job of demoJobs) {
    const existing = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(eq(jobs.slug, job.slug))
      .limit(1);
    if (existing.at(0)) {
      log(`job already present: ${job.slug}`);
      continue;
    }
    await db.insert(jobs).values({
      companyId,
      postedByUserId: recruiterId,
      createdByUserId: recruiterId,
      categoryId: itCategory ?? null,
      title: job.title,
      slug: job.slug,
      description: job.description,
      responsibilities: "Sample responsibilities for local testing.",
      requirements: "Sample requirements for local testing.",
      jobType: "full_time",
      workMode: "hybrid",
      city: job.city,
      state: job.state,
      country: "India",
      salaryMinPaise: 60000000,
      salaryMaxPaise: 120000000,
      experienceMinYears: "2.0",
      experienceMaxYears: "5.0",
      openings: 2,
      status: "published",
      publishedAt: new Date(),
      approvedAt: new Date(),
      quotaPeriodKey: new Date().toISOString().slice(0, 7),
    });
    log(`job created: ${job.slug}`);
  }

  log(
    `demo complete. Logins: demo.recruiter@example.com / demo.candidate@example.com (password ${DEMO_PASSWORD})`,
  );
  log(`candidate user id: ${candidateId}`);
}

main()
  .catch((error) => {
    console.error("[seed:demo] failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
