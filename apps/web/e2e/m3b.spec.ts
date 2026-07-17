import { test, expect, type Page } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { parseReplay } from "@tetorial/replay-tetrio";
import { buildUploadPayload } from "../src/lib/upload.ts";
import { encodeReplayId } from "../src/lib/deeplink.ts";

// M3-B 노트 UX 스모크 (m3b §2·§4) — 수집→묶음 업로드→즉시 반영, 재편집 진입, 권한 실패.
// 조립·상태 로직의 검증은 lib 유닛(AW-11~18)이 하고, 여기서는 실브라우저 배선(버튼·모달·PUT 1회)을
// 확인한다. Worker·rawUrl은 라우트 mock.
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

/** 내 노트(브라우저 clientId를 CLIENT_ID로 고정해 isMine 성립) — 재편집 진입 검증용. */
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
      pages: [{ id: "PgAaAa01", state: EMPTY_PAGE_STATE, comment: "기존 페이지" }],
      createdAt: "2026-07-12T00:00:00.000Z",
      updatedAt: "2026-07-12T00:00:00.000Z",
    },
  ],
};

async function mockGist(page: Page, withNotes: boolean): Promise<void> {
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
      ? [{ name: `notes-${CLIENT_ID}.json`, size: 1, rawUrl: "https://worker.test/raw/notes", truncated: false }]
      : []),
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
  if (withNotes) {
    await page.route("https://worker.test/raw/notes", (route) =>
      route.fulfill({ body: JSON.stringify(NOTES_FILE) }),
    );
  }
}

/** PUT /g/:id/notes mock. 요청 본문(파일)을 모아 반환해 "단일 PUT + 파일 하나"를 검증한다. */
async function mockPutNotes(page: Page, status = 200): Promise<{ bodies: unknown[] }> {
  const captured: { bodies: unknown[] } = { bodies: [] };
  await page.route(`**/g/${HEX_ID}/notes`, (route) => {
    captured.bodies.push(JSON.parse(route.request().postData() ?? "null"));
    if (status !== 200) {
      return route.fulfill({
        status,
        json: { code: "edit-key-mismatch" },
        headers: { "content-type": "application/json" },
      });
    }
    return route.fulfill({
      json: {
        gistId: HEX_ID,
        file: `notes-${CLIENT_ID}.json`,
        index: { gistId: HEX_ID, files: [], fetchedAt: "2026-07-12T00:00:00.000Z" },
      },
      headers: { "content-type": "application/json" },
    });
  });
  return captured;
}

/** 브라우저 clientId를 고정한다 — mock 노트 파일이 "내 것"으로 성립해야 재편집 진입이 뜬다. */
async function pinClientId(page: Page): Promise<void> {
  await page.addInitScript((id) => {
    window.localStorage.setItem("tetorial:clientId", id);
  }, CLIENT_ID);
}

/** 분기 → 시뮬레이터 → 페이지 1개 추가 → 노트 완성(수집함으로). */
async function branchAndFinishNote(page: Page, comment: string): Promise<void> {
  await page.getByTestId("branch-button").click();
  await expect(page.getByTestId("sim-panel")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("comment-input").fill(comment);
  await page.getByTestId("add-page").click();
  await page.getByTestId("sim-finish").click();
  await expect(page.getByTestId("sim-panel")).toBeHidden();
}

test.describe("AW-15·16·11 수집 → 묶음 업로드 → 즉시 반영", () => {
  test.skip(!hasTTRM, "fixture 리플레이 부재");

  test("AW-15 시뮬레이터에 노트 단위 업로드 버튼이 없다(완성은 수집만)", async ({ page }) => {
    await pinClientId(page);
    await mockGist(page, false);
    const put = await mockPutNotes(page);
    await page.goto(`/replays/${encodeReplayId(HEX_ID)}`);
    await expect(page.getByTestId("replay-loaded")).toBeVisible({ timeout: 15_000 });

    await page.getByTestId("branch-button").click();
    await expect(page.getByTestId("sim-panel")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("sim-upload")).toHaveCount(0); // 재설계로 제거됨
    await expect(page.getByTestId("sim-finish")).toBeVisible();

    await page.getByTestId("comment-input").fill("첫 노트");
    await page.getByTestId("add-page").click();
    await page.getByTestId("sim-finish").click();

    // 완성 = 수집함에 추가. 이 시점에 전송은 없다.
    await expect(page.getByTestId("collected-notes")).toContainText("수집한 노트 1개");
    expect(put.bodies.length).toBe(0);
  });

  test("AW-16·11 수집 노트 2개 → 단일 PUT + 재로드 없이 사이드바 반영", async ({ page }) => {
    await pinClientId(page);
    await mockGist(page, false);
    const put = await mockPutNotes(page);
    await page.goto(`/replays/${encodeReplayId(HEX_ID)}`);
    await expect(page.getByTestId("replay-loaded")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("notes-sidebar")).toContainText("노트 (0)");

    await branchAndFinishNote(page, "노트 A");
    await branchAndFinishNote(page, "노트 B");
    await expect(page.getByTestId("collected-item")).toHaveCount(2);

    await page.getByTestId("upload-collected").click();

    // 단일 PUT — 본문은 노트 2개를 담은 파일 하나(AW-16).
    await expect.poll(() => put.bodies.length).toBe(1);
    const body = put.bodies[0] as { file: { notes: unknown[]; clientId: string } };
    expect(body.file.notes.length).toBe(2);
    expect(body.file.clientId).toBe(CLIENT_ID);

    // 재로드 없이 사이드바에 반영되고, 수집함은 비워진다(AW-11).
    await expect(page.getByTestId("notes-sidebar")).toContainText("노트 (2)");
    await expect(page.getByTestId("note-item")).toHaveCount(2);
    await expect(page.getByTestId("collected-notes")).toHaveCount(0);
    // 성공 문구는 실제 일어난 일만 서술한다(AW-11 — 거짓 표기 제거).
    await expect(page.getByTestId("collected-status")).toContainText("노트 2개를 올렸습니다");
  });
});

test.describe("AW-12·13 열람·재편집", () => {
  test.skip(!hasTTRM, "fixture 리플레이 부재");

  test("AW-12·13 사이드바 → 보드 뷰어 → 이어서 편집 → 수집함", async ({ page }) => {
    await pinClientId(page);
    await mockGist(page, true);
    const put = await mockPutNotes(page);
    await page.goto(`/replays/${encodeReplayId(HEX_ID)}`);
    await expect(page.getByTestId("replay-loaded")).toBeVisible({ timeout: 15_000 });

    await page.getByTestId("note-item").first().click();
    // AW-12: 메타 전용이 아니라 보드 렌더 포함 뷰어.
    await expect(page.getByTestId("viewer-modal")).toBeVisible();
    await expect(page.getByTestId("viewer-modal").getByTestId("board-canvas")).toBeVisible();
    await expect(page.getByTestId("vm-comment")).toContainText("기존 페이지");

    // AW-13: 내 노트 → 이어서 편집 진입.
    await page.getByTestId("vm-edit").click();
    await expect(page.getByTestId("sim-panel")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("sim-panel")).toContainText("노트 이어서 편집");
    // 기존 페이지가 로드돼 있다.
    await expect(page.getByTestId("page-list")).toContainText("기존 페이지");

    await page.getByTestId("comment-input").fill("이어서 쓴 페이지");
    await page.getByTestId("add-page").click();
    await page.getByTestId("sim-finish").click();

    // 편집 결과도 수집함 경유 — 업로드 경로는 하나다(§2).
    await expect(page.getByTestId("collected-notes")).toContainText("수집한 노트 1개");
    await page.getByTestId("upload-collected").click();

    await expect.poll(() => put.bodies.length).toBe(1);
    const body = put.bodies[0] as { file: { notes: { id: string; pages: unknown[] }[] } };
    expect(body.file.notes.length).toBe(1); // 같은 id upsert — 노트가 늘지 않는다
    expect(body.file.notes[0]!.id).toBe(NOTE_ID);
    expect(body.file.notes[0]!.pages.length).toBe(2);
  });

  test("AW-13 타인 노트는 편집 진입 없이 열람 전용", async ({ page }) => {
    // clientId를 고정하지 않으면 mock 파일(CLIENT_ID)은 남의 노트다.
    await mockGist(page, true);
    await page.goto(`/replays/${encodeReplayId(HEX_ID)}`);
    await expect(page.getByTestId("replay-loaded")).toBeVisible({ timeout: 15_000 });

    await page.getByTestId("note-item").first().click();
    await expect(page.getByTestId("viewer-modal")).toBeVisible();
    await expect(page.getByTestId("vm-edit")).toHaveCount(0);
  });
});

test.describe("AW-14 권한 실패 정직 표기", () => {
  test.skip(!hasTTRM, "fixture 리플레이 부재");

  test("AW-14 PUT 403 → 편집 키 불일치 문구", async ({ page }) => {
    await pinClientId(page);
    await mockGist(page, false);
    await mockPutNotes(page, 403);
    await page.goto(`/replays/${encodeReplayId(HEX_ID)}`);
    await expect(page.getByTestId("replay-loaded")).toBeVisible({ timeout: 15_000 });

    await branchAndFinishNote(page, "노트");
    await page.getByTestId("upload-collected").click();

    await expect(page.getByTestId("collected-status")).toContainText(
      "편집 키가 이 브라우저에 없거나 일치하지 않습니다",
    );
    // 실패했으므로 수집함은 유지된다(사용자가 잃지 않는다).
    await expect(page.getByTestId("collected-notes")).toContainText("수집한 노트 1개");
  });
});
