import { test, expect, type Page, type Locator } from "@playwright/test";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

// M5 W5-2b 셀 팔레트·포인터 도구 (m5-d-web §2~5 — AW-30~33). 계산부(lib/palette.ts)의 순수 매핑은
// palette.test.ts가 검증한다 — 여기는 실브라우저 배선(캔버스 픽셀·DOM 오버레이·네이티브 이벤트 차단)만.
const FIXTURE_DIR = fileURLToPath(new URL("../../../fixtures", import.meta.url));
const TTRM = join(FIXTURE_DIR, "replay_sample.ttrm");
const hasTTRM = existsSync(TTRM);

const CELL = 26; // SimulatorPanel의 CELL_SIZE와 동일
const TOTAL = 22; // visibleHeight(20) + bufferPeek(2), w4-smoke.spec.ts와 동일 전제

/** 논리 셀 (x, y) — y=0 최하단 — 의 캔버스 CSS px 중앙. */
function cellCenter(x: number, y: number): { x: number; y: number } {
  return { x: x * CELL + CELL / 2, y: (TOTAL - 1 - y) * CELL + CELL / 2 };
}

function simCanvas(page: Page): Locator {
  return page.getByTestId("sim-panel").getByTestId("board-canvas");
}

async function loadLocal(page: Page): Promise<void> {
  await page.goto("/replay");
  await expect(page.getByTestId("replay-empty")).toBeVisible();
  await page.getByTestId("replay-file-input").setInputFiles(TTRM);
  await expect(page.getByTestId("replay-loaded")).toBeVisible({ timeout: 15_000 });
}

async function enterSim(page: Page): Promise<void> {
  await loadLocal(page);
  await page.getByTestId("branch-button").click();
  await expect(page.getByTestId("sim-panel")).toBeVisible({ timeout: 15_000 });
  await expect(simCanvas(page)).toBeVisible();
}

/** 캔버스 CSS px 위치 → 페이지 절대 좌표 (page.mouse 드래그용). */
async function pagePoint(
  canvas: Locator,
  cssX: number,
  cssY: number,
): Promise<{ x: number; y: number }> {
  const box = await canvas.boundingBox();
  if (!box) throw new Error("캔버스 bounding box 없음");
  return { x: box.x + cssX, y: box.y + cssY };
}

/** 캔버스에서 (x, y) 위치의 픽셀이 배경색인지(빈 칸) 판정 — 결함6 패턴 재사용. */
async function isBackground(canvas: Locator, cssX: number, cssY: number): Promise<boolean> {
  return canvas.evaluate(
    (el, { x, y }) => {
      const c = el as HTMLCanvasElement;
      const ctx = c.getContext("2d")!;
      const rect = c.getBoundingClientRect();
      const sx = c.width / rect.width;
      const sy = c.height / rect.height;
      const at = (cx: number, cy: number): Uint8ClampedArray =>
        ctx.getImageData(Math.floor(cx * sx), Math.floor(cy * sy), 1, 1).data;
      const bg = at(13, 13); // 좌상단 셀 중앙 = 빈 배경 기준(보드 비어 있음 전제)
      const d = at(x, y);
      return (
        Math.abs(d[0]! - bg[0]!) < 12 &&
        Math.abs(d[1]! - bg[1]!) < 12 &&
        Math.abs(d[2]! - bg[2]!) < 12
      );
    },
    { x: cssX, y: cssY },
  );
}

test.describe("W5-2b 셀 팔레트·포인터 도구", () => {
  test.skip(!hasTTRM, "fixture 리플레이 부재");

  test("AW-30 팔레트 선택 후 그리기 — v:G 하드코딩 아님", async ({ page }) => {
    await enterSim(page);
    const sim = page.getByTestId("sim-panel");
    // 팔레트 9종이 노출되고, 기본 선택은 G.
    const palette = sim.getByTestId("cell-palette");
    await expect(palette).toBeVisible();
    for (const c of ["G", "D", "I", "J", "L", "O", "S", "T", "Z"]) {
      await expect(sim.getByTestId(`palette-${c}`)).toHaveAttribute("data-cell", c);
    }
    await expect(sim.getByTestId("palette-G")).toHaveAttribute("aria-pressed", "true");

    // I를 선택하면 aria-pressed가 옮겨간다.
    await sim.getByTestId("palette-I").click();
    await expect(sim.getByTestId("palette-I")).toHaveAttribute("aria-pressed", "true");
    await expect(sim.getByTestId("palette-G")).toHaveAttribute("aria-pressed", "false");

    // 보드에 그리면 I색(cyan #31c7ef)이 찍힌다 — G(#6d6d6d) 하드코딩이면 이 색이 나올 수 없다.
    const canvas = simCanvas(page);
    const { x, y } = cellCenter(4, 8);
    await canvas.click({ position: { x, y } });
    const filled = await canvas.evaluate(
      (el, { x, y }) => {
        const c = el as HTMLCanvasElement;
        const ctx = c.getContext("2d")!;
        const rect = c.getBoundingClientRect();
        const sx = c.width / rect.width;
        const sy = c.height / rect.height;
        const d = ctx.getImageData(Math.floor(x * sx), Math.floor(y * sy), 1, 1).data;
        return { r: d[0], g: d[1], b: d[2] };
      },
      { x, y },
    );
    expect(Math.abs(filled.r - 0x31)).toBeLessThan(20);
    expect(Math.abs(filled.g - 0xc7)).toBeLessThan(20);
    expect(Math.abs(filled.b - 0xef)).toBeLessThan(20);
  });

  test("AW-31 호버 시 고스트 표시, 이탈 시 숨김", async ({ page }) => {
    await enterSim(page);
    const canvas = simCanvas(page);
    const ghost = page.getByTestId("cell-ghost");
    await expect(ghost).toBeHidden();

    const hoverCell = cellCenter(3, 5);
    const pt = await pagePoint(canvas, hoverCell.x, hoverCell.y);
    await page.mouse.move(pt.x, pt.y);
    await expect(ghost).toBeVisible();
    // CSS px 스냅 — 셀 (3,5)의 좌상단으로 정확히 정렬된다.
    await expect(ghost).toHaveCSS("left", `${3 * CELL}px`);
    await expect(ghost).toHaveCSS("top", `${(TOTAL - 1 - 5) * CELL}px`);

    // erase 도구에서는 고스트를 표시하지 않는다.
    // M6-A 비모달 전환(#55) 이후 편집 영역이 문서 흐름에 놓여, 도구 버튼 클릭 시 브라우저가
    // 버튼을 뷰포트로 스크롤한다(모달일 때는 fixed 오버레이라 스크롤이 없어 pt 재사용이 유효했다).
    // 스크롤로 보드가 이동하므로 매 클릭 후 호버 좌표를 다시 계산한다 — 관측(고스트 표시/은닉)은
    // 불변이다. 사유: apps/web/QUESTIONS.md "M6-A AW-31 좌표 재계산".
    await page.getByTestId("tool-erase").click();
    const eraseHover = await pagePoint(canvas, hoverCell.x + 1, hoverCell.y + 1);
    await page.mouse.move(eraseHover.x, eraseHover.y);
    await expect(ghost).toBeHidden();
    await page.getByTestId("tool-cell").click();

    // 캔버스 이탈 시 숨김.
    const reHover = await pagePoint(canvas, hoverCell.x, hoverCell.y);
    await page.mouse.move(reHover.x, reHover.y);
    await expect(ghost).toBeVisible();
    const box = await canvas.boundingBox();
    if (!box) throw new Error("bounding box 없음");
    await page.mouse.move(box.x - 20, box.y - 20);
    await expect(ghost).toBeHidden();
  });

  test("AW-32 우클릭 드래그로 지우기 + 캔버스 컨텍스트메뉴 미출현", async ({ page }) => {
    await enterSim(page);
    const canvas = simCanvas(page);
    const { x: cx, y: cy } = cellCenter(2, 6);

    // 먼저 좌클릭으로 셀을 채운다(기본 G).
    await canvas.click({ position: { x: cx, y: cy } });
    expect(await isBackground(canvas, cx, cy)).toBe(false);

    // 우클릭 다운~업 = 지우기 스트로크(현재 도구 cell → erase).
    const pt = await pagePoint(canvas, cx, cy);
    await page.mouse.move(pt.x, pt.y);
    await page.mouse.down({ button: "right" });
    await page.mouse.up({ button: "right" });
    await page.waitForTimeout(50);
    expect(await isBackground(canvas, cx, cy)).toBe(true);

    // 캔버스 한정 contextmenu 기본 동작 차단 — 합성 이벤트의 defaultPrevented로 관측.
    const prevented = await canvas.evaluate(
      (el) =>
        new Promise<boolean>((resolve) => {
          el.addEventListener("contextmenu", (e) => resolve(e.defaultPrevented), { once: true });
          el.dispatchEvent(
            new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 }),
          );
        }),
    );
    expect(prevented).toBe(true);
  });

  test("AW-33 휠클릭 스포이드 — 팔레트 선택 변경 + cell 도구 전환, 빈 칸은 무시", async ({
    page,
  }) => {
    await enterSim(page);
    const sim = page.getByTestId("sim-panel");
    const canvas = simCanvas(page);

    // T를 선택해 셀을 그린다.
    await sim.getByTestId("palette-T").click();
    const filledCell = cellCenter(6, 4);
    await canvas.click({ position: filledCell });

    // 도구를 erase로 바꾸고, G로 팔레트를 되돌린 뒤 방금 그린 T 셀을 휠클릭으로 스포이드한다.
    await page.getByTestId("tool-erase").click();
    await expect(page.getByTestId("tool-erase")).toHaveClass(/primary/);

    const ptFilled = await pagePoint(canvas, filledCell.x, filledCell.y);
    await page.mouse.move(ptFilled.x, ptFilled.y);
    await page.mouse.down({ button: "middle" });
    await page.mouse.up({ button: "middle" });

    // 도구가 cell로 전환되고 팔레트 선택이 T가 된다.
    await expect(page.getByTestId("tool-cell")).toHaveClass(/primary/);
    await expect(sim.getByTestId("palette-T")).toHaveAttribute("aria-pressed", "true");

    // 빈 칸을 휠클릭하면 무시 — 선택·도구 유지.
    await page.getByTestId("tool-erase").click();
    const emptyCell = cellCenter(9, 1); // 우하단 구석 — falling 미노 스폰 범위 밖(안전한 빈 칸)
    const ptEmpty = await pagePoint(canvas, emptyCell.x, emptyCell.y);
    await page.mouse.move(ptEmpty.x, ptEmpty.y);
    await page.mouse.down({ button: "middle" });
    await page.mouse.up({ button: "middle" });
    await expect(page.getByTestId("tool-erase")).toHaveClass(/primary/);
    await expect(page.getByTestId("tool-cell")).not.toHaveClass(/primary/);
  });
});
