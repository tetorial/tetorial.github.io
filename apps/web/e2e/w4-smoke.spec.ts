import { test, expect, type Page, type Locator } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

// W4-b 배선 안정화 — 실기기 스모크에서 발견된 apps/web 조립 결함 7건의 실브라우저 재현.
// 규범: mock은 Worker·rawUrl 네트워크만. rAF·canvas 좌표·버튼 존재는 실 페이지에서 검증한다.
const FIXTURE_DIR = fileURLToPath(new URL("../../../fixtures", import.meta.url));
const TTRM = join(FIXTURE_DIR, "replay_sample.ttrm");
const hasTTRM = existsSync(TTRM);

/** /replay에 로컬 fixture를 로드한다(파일 입력 = 드롭과 동등 경로). */
async function loadLocal(page: Page): Promise<void> {
  await page.goto("/replay");
  await expect(page.getByTestId("replay-empty")).toBeVisible();
  await page.getByTestId("replay-file-input").setInputFiles(TTRM);
  await expect(page.getByTestId("replay-loaded")).toBeVisible({ timeout: 15_000 });
}

/** 시뮬레이터 보드 캔버스(재생 보드와 구별 — 모달 내부로 스코프). */
function simCanvas(page: Page): Locator {
  return page.getByTestId("sim-panel").getByTestId("board-canvas");
}

/** 로드 후 분기 → 시뮬레이터 진입. seek 지정 시 먼저 이동. */
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

/**
 * 보드 캔버스에서 falling 미노의 최좌측 논리 열을 픽셀로 읽는다(빈 보드 전제).
 * ghost가 바닥까지 내려오므로 최하단 행(y=0)의 미노 열 footprint = 미노 최좌측 열.
 */
async function pieceLeftCol(canvas: Locator): Promise<number> {
  return canvas.evaluate((el) => {
    const canvas = el as HTMLCanvasElement;
    const ctx = canvas.getContext("2d")!;
    const CELL = 26;
    const COLS = 10;
    const TOTAL = 22; // visibleHeight(20) + bufferPeek(2)
    // CSS px → 내부(device) px 비율은 실제 표시 크기 기준으로 계산한다(좌표 계약 검증의 핵심).
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    const sample = (cssX: number, cssY: number): Uint8ClampedArray =>
      ctx.getImageData(Math.floor(cssX * sx), Math.floor(cssY * sy), 1, 1).data;
    const bg = sample(CELL / 2, CELL / 2); // 상단 좌측 셀 중앙 = 빈 배경 기준
    const isBg = (d: Uint8ClampedArray): boolean =>
      Math.abs(d[0]! - bg[0]!) < 10 && Math.abs(d[1]! - bg[1]!) < 10 && Math.abs(d[2]! - bg[2]!) < 10;
    const py = (TOTAL - 1) * CELL + CELL / 2; // y=0 (최하단) 행 중앙
    for (let x = 0; x < COLS; x++) {
      if (!isBg(sample(x * CELL + CELL / 2, py))) return x;
    }
    return -1;
  });
}

test.describe("W4-b 배선 결함 재현", () => {
  test.skip(!hasTTRM, "fixture 리플레이 부재");

  // 결함 1: DAS/ARR/SDF — input.tick(t)이 rAF 루프에 배선되지 않아 키를 눌러도 1칸 이동 후 정지.
  test("결함1 DAS/ARR: 방향키 홀드 시 미노가 벽까지 연속 이동", async ({ page }) => {
    await enterSim(page);
    const before = await pieceLeftCol(simCanvas(page));
    expect(before).toBeGreaterThanOrEqual(0); // 빈 보드에 falling 미노 존재

    // 핵심: 키를 누른 채로(release 전에) 위치를 관측한다. release는 코어 내부 advanceTo가
    // 밀린 ARR을 한꺼번에 정산하므로(증상 "떼는 순간 최종 위치 적용") 릴리스 후 관측은 버그를 가린다.
    await page.keyboard.down("ArrowLeft"); // keydown 1회 → 이후 DAS/ARR 반복은 rAF tick이 구동해야 한다
    await page.waitForTimeout(500);
    const held = await pieceLeftCol(simCanvas(page)); // 홀드 중 관측
    await page.keyboard.up("ArrowLeft");

    // tick 미배선이면 홀드 중 초기 1칸만 이동(delta=1). 배선되면 홀드 중 벽(col 0)까지 이동.
    expect(before - held).toBeGreaterThanOrEqual(2);
    expect(held).toBe(0);
  });

  // 결함 2: 시뮬레이터 홀드·넥스트 미표시 — WorkView.hold/next의 UI 바인딩 누락.
  test("결함2 홀드·넥스트 표시", async ({ page }) => {
    await enterSim(page);
    await expect(page.getByTestId("sim-next")).toBeVisible();
    await expect(page.getByTestId("sim-hold")).toBeVisible();
    // 넥스트는 최소 1개 이상의 미노 타입을 표시한다.
    await expect(page.getByTestId("sim-next")).toContainText(/[IJLOSTZ]/);
  });

  // 결함 3: 시뮬레이터 종료 시 리플레이 첫 프레임으로 복귀 — 명세 §3-D는 "분기 프레임 복귀".
  test("결함3 종료 시 분기 프레임 복귀", async ({ page }) => {
    await enterSim(page, 30);
    await page.getByTestId("sim-exit").click();
    await expect(page.getByTestId("sim-panel")).toBeHidden();
    // 분기 프레임(30)으로 복귀해야 한다(첫 프레임 0 아님).
    await expect(page.getByTestId("frame-label")).toContainText("30 /");
  });

  // 결함 4: 리플레이 업로드 버튼이 실 라우트에 미노출 — §3-B 플로우 전체.
  test("결함4 업로드 버튼·플로우가 실 페이지에 존재", async ({ page }) => {
    await page.route("**/g", (route) => {
      if (route.request().method() !== "POST") return route.continue();
      return route.fulfill({
        json: {
          gistId: "g1",
          index: {
            gistId: "g1",
            files: [
              { name: "meta.json", size: 1, rawUrl: "https://worker.test/raw/meta", truncated: false },
              { name: "replay.ttrm.gz.b64", size: 1, rawUrl: "https://worker.test/raw/replay", truncated: false },
            ],
            fetchedAt: "2026-07-12T00:00:00.000Z",
          },
        },
        headers: { "content-type": "application/json" },
      });
    });

    await loadLocal(page);
    await page.getByTestId("replay-upload").click();
    await expect(page.getByTestId("upload-panel")).toBeVisible();
    // 용량 표시가 존재한다(라운드 발췌 UI — §3-B).
    await expect(page.getByTestId("upload-size")).toBeVisible();
    await page.getByTestId("upload-submit").click();
    // 성공 → 경로형 URL 전환(M1d-1) + 공유 링크 복사 버튼.
    await expect(page).toHaveURL(/\/replays\/g1$/, { timeout: 15_000 });
    await expect(page.getByTestId("copy-share")).toBeVisible();
  });

  // 결함 6: 그리기 셀이 커서와 다른 위치 — canvas CSS 크기 vs 내부 해상도(dpr) 불일치.
  test.describe("결함6 고DPI 그리기 좌표 왕복", () => {
    test.use({ deviceScaleFactor: 2 });
    test("커서 위치에 셀이 찍힌다(dpr=2)", async ({ page }) => {
      await enterSim(page);
      const cssX = 5 * 26 + 13; // 논리 열 5 중앙
      const cssY = (22 - 1 - 8) * 26 + 13; // 논리 행 8 중앙
      await simCanvas(page).click({ position: { x: cssX, y: cssY } });
      await page.waitForTimeout(100);
      const filled = await simCanvas(page).evaluate(
        (el, { x, y }) => {
          const canvas = el as HTMLCanvasElement;
          const ctx = canvas.getContext("2d")!;
          const rect = canvas.getBoundingClientRect();
          const sx = canvas.width / rect.width;
          const sy = canvas.height / rect.height;
          const at = (cx: number, cy: number): Uint8ClampedArray =>
            ctx.getImageData(Math.floor(cx * sx), Math.floor(cy * sy), 1, 1).data;
          const bg = at(13, 13);
          const d = at(x, y);
          return Math.abs(d[0]! - bg[0]!) > 12 || Math.abs(d[1]! - bg[1]!) > 12 || Math.abs(d[2]! - bg[2]!) > 12;
        },
        { x: cssX, y: cssY },
      );
      // 좌표 계약이 맞으면 커서 아래 픽셀이 셀 색으로 채워진다.
      expect(filled).toBe(true);
    });
  });

  // 결함 7: undo/redo 클릭 후 포커스 잔류 — Space 등 게임 키가 버튼을 재클릭. 클릭 후 blur.
  test("결함7 undo/redo 클릭 후 포커스 잔류 없음", async ({ page }) => {
    await enterSim(page);
    // 셀 2개를 그린다 → undo 1회 후에도 canUndo 유지(버튼이 disabled로 포커스를 잃지 않도록).
    await simCanvas(page).click({ position: { x: 3 * 26 + 13, y: (22 - 1 - 8) * 26 + 13 } });
    await simCanvas(page).click({ position: { x: 6 * 26 + 13, y: (22 - 1 - 8) * 26 + 13 } });
    await page.getByTestId("sim-undo").click();
    // 클릭 후 blur가 없으면 포커스가 버튼에 잔류 → Space(하드드롭)가 버튼을 재클릭한다.
    const active = await page.evaluate(() => document.activeElement?.getAttribute("data-testid") ?? null);
    expect(active).not.toBe("sim-undo");
  });
});

// 결함 5: 대용량(~6MB) .ttrm 드롭 실패 — sessionStorage 핸드오프 용량 초과. 드롭 핸들러 점검.
test.describe("결함5 대용량 드롭 핸드오프", () => {
  async function dropFile(page: Page, name: string, content: string): Promise<void> {
    const dt = await page.evaluateHandle(
      ({ n, c }) => {
        const transfer = new DataTransfer();
        transfer.items.add(new File([c], n, { type: "application/json" }));
        return transfer;
      },
      { n: name, c: content },
    );
    await page.getByTestId("dropzone").dispatchEvent("dragover", { dataTransfer: dt });
    await page.getByTestId("dropzone").dispatchEvent("drop", { dataTransfer: dt });
  }

  test("~6MB 드롭이 핸드오프를 통과한다(용량 초과로 무음 실패하지 않음)", async ({ page }) => {
    await page.goto("/");
    // 6MB 더미(유효 리플레이 아님) — 핸드오프가 살아 있으면 파싱 단계까지 도달해 오류 문구.
    await dropFile(page, "big.ttrm", "x".repeat(6_200_000));
    await expect(page).toHaveURL(/\/replay/, { timeout: 15_000 });
    await expect(page.getByTestId("replay-error")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("replay-empty")).toBeHidden();
  });

  test("정상 fixture 드롭 → 재생 로드(해피패스 회귀)", async ({ page }) => {
    test.skip(!hasTTRM, "fixture 부재");
    await page.goto("/");
    await dropFile(page, "replay_sample.ttrm", readFileSync(TTRM, "utf8"));
    await expect(page).toHaveURL(/\/replay/, { timeout: 15_000 });
    await expect(page.getByTestId("replay-loaded")).toBeVisible({ timeout: 15_000 });
  });
});
