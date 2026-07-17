import { test, expect } from "@playwright/test";

// 홈 스모크 — 진입 UI가 렌더되고 gist 열기가 리플레이 페이지로 이동한다.
test("홈: 드롭존·gist 입력 렌더", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("dropzone")).toBeVisible();
  await expect(page.getByTestId("gist-input")).toBeVisible();
});

test("홈: gist 열기 → 경로형 /replays/<id> 이동 (M1d-1 발신)", async ({ page }) => {
  await page.goto("/");
  // client:load 아일랜드 하이드레이션 완료 전 클릭하면 핸들러가 아직 붙지 않아 유실될 수 있다
  // (wrangler pages dev는 astro preview보다 초기 스크립트 로드가 느려 경합이 드러남) — 재시도로 흡수.
  await expect(async () => {
    await page.getByTestId("gist-input").fill("abc123");
    await page.getByTestId("gist-open").click();
    await expect(page).toHaveURL(/\/replays\/abc123$/, { timeout: 500 });
  }).toPass({ timeout: 10_000 });
});

test("네비게이션 슬롯: 홈/리플레이 링크", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "리플레이" })).toBeVisible();
});
