import { test, expect, type Page } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { parseReplay } from "@tetorial/replay-tetrio";
import { buildUploadPayload } from "../src/lib/upload.ts";
import { makeNote, makeNotesFile } from "../src/lib/testing.ts";

// M6-C 재생 슬라이더·노트 마커 시각 통합 (m6c-slider-markers.md — AW-42~44).
// 형태(AW-42 핸들·AW-43 화살촉)는 e2e에서 관측 가능한 스타일 속성으로, 상호작용(AW-44 드롭다운)은
// 실브라우저 호버·클릭으로 고정한다. 순수 상호작용 판정(single/dropdown)은 유닛(markers.test.ts).
// Worker·rawUrl은 page.route로 mock한다 — 노트가 실린 gist를 열어 타임라인 마커를 렌더한다.
const FIXTURE_DIR = fileURLToPath(new URL("../../../fixtures", import.meta.url));
const TTRM = join(FIXTURE_DIR, "replay_sample.ttrm");
const CLIENT = "cccccccccccc"; // 12자 clientId(notes-<clientId>.json)

/** 노트 2개가 겹치는 클러스터(100·130 프레임) + 멀리 떨어진 단일 노트(900)를 실은 gist를 연다. */
async function openReplayWithNotes(page: Page): Promise<void> {
  const parsed = parseReplay(readFileSync(TTRM, "utf8"));
  if (!parsed.ok) throw new Error("fixture 파싱 실패");
  const payload = await buildUploadPayload({
    doc: parsed.value,
    selectedRounds: parsed.value.rounds.map((_, i) => i),
  });
  const notesFile = makeNotesFile(
    CLIENT,
    [
      makeNote("cluster1", 100, "클러스터 노트 A"),
      makeNote("cluster2", 130, "클러스터 노트 B"),
      makeNote("single01", 900, "단일 노트"),
    ],
    "corun",
  );

  const index = {
    gistId: "g1",
    files: [
      { name: "meta.json", size: 1, rawUrl: "https://worker.test/raw/meta", truncated: false },
      { name: "replay.ttrm.gz.b64", size: 1, rawUrl: "https://worker.test/raw/replay", truncated: false },
      { name: `notes-${CLIENT}.json`, size: 1, rawUrl: "https://worker.test/raw/notes", truncated: false },
    ],
    fetchedAt: "2026-07-19T00:00:00.000Z",
  };

  await page.route("**/g/g1", (route) =>
    route.fulfill({ json: index, headers: { "content-type": "application/json" } }),
  );
  await page.route("https://worker.test/raw/meta", (route) =>
    route.fulfill({ body: JSON.stringify(payload.meta) }),
  );
  await page.route("https://worker.test/raw/replay", (route) =>
    route.fulfill({ body: payload.replayBody }),
  );
  await page.route("https://worker.test/raw/notes", (route) =>
    route.fulfill({ body: JSON.stringify(notesFile) }),
  );

  await page.goto("/replays/g1");
  await expect(page.getByTestId("replay-loaded")).toBeVisible({ timeout: 15_000 });
}

test.describe("M6-C 슬라이더·마커 시각 통합", () => {
  test.skip(!existsSync(TTRM), "fixture 리플레이 부재");

  test("AW-42 재생 슬라이더 핸들이 원형 네이티브가 아니라 커스텀 핸들로 교체된다", async ({
    page,
  }) => {
    await openReplayWithNotes(page);
    // thumb 의사요소의 치수는 스크립트로 관측되지 않으므로(getComputedStyle이 입력 박스를 돌려줌),
    // 관측 가능한 스타일 속성으로 "원형 네이티브 핸들 교체"를 고정한다 — appearance 리셋이 커스텀
    // 세로 직사각형 thumb(::-webkit-slider-thumb·::-moz-range-thumb)의 전제다. 실제 직사각형 규칙은
    // 유닛 계약(PlaybackControls.test.ts AW-42)이 고정한다.
    const appearance = await page.getByTestId("scrubber").evaluate((el) => {
      const s = getComputedStyle(el);
      return s.appearance || s.getPropertyValue("-webkit-appearance");
    });
    expect(appearance).toBe("none");
  });

  test("AW-43 노트 마커가 원형이 아니라 화살촉(clip-path 다각형)으로 트랙을 가리킨다", async ({
    page,
  }) => {
    await openReplayWithNotes(page);
    const markers = page.getByTestId("note-marker");
    // 클러스터 1개 + 단일 1개 = 마커 2개. 클러스터는 개수(2)를 계속 표시한다.
    await expect(markers).toHaveCount(2);
    await expect(markers.filter({ hasText: "2" })).toHaveCount(1);

    for (const i of [0, 1]) {
      const clip = await markers.nth(i).evaluate((el) => getComputedStyle(el).clipPath);
      expect(clip).toContain("polygon"); // 화살촉(원형 border-radius:50% 아님)
    }
  });

  test("AW-44 클러스터는 호버 드롭다운으로 선택 열기, 단일 마커는 클릭 즉시 열기", async ({
    page,
  }) => {
    await openReplayWithNotes(page);
    const items = page.getByTestId("note-marker-item");
    // 드롭다운 항목은 DOM에 있으나 호버 전에는 숨겨진다(title 툴팁 의존 제거).
    await expect(items).toHaveCount(2);
    await expect(items.first()).toBeHidden();

    const cluster = page.getByTestId("note-marker").filter({ hasText: "2" });
    await cluster.hover();
    await expect(items.first()).toBeVisible();

    // 항목 선택 → 첫 노트가 아니라 선택한 노트가 열린다(현행 "첫 노트만" 대체).
    await items.filter({ hasText: "클러스터 노트 B" }).click();
    await expect(page.getByTestId("viewer-modal")).toBeVisible();
    await expect(page.getByTestId("viewer-modal")).toContainText("클러스터 노트 B");
    await page.getByRole("button", { name: "닫기" }).click();
    await expect(page.getByTestId("viewer-modal")).toBeHidden();

    // 단일 마커(●)는 클릭 즉시 열린다.
    await page.getByTestId("note-marker").filter({ hasText: "●" }).click();
    await expect(page.getByTestId("viewer-modal")).toBeVisible();
    await expect(page.getByTestId("viewer-modal")).toContainText("단일 노트");
  });
});
