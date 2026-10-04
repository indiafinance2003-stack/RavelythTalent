import { expect, test } from "@playwright/test";

test("login is available without optional Google OAuth credentials", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /continue with google/i })).toHaveCount(0);
});

test("robots rules exclude application and admin areas", async ({ request }) => {
  const response = await request.get("/robots.txt");
  expect(response.ok()).toBeTruthy();
  const body = await response.text();
  expect(body).toContain("/api/");
  expect(body).toContain("/dashboard/");
  expect(body).toContain("/recruiter/");
  expect(body).toContain("/admin/");
});

test("health endpoint reports a working database-backed application", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBeTruthy();
  expect(await response.json()).toMatchObject({ status: "ok", database: "up" });
});
