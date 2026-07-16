import { test, expect } from "@playwright/test";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

// AW-2 로컬 열기 스모크 — 파일 선택 → 재생 → 스크러버 seek → 배속.
// 드롭 대신 파일 입력(setInputFiles)으로 구동한다(동등 경로).
const FIXTURE_DIR = fileURLToPath(new URL("../../../fixtures", import.meta.url));
const TTR = join(FIXTURE_DIR, "sprint_rep_sample.ttr");
const TTRM = join(FIXTURE_DIR, "replay_sample.ttrm");

test("AW-2 로컬 리플레이 열기·재생·seek·배속", async ({ page }) => {
  const fixture = existsSync(TTR) ? TTR : existsSync(TTRM) ? TTRM : null;
  test.skip(fixture === null, "fixture 리플레이 부재");

  await page.goto("/replay");
  await expect(page.getByTestId("replay-empty")).toBeVisible();

  await page.getByTestId("replay-file-input").setInputFiles(fixture!);

  // 로드 완료 → 보드·컨트롤 표시
  await expect(page.getByTestId("replay-loaded")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("board-canvas")).toBeVisible();

  const frameLabel = page.getByTestId("frame-label");
  const before = await frameLabel.textContent();

  // 재생 → 잠시 후 프레임 증가
  await page.getByTestId("play-pause").click();
  await page.waitForTimeout(500);
  await page.getByTestId("play-pause").click(); // 일시정지
  const afterPlay = await frameLabel.textContent();
  expect(afterPlay).not.toBe(before);

  // seek: 스크러버로 임의 프레임 이동
  await page.getByTestId("scrubber").fill("5");
  await expect(frameLabel).toContainText("5 /");

  // 프레임 스텝
  await page.getByTestId("step-fwd").click();
  await expect(frameLabel).toContainText("6 /");

  // 배속 변경
  await page.getByTestId("speed-select").selectOption("2");
  await expect(page.getByTestId("speed-select")).toHaveValue("2");
});
