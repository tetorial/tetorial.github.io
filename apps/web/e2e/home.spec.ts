import { test, expect } from "@playwright/test";

// 홈 스모크 — 진입 UI가 렌더되고 gist 열기가 리플레이 페이지로 이동한다.
test("홈: 드롭존·gist 입력 렌더", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("dropzone")).toBeVisible();
  await expect(page.getByTestId("gist-input")).toBeVisible();
});

test("홈: gist 열기 → /replay?gist= 이동", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("gist-input").fill("abc123");
  await page.getByTestId("gist-open").click();
  await expect(page).toHaveURL(/\/replay\?gist=abc123/);
});

test("네비게이션 슬롯: 홈/리플레이 링크", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "리플레이" })).toBeVisible();
});
