import { test, expect, type Page } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { parseReplay } from "@tetorial/replay-tetrio";
import { buildUploadPayload } from "../src/lib/upload.ts";
import { encodeReplayId } from "../src/lib/deeplink.ts";

// M5-A 공통 게임 HUD (m5-a §3·§4 — AW-27). 레이아웃 규범의 관측 가능한 면(testid·data 속성·
// 텍스트 레이블 부재)을 세 화면에서 확인한다. 시각 규범(좌/우/정렬/정사각)은 게이트 11 실조작 몫.
// 매핑 로직 자체는 lib 유닛(game-hud.test.ts — AW-26·28·29)이 검증한다.
const FIXTURE_DIR = fileURLToPath(new URL("../../../fixtures", import.meta.url));
const TTRM = join(FIXTURE_DIR, "replay_sample.ttrm");
const hasTTRM = existsSync(TTRM);

const HEX_ID = "0123456789abcdef0123456789abcdef";
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
        queue: "IJLOSTZ",
        counters: { b2b: -1, combo: -1 },
      },
      pages: [{ id: "PgAaAa01", state: EMPTY_PAGE_STATE, comment: "페이지" }],
      createdAt: "2026-07-12T00:00:00.000Z",
      updatedAt: "2026-07-12T00:00:00.000Z",
    },
  ],
};

/** Worker·rawUrl mock — 노트 파일 포함 gist 로드(m3b 패턴 재사용). */
async function mockGist(page: Page): Promise<void> {
  const parsed = parseReplay(readFileSync(TTRM, "utf8"));
  if (!parsed.ok) throw new Error("fixture 파싱 실패");
  const payload = await buildUploadPayload({
    doc: parsed.value,
    selectedRounds: parsed.value.rounds.map((_, i) => i),
  });
  const files = [
    { name: "meta.json", size: 1, rawUrl: "https://worker.test/raw/meta", truncated: false },
    {
      name: "replay.ttrm.gz.b64",
      size: 1,
      rawUrl: "https://worker.test/raw/replay",
      truncated: false,
    },
    {
      name: `notes-${CLIENT_ID}.json`,
      size: 1,
      rawUrl: "https://worker.test/raw/notes",
      truncated: false,
    },
  ];
  await page.route(`**/g/${HEX_ID}`, (route) =>
    route.fulfill({
      json: { gistId: HEX_ID, files, fetchedAt: "2026-07-12T00:00:00.000Z" },
      headers: { "content-type": "application/json" },
    }),
  );
  await page.route("https://worker.test/raw/meta", (route) =>
    route.fulfill({ body: JSON.stringify(payload.meta) }),
  );
  await page.route("https://worker.test/raw/replay", (route) =>
    route.fulfill({ body: payload.replayBody }),
  );
  await page.route("https://worker.test/raw/notes", (route) =>
    route.fulfill({ body: JSON.stringify(NOTES_FILE) }),
  );
}

/** 로컬 fixture 로드(네트워크 불요 경로). */
async function loadLocal(page: Page): Promise<void> {
  await page.goto("/replay");
  await expect(page.getByTestId("replay-empty")).toBeVisible();
  await page.getByTestId("replay-file-input").setInputFiles(TTRM);
  await expect(page.getByTestId("replay-loaded")).toBeVisible({ timeout: 15_000 });
}

test.describe("AW-27 공통 HUD 관측면 — testid·data 속성·레이블 부재", () => {
  test.skip(!hasTTRM, "fixture 리플레이 부재");

  test("AW-27 재생 화면: HUD 3요소가 있고 텍스트 레이블·자리표시자가 없다", async ({ page }) => {
    await loadLocal(page);
    // 1vs1 ttrm은 두 보드+HUD를 렌더한다(M6-B AW-37) — 첫 보드로 스코프해 HUD 관측면을 본다.
    const board = page.getByTestId("board-slot").first();
    const hold = board.getByTestId("hud-hold");
    const next = board.getByTestId("hud-next");
    const counters = board.getByTestId("hud-counters");

    await expect(hold).toBeVisible();
    await expect(next).toBeVisible();
    await expect(counters).toBeAttached();

    // 재생 시작 시점: 홀드 비어 있음 — 빈 정사각 박스(— 자리표시자·텍스트 없음).
    await expect(hold).toHaveAttribute("data-piece", "");
    await expect(hold).toHaveAttribute("data-locked", "false");
    await expect(hold).toHaveText("");

    // Next는 표시 상한 5 안에서 미노 타입 나열, next[0]이 맨 위(DOM 첫 프리뷰).
    await expect(next).toHaveAttribute("data-next", /^[IJLOSTZ]{1,5}$/);
    const previews = next.getByTestId("piece-preview");
    const dataNext = (await next.getAttribute("data-next"))!;
    await expect(previews).toHaveCount(dataNext.length);
    await expect(previews.first()).toHaveAttribute("data-piece", dataNext[0]!);

    // "홀드"/"다음" 텍스트 레이블 없음 — 위치로 식별(aria-label은 텍스트가 아니다).
    await expect(board.locator(".game-hud")).not.toContainText("홀드");
    await expect(board.locator(".game-hud")).not.toContainText("다음");
  });

  test("AW-27 시뮬레이터: 같은 HUD, 카운터 비표시면 data 속성 없음", async ({ page }) => {
    await loadLocal(page);
    await page.getByTestId("branch-button").click();
    const sim = page.getByTestId("sim-panel");
    await expect(sim).toBeVisible({ timeout: 15_000 });

    await expect(sim.getByTestId("hud-hold")).toBeVisible();
    await expect(sim.getByTestId("hud-next")).toHaveAttribute("data-next", /^[IJLOSTZ]{1,5}$/);
    // 진입 직후 b2b·combo는 원값 -1(없음) — 표시도, data 속성도 없다(§4 관측 규약).
    const counters = sim.getByTestId("hud-counters");
    await expect(counters).toBeAttached();
    await expect(counters).not.toHaveAttribute("data-b2b");
    await expect(counters).not.toHaveAttribute("data-combo");
    await expect(counters).toHaveText("");
  });

  test("AW-27 노트 뷰어: vm-pieces 대신 같은 HUD로 렌더한다", async ({ page }) => {
    await mockGist(page);
    await page.goto(`/replays/${encodeReplayId(HEX_ID)}`);
    await expect(page.getByTestId("replay-loaded")).toBeVisible({ timeout: 15_000 });

    await page.getByTestId("note-item").first().click();
    const viewer = page.getByTestId("viewer-modal");
    await expect(viewer).toBeVisible();

    await expect(viewer.getByTestId("hud-hold")).toBeVisible();
    await expect(viewer.getByTestId("hud-hold")).toHaveText(""); // 빈 홀드 = 빈 박스
    await expect(viewer.getByTestId("hud-next")).toHaveAttribute("data-next", /^[IJLOSTZ]{1,5}$/);
    await expect(viewer.locator(".vm-pieces")).toHaveCount(0); // 구 표기 제거 확인
  });
});
