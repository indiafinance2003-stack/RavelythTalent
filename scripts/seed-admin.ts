import "dotenv/config";
import { eq } from "drizzle-orm";
import { users } from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { closeDb, db, log } from "./script-db";

/**
 * Creates or updates the administrator account from ADMIN_NAME / ADMIN_EMAIL /
 * ADMIN_PASSWORD. Idempotent: safe to run on every deploy. The admin is
 * pre-verified so the owner can log in immediately.
 */
async function main(): Promise<void> {
  const fullName = (process.env.ADMIN_NAME ?? "").trim() || "Liky";
  const email = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "";

  if (!email) throw new Error("ADMIN_EMAIL is required (set it in .env).");
  if (!password) throw new Error("ADMIN_PASSWORD is required (set it in .env).");
  if (password.length < 8) {
    throw new Error("ADMIN_PASSWORD must be at least 8 characters.");
  }

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  const passwordHash = await hashPassword(password);

  if (existing.at(0)) {
    await db
      .update(users)
      .set({
        fullName,
        passwordHash,
        role: "admin",
        status: "active",
        emailVerifiedAt: new Date(),
        failedLoginAttempts: 0,
        lockedUntil: null,
        updatedAt: new Date(),
        deletedAt: null,
      })
      .where(eq(users.id, existing.at(0)!.id));
    log(`admin updated: ${email}`);
  } else {
    await db.insert(users).values({
      email,
      fullName,
      passwordHash,
      role: "admin",
      status: "active",
      emailVerifiedAt: new Date(),
    });
    log(`admin created: ${email}`);
  }
}

main()
  .catch((error) => {
    console.error("[seed:admin] failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
