import { readFileSync } from "node:fs";
import path from "node:path";

const denylist = new Set(
  readFileSync(
    path.join(process.cwd(), "src", "lib", "auth", "disposable-email-domains.txt"),
    "utf8",
  )
    .split(/\r?\n/)
    .map((domain) => domain.trim().toLowerCase())
    .filter((domain) => domain && !domain.startsWith("#")),
);

export function isDisposableEmail(email: string): boolean {
  const domain = email.trim().toLowerCase().split("@").at(-1);
  return Boolean(domain && denylist.has(domain));
}
