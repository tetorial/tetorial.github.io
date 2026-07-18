import { test, expect, type Page, type Locator } from "@playwright/test";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

// M6-A 리플레이 ↔ 시뮬레이터 비모달(인플레이스) 전환 (m6a-inplace-sim.md — AW-34~36).
// 오버레이 모달을 제거하고 재생 영역 자리에서 모드가 교체되는 전환을 실브라우저로 고정한다.
// 전환·복귀·포커스·키 배선이 새 레이아웃에서 그대로 동작함을 확인한다(회귀 방지). Worker·rawUrl은
// 무관 — 로컬 fixture 재생 경로로 진입한다.
const FIXTURE_DIR = fileURLToPath(new URL("../../../fixtures", import.meta.url));
const TTRM = join(FIXTURE_DIR, "replay_sample.ttrm");
const hasTTRM = existsSync(TTRM);

const CELL = 26; // SimulatorPanel의 CELL_SIZE
const TOTAL = 22; // visibleHeight(20) + bufferPeek(2), 기존 스모크와 동일 전제

/** 시뮬레이터 보드 캔버스(sim-panel로 스코프 — 재생 보드와 testid 공유). */
function simCanvas(page: Page): Locator {
  return page.getByTestId("sim-panel").getByTestId("board-canvas");
}

async function loadLocal(page: Page): Promise<void> {
  await page.goto("/replay");
  await expect(page.getByTestId("replay-empty")).toBeVisible();
  await page.getByTestId("replay-file-input").setInputFiles(TTRM);
  await expect(page.getByTestId("replay-loaded")).toBeVisible({ timeout: 15_000 });
}

/** 로드 후 분기 → 시뮬레이터 진입. seek 지정 시 재생 모드에서 먼저 이동. */
async function enterSim(page: Page, seekTo?: number): Promise<void> {
  await loadLocal(page);
  if (seekTo !== undefined) {
    await page.getByTestId("scrubber").fill(String(seekTo));
    await expect(page.getByTestId("frame-label")).toContainText(`${seekTo} /`);
  }
  await page.getByTestId("branch-button").click();
  await expect(page.getByTestId("sim-panel")).toBeVisible({ timeout: 15_000 });
  await expect(simCanvas(page)).toBeVisible();
}

/** 빈 보드에서 falling 미노의 최좌측 논리 열(y=0 ghost footprint) — w4-smoke와 동일 패턴. */
async function pieceLeftCol(canvas: Locator): Promise<number> {
  return canvas.evaluate((el) => {
    const c = el as HTMLCanvasElement;
    const ctx = c.getContext("2d")!;
    const CELL = 26;
    const COLS = 10;
    const TOTAL = 22;
    const rect = c.getBoundingClientRect();
    const sx = c.width / rect.width;
    const sy = c.height / rect.height;
    const sample = (cssX: number, cssY: number): Uint8ClampedArray =>
      ctx.getImageData(Math.floor(cssX * sx), Math.floor(cssY * sy), 1, 1).data;
    const bg = sample(CELL / 2, CELL / 2);
    const isBg = (d: Uint8ClampedArray): boolean =>
      Math.abs(d[0]! - bg[0]!) < 10 &&
      Math.abs(d[1]! - bg[1]!) < 10 &&
      Math.abs(d[2]! - bg[2]!) < 10;
    const py = (TOTAL - 1) * CELL + CELL / 2;
    for (let x = 0; x < COLS; x++) {
      if (!isBg(sample(x * CELL + CELL / 2, py))) return x;
    }
    return -1;
  });
}

test.describe("M6-A 비모달 인플레이스 전환", () => {
  test.skip(!hasTTRM, "fixture 리플레이 부재");

  test("AW-34 진입은 오버레이 모달 없이 같은 자리에서 모드 전환 — fixed·backdrop·dialog 부재", async ({
    page,
  }) => {
    await loadLocal(page);
    // 진입 전: 재생 컨트롤·보드가 존재.
    await expect(page.getByTestId("scrubber")).toBeVisible();

    await page.getByTestId("branch-button").click();
    const sim = page.getByTestId("sim-panel");
    await expect(sim).toBeVisible({ timeout: 15_000 });
    // 보드·HUD가 같은 자리에 유지된다(레이아웃 시프트 최소화).
    await expect(simCanvas(page)).toBeVisible();
    await expect(sim.getByTestId("hud-next")).toBeVisible();
    await expect(sim.getByTestId("hud-hold")).toBeVisible();

    // role="dialog" 아님 — 활성 상태에서 열린 dialog가 없다(오버레이 모달 제거).
    await expect(sim).not.toHaveAttribute("role", "dialog");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    // fixed 포지셔닝·backdrop 없음 — 같은 문서 흐름 안의 블록(position: static).
    await expect(sim).toHaveCSS("position", "static");
  });

  test("AW-35 팔레트가 재생 슬라이더 자리에 놓이고, 재생 슬라이더는 편집 중 미표시", async ({
    page,
  }) => {
    await enterSim(page);
    const sim = page.getByTestId("sim-panel");
    // 편집 영역에 팔레트·도구 UI가 노출된다.
    await expect(sim.getByTestId("cell-palette")).toBeVisible();
    await expect(sim.getByTestId("tool-cell")).toBeVisible();
    // 재생 전용 크롬(슬라이더·재생 버튼·분기 바)은 편집 중 표시되지 않는다.
    await expect(page.getByTestId("scrubber")).toHaveCount(0);
    await expect(page.getByTestId("play-pause")).toHaveCount(0);
    await expect(page.getByTestId("branch-button")).toHaveCount(0);
  });

  test("AW-36 종료 시 분기 프레임 복귀 + 재생 컨트롤 복원", async ({ page }) => {
    await enterSim(page, 30);
    await page.getByTestId("sim-exit").click();
    await expect(page.getByTestId("sim-panel")).toBeHidden();
    // 분기 프레임(30)으로 복귀(첫 프레임 0 아님) + 재생 슬라이더 재등장.
    await expect(page.getByTestId("frame-label")).toContainText("30 /");
    await expect(page.getByTestId("scrubber")).toBeVisible();
  });

  test("AW-36 편집 중 버튼 클릭 후 포커스 잔류 없음(Space 누출 방지)", async ({ page }) => {
    await enterSim(page);
    // 셀 2개 → undo 1회 후에도 canUndo 유지(버튼이 disabled로 포커스를 잃지 않도록).
    await simCanvas(page).click({ position: { x: 3 * CELL + 13, y: (TOTAL - 1 - 8) * CELL + 13 } });
    await simCanvas(page).click({ position: { x: 6 * CELL + 13, y: (TOTAL - 1 - 8) * CELL + 13 } });
    await page.getByTestId("sim-undo").click();
    // 모달 제거 과정에서 blur 배선이 사라지지 않았음을 고정한다(W4 결함7).
    const active = await page.evaluate(
      () => document.activeElement?.getAttribute("data-testid") ?? null,
    );
    expect(active).not.toBe("sim-undo");
  });

  test("AW-36 새 레이아웃에서 키 배선(DAS/ARR) 유지 — 홀드 시 벽까지 이동", async ({ page }) => {
    await enterSim(page);
    const before = await pieceLeftCol(simCanvas(page));
    expect(before).toBeGreaterThanOrEqual(0); // 빈 보드에 falling 미노 존재
    // 전환 구조를 바꿔도 attachDom·rAF tick 수명 주기가 유지되어야 한다(명세 주의④).
    await page.keyboard.down("ArrowLeft");
    await page.waitForTimeout(500);
    const held = await pieceLeftCol(simCanvas(page));
    await page.keyboard.up("ArrowLeft");
    expect(before - held).toBeGreaterThanOrEqual(2);
    expect(held).toBe(0);
  });

  test("AW-36 수집함이 편집↔재생 전환 중 유지된다", async ({ page }) => {
    await enterSim(page);
    // 노트 완성 → 수집함 1개(전환: 편집 → 재생).
    await page.getByTestId("comment-input").fill("전환 유지 확인");
    await page.getByTestId("add-page").click();
    await page.getByTestId("sim-finish").click();
    await expect(page.getByTestId("sim-panel")).toBeHidden();
    await expect(page.getByTestId("collected-notes")).toContainText("수집한 노트 1개");

    // 다시 편집 진입(전환: 재생 → 편집) — 수집함은 그대로 유지된다.
    await page.getByTestId("branch-button").click();
    await expect(page.getByTestId("sim-panel")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("collected-notes")).toContainText("수집한 노트 1개");
  });
});
