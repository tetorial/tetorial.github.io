import { test, expect } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { parseReplay } from "@tetorial/replay-tetrio";
import { buildUploadPayload } from "../src/lib/upload.ts";

// AW-4 gist 열기 스모크 — index → rawUrl fetch → 무결성 → 재생. 404 분기.
// Worker·rawUrl은 page.route로 mock한다(실 네트워크 없음).
const FIXTURE_DIR = fileURLToPath(new URL("../../../fixtures", import.meta.url));
const TTRM = join(FIXTURE_DIR, "replay_sample.ttrm");

test("AW-4 gist 열기: mock index·rawUrl 무결성 통과 → 재생", async ({ page }) => {
  test.skip(!existsSync(TTRM), "fixture 부재");
  const parsed = parseReplay(readFileSync(TTRM, "utf8"));
  if (!parsed.ok) throw new Error("fixture 파싱 실패");
  const payload = await buildUploadPayload({
    doc: parsed.value,
    selectedRounds: parsed.value.rounds.map((_, i) => i),
  });

  const index = {
    gistId: "g1",
    files: [
      { name: "meta.json", size: 1, rawUrl: "https://worker.test/raw/meta", truncated: false },
      { name: "replay.ttrm.gz.b64", size: 1, rawUrl: "https://worker.test/raw/replay", truncated: false },
    ],
    fetchedAt: "2026-07-12T00:00:00.000Z",
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

  // 경로형 딥링크(M1d-1) — 비표준 id "g1"은 원문 통과(fallback)로 해석된다.
  await page.goto("/replays/g1");
  await expect(page.getByTestId("replay-loaded")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("board-canvas")).toBeVisible();
});

test("AW-4 gist 404 → 오류 문구 + 홈 링크", async ({ page }) => {
  await page.route("**/g/missing", (route) =>
    route.fulfill({
      status: 404,
      json: { code: "not-found", message: "리플레이를 찾을 수 없습니다" },
      headers: { "content-type": "application/json" },
    }),
  );
  await page.goto("/replays/missing");
  await expect(page.getByTestId("replay-error")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("리플레이를 찾을 수 없습니다")).toBeVisible();
});
