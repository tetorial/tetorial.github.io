import { test, expect, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

// M6-B 1vs1 양보드 동시 재생 (m6b-dual-board.md — AW-37~40). 단일 보드+플레이어 셀렉터 구조를
// 대체한다. 순수 로직(동기 판정·스왑 매핑·max 프레임)은 유닛(dual-playback.test.ts·markers.test.ts)이
// 고정하고, 여기서는 실브라우저의 양보드 렌더·스왑·왼쪽 진입을 고정한다. Worker·rawUrl 무관 —
// 로컬 fixture 재생 경로로 진입한다.
const FIXTURE_DIR = fileURLToPath(new URL("../../../fixtures", import.meta.url));
const TTRM = join(FIXTURE_DIR, "replay_sample.ttrm"); // 1vs1 (플레이어 2명, 라운드 3개)
const TTR = join(FIXTURE_DIR, "sprint_rep_sample.ttr"); // 솔로 (플레이어 1명)
const hasTTRM = existsSync(TTRM);
const hasTTR = existsSync(TTR);

async function loadFixture(page: Page, file: string): Promise<void> {
  await page.goto("/replay");
  await expect(page.getByTestId("replay-empty")).toBeVisible();
  await page.getByTestId("replay-file-input").setInputFiles(file);
  await expect(page.getByTestId("replay-loaded")).toBeVisible({ timeout: 15_000 });
}

/** frame-label "N / M"에서 총프레임 M을 읽는다. */
async function totalFrames(page: Page): Promise<number> {
  const label = (await page.getByTestId("frame-label").textContent()) ?? "";
  const m = /\/\s*(\d+)/.exec(label);
  return m ? Number(m[1]) : NaN;
}

test.describe("M6-B 1vs1 양보드 재생", () => {
  test.skip(!hasTTRM, "fixture 리플레이 부재");

  test("AW-37 1vs1은 두 플레이어 보드+공통 HUD를 동시에 렌더한다", async ({ page }) => {
    await loadFixture(page, TTRM);
    const boards = page.getByTestId("replay-boards");
    await expect(boards).toHaveAttribute("data-dual", "true");

    const slots = page.getByTestId("board-slot");
    await expect(slots).toHaveCount(2);
    // 두 보드가 각각 캔버스+HUD(Hold/Next)를 가진다.
    for (const i of [0, 1]) {
      const slot = slots.nth(i);
      await expect(slot.getByTestId("board-canvas")).toBeVisible();
      await expect(slot.getByTestId("hud-hold")).toBeVisible();
      await expect(slot.getByTestId("hud-next")).toBeVisible();
    }
    // 플레이어 셀렉터는 제거됐다(라운드 선택은 유지 — 3라운드이므로 표시).
    await expect(page.getByTestId("player-select")).toHaveCount(0);
    await expect(page.getByTestId("round-select")).toBeVisible();
  });

  test("AW-37 솔로(ttr)는 단일 보드 유지 — 스왑 버튼 없음", async ({ page }) => {
    test.skip(!hasTTR, "솔로 fixture 부재");
    await loadFixture(page, TTR);
    await expect(page.getByTestId("replay-boards")).toHaveAttribute("data-dual", "false");
    await expect(page.getByTestId("board-slot")).toHaveCount(1);
    await expect(page.getByTestId("swap-boards")).toHaveCount(0);
    await expect(page.getByTestId("player-select")).toHaveCount(0);
  });

  test("AW-38 재생 컨트롤은 한 벌 — 슬라이더는 max 총프레임, 범위 밖 seek도 무오류", async ({
    page,
  }) => {
    await loadFixture(page, TTRM);
    // 컨트롤(스크러버·재생·프레임 라벨)은 두 보드에 하나씩이 아니라 한 벌만 존재한다.
    await expect(page.getByTestId("scrubber")).toHaveCount(1);
    await expect(page.getByTestId("play-pause")).toHaveCount(1);
    await expect(page.getByTestId("frame-label")).toHaveCount(1);

    const total = await totalFrames(page);
    expect(total).toBeGreaterThan(0);
    // 슬라이더 범위는 두 보드의 max(totalFrames)와 일치한다.
    await expect(page.getByTestId("scrubber")).toHaveAttribute("max", String(total));

    // 짧은 쪽 보드의 총프레임을 넘어 max까지 seek해도 오류 없이 두 보드가 유지된다.
    await page.getByTestId("scrubber").fill(String(total));
    await expect(page.getByTestId("frame-label")).toContainText(`${total} / ${total}`);
    await expect(page.getByTestId("board-slot")).toHaveCount(2);
    await expect(page.getByTestId("board-slot").nth(0).getByTestId("board-canvas")).toBeVisible();
    await expect(page.getByTestId("board-slot").nth(1).getByTestId("board-canvas")).toBeVisible();
  });

  test("AW-39 스왑 버튼이 두 보드 위치를 바꾸고, 분기 진입은 한 벌(왼쪽 보드)만", async ({
    page,
  }) => {
    await loadFixture(page, TTRM);
    const slots = page.getByTestId("board-slot");
    const before = [
      await slots.nth(0).getAttribute("data-player"),
      await slots.nth(1).getAttribute("data-player"),
    ];

    await page.getByTestId("swap-boards").click();
    const after = [
      await slots.nth(0).getAttribute("data-player"),
      await slots.nth(1).getAttribute("data-player"),
    ];
    // 화면 배치 순서가 뒤집힌다.
    expect(after).toEqual([before[1], before[0]]);

    // 분기 버튼은 한 벌 — 왼쪽 보드 기준 진입(스왑 반영). 진입이 실제로 동작한다.
    await expect(page.getByTestId("branch-button")).toHaveCount(1);
    await page.getByTestId("branch-button").click();
    await expect(page.getByTestId("sim-panel")).toBeVisible({ timeout: 15_000 });
  });

  test("AW-40 스왑은 화면 배치만 — 각 보드의 실제 플레이어 인덱스는 불변", async ({ page }) => {
    await loadFixture(page, TTRM);
    const slots = page.getByTestId("board-slot");
    const players = async (): Promise<string[]> =>
      [
        (await slots.nth(0).getAttribute("data-player")) ?? "",
        (await slots.nth(1).getAttribute("data-player")) ?? "",
      ].sort();

    const original = await players();
    expect(original).toEqual(["0", "1"]); // 실제 플레이어 인덱스 집합

    // 스왑 → 배치만 바뀌고 실제 플레이어 인덱스 집합은 동일하다.
    await page.getByTestId("swap-boards").click();
    expect(await players()).toEqual(original);

    // 두 번 스왑하면 원래 배치로 복귀한다.
    await page.getByTestId("swap-boards").click();
    expect([
      await slots.nth(0).getAttribute("data-player"),
      await slots.nth(1).getAttribute("data-player"),
    ]).toEqual(["0", "1"]);
  });
});
