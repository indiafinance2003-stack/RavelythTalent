import "dotenv/config";
import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit configuration.
 *
 * `db:generate` does not need a live database; `db:push` / `db:studio` /
 * migrations do. The placeholder keeps generation working in CI without a DB.
 */
export default defineConfig({
  schema: "./src/lib/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  strict: false,
  verbose: true,
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgresql://ravelyth_app:CHANGE_ME@127.0.0.1:5432/ravelyth",
  },
});
