import { test, expect, type Page } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { parseReplay } from "@tetorial/replay-tetrio";
import { buildUploadPayload } from "../src/lib/upload.ts";
import { encodeReplayId } from "../src/lib/deeplink.ts";

// M6-C 노트 페이지 fork 진입 (m6c-page-fork.md — AW-41). 노트 페이지의 "이 페이지에서
// 시뮬레이션"으로 새 노트 저작 세션을 여는 것을 실브라우저로 고정한다: 타인 노트에서의 진입(fork의
// 본질), 내 노트에서 "이어서 편집"과의 공존, queue-exhausted 페이지의 인라인 안내(모달·alert 없음).
// 진입 매핑·한도·오류 분기의 순수 로직은 lib/fork.test.ts(유닛)가 담당한다. Worker·rawUrl은 라우트 mock.
const FIXTURE_DIR = fileURLToPath(new URL("../../../fixtures", import.meta.url));
const TTRM = join(FIXTURE_DIR, "replay_sample.ttrm");
const hasTTRM = existsSync(TTRM);

const HEX_ID = "0123456789abcdef0123456789abcdef";
const CLIENT_ID = "k3XmP9qLwR2v";
const NOTE_ID = "AbCdEf12";

/** 유효 페이지(current 존재) — fork 진입 가능. */
const FORKABLE_PAGE = {
  id: "PgFork01",
  state: {
    board: { width: 10, rows: ["GGGGGGGGG_"] },
    current: "T",
    hold: null,
    holdLocked: false,
    queueUsed: 0,
    counters: { b2b: -1, combo: -1 },
  },
  comment: "포크 가능 페이지",
};

/** 큐 소진 페이지(current null) — fork 진입 불가(queue-exhausted). */
const EXHAUSTED_PAGE = {
  id: "PgFork02",
  state: {
    board: { width: 10, rows: [] },
    current: null,
    hold: null,
    holdLocked: false,
    queueUsed: 7,
    counters: { b2b: -1, combo: -1 },
  },
  comment: "큐 소진 페이지",
};

const NOTES_FILE = {
  schema: "tetorial.notes/1",
  clientId: CLIENT_ID,
  editKeyHash: "a".repeat(64),
  createdAt: "2026-07-19T00:00:00.000Z",
  updatedAt: "2026-07-19T00:00:00.000Z",
  notes: [
    {
      id: NOTE_ID,
      origin: { type: "replay", round: 0, player: 0, frame: 120 },
      snapshot: {
        ruleset: { preset: "srs" },
        board: { width: 10, rows: [] },
        current: "L",
        hold: null,
        holdLocked: false,
        queue: "IJLOSTZ",
        counters: { b2b: -1, combo: -1 },
      },
      pages: [FORKABLE_PAGE, EXHAUSTED_PAGE],
      createdAt: "2026-07-19T00:00:00.000Z",
      updatedAt: "2026-07-19T00:00:00.000Z",
    },
  ],
};

async function mockGist(page: Page): Promise<void> {
  const parsed = parseReplay(readFileSync(TTRM, "utf8"));
  if (!parsed.ok) throw new Error("fixture 파싱 실패");
  const payload = await buildUploadPayload({
    doc: parsed.value,
    selectedRounds: parsed.value.rounds.map((_, i) => i),
  });

  const files = [
    { name: "meta.json", size: 1, rawUrl: "https://worker.test/raw/meta", truncated: false },
    { name: "replay.ttrm.gz.b64", size: 1, rawUrl: "https://worker.test/raw/replay", truncated: false },
    { name: `notes-${CLIENT_ID}.json`, size: 1, rawUrl: "https://worker.test/raw/notes", truncated: false },
  ];

  await page.route(`**/g/${HEX_ID}`, (route) =>
    route.fulfill({
      json: { gistId: HEX_ID, files, fetchedAt: "2026-07-19T00:00:00.000Z" },
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

/** 브라우저 clientId를 mock 노트 파일과 같게 고정 → isMine 성립(내 노트 시나리오). */
async function pinClientId(page: Page): Promise<void> {
  await page.addInitScript((id) => {
    window.localStorage.setItem("tetorial:clientId", id);
  }, CLIENT_ID);
}

/** 리플레이 로드 → 사이드바 첫 노트 열람. */
async function openNoteViewer(page: Page): Promise<void> {
  await mockGist(page);
  await page.goto(`/replays/${encodeReplayId(HEX_ID)}`);
  await expect(page.getByTestId("replay-loaded")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("note-item").first().click();
  await expect(page.getByTestId("viewer-modal")).toBeVisible();
}

test.describe("M6-C 노트 페이지 fork 진입 (AW-41)", () => {
  test.skip(!hasTTRM, "fixture 리플레이 부재");

  test("AW-41 타인 노트 페이지에서 fork로 새 시뮬레이션 세션(신규 노트)이 열린다", async ({
    page,
  }) => {
    // clientId를 고정하지 않으므로 mock 파일(CLIENT_ID)은 남의 노트다 — 이어서 편집은 없다.
    await openNoteViewer(page);
    await expect(page.getByTestId("vm-edit")).toHaveCount(0); // 타인 노트: 열람 전용
    await expect(page.getByTestId("vm-fork")).toBeVisible(); // 그래도 fork는 가능(D-8)

    await page.getByTestId("vm-fork").click();

    // 뷰어가 닫히고 시뮬레이터로 인플레이스 전환 — "이어서 편집"이 아니라 새 노트(시뮬레이터)다.
    await expect(page.getByTestId("viewer-modal")).toBeHidden();
    const sim = page.getByTestId("sim-panel");
    await expect(sim).toBeVisible({ timeout: 15_000 });
    await expect(sim.getByRole("heading")).toHaveText("시뮬레이터");
    await expect(sim).not.toContainText("노트 이어서 편집");
    // 신규 노트라 페이지 0개 — 완성 버튼은 아직 비활성(사용자가 페이지를 추가해야 한다).
    await expect(page.getByTestId("sim-finish")).toBeDisabled();
  });

  test("AW-41 내 노트에서 '이어서 편집'과 fork가 공존한다", async ({ page }) => {
    await pinClientId(page);
    await openNoteViewer(page);
    // 두 진입이 함께 노출된다(같은 id 편집 ↔ 새 노트 fork — 별개 동작).
    await expect(page.getByTestId("vm-edit")).toBeVisible();
    await expect(page.getByTestId("vm-fork")).toBeVisible();

    await page.getByTestId("vm-fork").click();
    const sim = page.getByTestId("sim-panel");
    await expect(sim).toBeVisible({ timeout: 15_000 });
    // fork는 새 노트 세션 — 재편집("노트 이어서 편집")이 아니다.
    await expect(sim.getByRole("heading")).toHaveText("시뮬레이터");
  });

  test("AW-41 queue-exhausted 페이지는 인라인 안내로 소화하고 뷰어를 유지한다(모달·alert 없음)", async ({
    page,
  }) => {
    // 네이티브 대화상자(alert/confirm)가 뜨면 실패시킨다(AW-22 — 인라인만 허용).
    page.on("dialog", (d) => {
      throw new Error(`예상치 못한 네이티브 대화상자: ${d.message()}`);
    });
    await openNoteViewer(page);
    // 큐 소진 페이지(2번째)로 이동.
    await page.getByTestId("vm-next").click();
    await expect(page.getByTestId("vm-page-label")).toContainText("페이지 2 / 2");

    await page.getByTestId("vm-fork").click();

    // 인라인 안내가 뜨고, 뷰어는 정상 유지되며 시뮬레이터로 전환되지 않는다.
    await expect(page.getByTestId("vm-fork-notice")).toBeVisible();
    await expect(page.getByTestId("vm-fork-notice")).toContainText("큐를 모두 소진");
    await expect(page.getByTestId("viewer-modal")).toBeVisible();
    await expect(page.getByTestId("sim-panel")).toHaveCount(0);

    // 유효 페이지(1번째)로 돌아가면 지난 안내는 해제된다(페이지별 상태).
    await page.getByTestId("vm-prev").click();
    await expect(page.getByTestId("vm-fork-notice")).toHaveCount(0);
  });
});
