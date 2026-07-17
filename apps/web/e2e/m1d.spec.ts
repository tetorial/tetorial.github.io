import { test, expect, type Page, type Locator } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { parseReplay } from "@tetorial/replay-tetrio";
import { buildUploadPayload } from "../src/lib/upload.ts";
import { encodeReplayId } from "../src/lib/deeplink.ts";

// M1d 경로형 딥링크·키 기본값 스모크 (apps-web-m1d §2·§5·§6).
// 서빙은 wrangler pages dev — /replays/*는 _redirects 200 리라이트로 /replay/가 서빙되며
// 브라우저 URL은 원형 유지된다(D-19). Worker·rawUrl은 라우트 mock.
const FIXTURE_DIR = fileURLToPath(new URL("../../../fixtures", import.meta.url));
const TTRM = join(FIXTURE_DIR, "replay_sample.ttrm");
const hasTTRM = existsSync(TTRM);

const HEX_ID = "0123456789abcdef0123456789abcdef"; // 32자 hex gist id (현행 체계)
const CLIENT_ID = "k3XmP9qLwR2v";
const NOTE_ID = "AbCdEf12";

const EMPTY_PAGE_STATE = {
  board: { width: 10, rows: [] },
  current: null,
  hold: null,
  holdLocked: false,
  queueUsed: 0,
  counters: { b2b: -1, combo: -1 },
};

/** 스키마 유효한 notes-<clientId>.json (2페이지 노트 1개 — fragment 서수 검증용). */
const NOTES_FILE = {
  schema: "tetorial.notes/1",
  clientId: CLIENT_ID,
  editKeyHash: "a".repeat(64),
  createdAt: "2026-07-12T00:00:00.000Z",
  updatedAt: "2026-07-12T00:00:00.000Z",
  notes: [
    {
      id: NOTE_ID,
      origin: { type: "replay", round: 0, player: 0, frame: 0 },
      snapshot: {
        ruleset: { preset: "srs" },
        board: { width: 10, rows: [] },
        current: "T",
        hold: null,
        holdLocked: false,
        queue: "",
        counters: { b2b: -1, combo: -1 },
      },
      pages: [
        { id: "PgAaAa01", state: EMPTY_PAGE_STATE, comment: "첫 페이지" },
        { id: "PgAaAa02", state: EMPTY_PAGE_STATE, comment: "둘째 페이지" },
      ],
      createdAt: "2026-07-12T00:00:00.000Z",
      updatedAt: "2026-07-12T00:00:00.000Z",
    },
  ],
};

/** fixture 기반 gist mock 배선 — index·meta·replay(+notes) 라우트. */
async function mockGist(page: Page, gistId: string, withNotes: boolean): Promise<void> {
  const parsed = parseReplay(readFileSync(TTRM, "utf8"));
  if (!parsed.ok) throw new Error("fixture 파싱 실패");
  const payload = await buildUploadPayload({
    doc: parsed.value,
    selectedRounds: parsed.value.rounds.map((_, i) => i),
  });

  const files = [
    { name: "meta.json", size: 1, rawUrl: "https://worker.test/raw/meta", truncated: false },
    { name: "replay.ttrm.gz.b64", size: 1, rawUrl: "https://worker.test/raw/replay", truncated: false },
    ...(withNotes
      ? [
          {
            name: `notes-${CLIENT_ID}.json`,
            size: 1,
            rawUrl: "https://worker.test/raw/notes",
            truncated: false,
          },
        ]
      : []),
  ];
  const index = { gistId, files, fetchedAt: "2026-07-12T00:00:00.000Z" };

  await page.route(`**/g/${gistId}`, (route) =>
    route.fulfill({ json: index, headers: { "content-type": "application/json" } }),
  );
  await page.route("https://worker.test/raw/meta", (route) =>
    route.fulfill({ body: JSON.stringify(payload.meta) }),
  );
  await page.route("https://worker.test/raw/replay", (route) =>
    route.fulfill({ body: payload.replayBody }),
  );
  if (withNotes) {
    await page.route("https://worker.test/raw/notes", (route) =>
      route.fulfill({ body: JSON.stringify(NOTES_FILE) }),
    );
  }
}

test.describe("M1d-1 경로형 딥링크 (인코딩 id)", () => {
  test.skip(!hasTTRM, "fixture 리플레이 부재");

  test("M1d-1 /replays/<인코딩id> 접속 → 재생 페이지 로드 + URL 원형 유지", async ({ page }) => {
    const seg = encodeReplayId(HEX_ID);
    expect(seg).toMatch(/^[A-Za-z0-9_-]{22}$/); // 발신 인코딩 규범(§2)
    await mockGist(page, HEX_ID, false); // 수신: 22자 세그먼트 → 32-hex 복원 후 Worker 조회
    await page.goto(`/replays/${seg}`);
    await expect(page.getByTestId("replay-loaded")).toBeVisible({ timeout: 15_000 });
    // _redirects 200 리라이트 — 브라우저 URL은 경로형 원형 유지(리다이렉트 강등 없음).
    await expect(page).toHaveURL(new RegExp(`/replays/${seg}$`));
  });
});

test.describe("M1d-2·M1d-3 note 한정형 + fragment 서수", () => {
  test.skip(!hasTTRM, "fixture 리플레이 부재");

  test("M1d-3 ?note=<clientId>.<noteId>#p2 → 뷰어가 2번째 페이지를 연다", async ({ page }) => {
    const seg = encodeReplayId(HEX_ID);
    await mockGist(page, HEX_ID, true);
    await page.goto(`/replays/${seg}?note=${CLIENT_ID}.${NOTE_ID}#p2`);
    await expect(page.getByTestId("viewer-modal")).toBeVisible({ timeout: 15_000 });
    const pages = page.getByTestId("vm-page");
    await expect(pages).toHaveCount(2);
    await expect(pages.nth(1)).toHaveAttribute("aria-current", "true");
  });

  test("M1d-3 범위 밖 fragment(#p9)는 에러가 아니라 첫 페이지", async ({ page }) => {
    const seg = encodeReplayId(HEX_ID);
    await mockGist(page, HEX_ID, true);
    await page.goto(`/replays/${seg}?note=${CLIENT_ID}.${NOTE_ID}#p9`);
    await expect(page.getByTestId("viewer-modal")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("vm-page").nth(0)).toHaveAttribute("aria-current", "true");
  });
});

/* ── M1d-7 키 기본값 (홀드 ShiftLeft · 시계 회전 ArrowUp) ─────────────── */

function simCanvas(page: Page): Locator {
  return page.getByTestId("sim-panel").getByTestId("board-canvas");
}

async function enterSim(page: Page): Promise<void> {
  await page.goto("/replay");
  await expect(page.getByTestId("replay-empty")).toBeVisible();
  await page.getByTestId("replay-file-input").setInputFiles(TTRM);
  await expect(page.getByTestId("replay-loaded")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("branch-button").click();
  await expect(page.getByTestId("sim-panel")).toBeVisible({ timeout: 15_000 });
  await expect(simCanvas(page)).toBeVisible();
}

/** 최하단 행(ghost footprint)의 채워진 논리 열 목록 — 회전 시 형태 변화 관측용(빈 보드 전제). */
async function bottomFootprint(canvas: Locator): Promise<number[]> {
  return canvas.evaluate((el) => {
    const canvas = el as HTMLCanvasElement;
    const ctx = canvas.getContext("2d")!;
    const CELL = 26;
    const COLS = 10;
    const TOTAL = 22; // visibleHeight(20) + bufferPeek(2)
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    const sample = (cssX: number, cssY: number): Uint8ClampedArray =>
      ctx.getImageData(Math.floor(cssX * sx), Math.floor(cssY * sy), 1, 1).data;
    const bg = sample(CELL / 2, CELL / 2);
    const isBg = (d: Uint8ClampedArray): boolean =>
      Math.abs(d[0]! - bg[0]!) < 10 && Math.abs(d[1]! - bg[1]!) < 10 && Math.abs(d[2]! - bg[2]!) < 10;
    const py = (TOTAL - 1) * CELL + CELL / 2;
    const cols: number[] = [];
    for (let x = 0; x < COLS; x++) {
      if (!isBg(sample(x * CELL + CELL / 2, py))) cols.push(x);
    }
    return cols;
  });
}

test.describe("M1d-7 키 기본값", () => {
  test.skip(!hasTTRM, "fixture 리플레이 부재");

  test("M1d-7 홀드 기본키 ShiftLeft가 동작한다", async ({ page }) => {
    await enterSim(page);
    await page.keyboard.press("ShiftLeft");
    await page.waitForTimeout(100);
    // 홀드 성공 = hold 표시 + 잠김 (PieceBar — 홀드 액션이 발화됐다는 유일한 텍스트 신호).
    await expect(page.getByTestId("sim-hold")).toContainText("(잠김)");
  });

  test("M1d-7 시계 회전 기본키 ArrowUp이 동작한다", async ({ page }) => {
    await enterSim(page);
    let before = await bottomFootprint(simCanvas(page));
    expect(before.length).toBeGreaterThan(0);
    await page.keyboard.press("ArrowUp");
    await page.waitForTimeout(100);
    let after = await bottomFootprint(simCanvas(page));
    if (after.join() === before.join()) {
      // O 미노는 회전해도 발자국이 불변 — 홀드로 다음 미노와 교체 후 재시도(7-bag에서
      // O가 연속 2회를 넘을 수 없어 1회 교체로 충분).
      await page.keyboard.press("ShiftLeft");
      await page.waitForTimeout(100);
      before = await bottomFootprint(simCanvas(page));
      await page.keyboard.press("ArrowUp");
      await page.waitForTimeout(100);
      after = await bottomFootprint(simCanvas(page));
    }
    expect(after.join()).not.toBe(before.join());
  });
});
