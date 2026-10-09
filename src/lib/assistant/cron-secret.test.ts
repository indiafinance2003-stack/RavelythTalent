import { beforeEach, describe, expect, it, vi } from "vitest";

const headerStore = { value: new Headers() };

vi.mock("next/headers", () => ({
  headers: async () => headerStore.value,
}));

import { assertCronRequest } from "@/lib/security";

describe("assertCronRequest", () => {
  beforeEach(() => {
    headerStore.value = new Headers();
  });

  it("resolves for the correct x-cron-secret", async () => {
    headerStore.value = new Headers({ "x-cron-secret": process.env.CRON_SECRET ?? "" });
    await expect(assertCronRequest()).resolves.toBeUndefined();
  });

  it("rejects a missing secret", async () => {
    await expect(assertCronRequest()).rejects.toMatchObject({ status: 401 });
  });

  it("rejects a wrong secret", async () => {
    headerStore.value = new Headers({ "x-cron-secret": "definitely-wrong" });
    await expect(assertCronRequest()).rejects.toMatchObject({ status: 401 });
  });
});
