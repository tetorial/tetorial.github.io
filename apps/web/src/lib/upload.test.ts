import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { parseReplay } from "@tetorial/replay-tetrio";
import type { ReplayDoc } from "@tetorial/replay-tetrio";
import { metaFileSchema } from "@tetorial/types";
import { allRoundIndices, estimateUploadSize, buildUploadPayload } from "./upload.js";
import { gunzipBase64 } from "./compression.js";
import { sha256Hex } from "./integrity.js";

// fixture는 익명화 커밋본(D-16). 부재 시 skip(fixture 없는 환경 대비 — conventions §4).
// 경로는 이 테스트 파일 기준으로 앵커한다(cwd 비의존): apps/web/src/lib → 리포 루트 /fixtures.
const FIXTURE_ROOT = fileURLToPath(new URL("../../../../fixtures", import.meta.url));
const TTRM = join(FIXTURE_ROOT, "replay_sample.ttrm");

function loadDoc(path: string): ReplayDoc | null {
  if (!existsSync(path)) return null;
  const parsed = parseReplay(readFileSync(path, "utf8"));
  if (!parsed.ok) throw new Error(`fixture 파싱 실패: ${parsed.error.code}`);
  return parsed.value;
}

// AW-3 업로드: 라운드 발췌 선택(용량 표시) → meta 조립 → POST 본문.
describe("AW-3 업로드 조립", () => {
  it("AW-3 라운드별·선택 용량 추정 + 800KB 경고 플래그", () => {
    const doc = loadDoc(TTRM);
    if (!doc) return;
    const all = allRoundIndices(doc);
    const est = estimateUploadSize(doc, all);
    expect(est.perRoundRawBytes.length).toBe(doc.rounds.length);
    expect(est.replayBodyBytes).toBeGreaterThan(0);
    expect(typeof est.overWarn).toBe("boolean");
    // 부분 선택은 전체보다 작거나 같다.
    if (all.length > 1) {
      const partial = estimateUploadSize(doc, [all[0]!]);
      expect(partial.selectedRawBytes).toBeLessThanOrEqual(est.selectedRawBytes);
    }
  });

  it("AW-3 MetaFile이 스키마를 통과하고 replay.sha256·bytes가 발췌 원문 기준", async () => {
    const doc = loadDoc(TTRM);
    if (!doc) return;
    const selected = allRoundIndices(doc);
    const payload = await buildUploadPayload({ doc, selectedRounds: selected, title: "테스트 복기" });

    // 스키마 통과(Worker가 재검증하는 형태와 동일)
    expect(metaFileSchema.safeParse(payload.meta).success).toBe(true);
    expect(payload.meta.replay.encoding).toBe("gzip+base64");
    expect(payload.meta.replay.file).toBe(`replay.${doc.kind}.gz.b64`);
    expect(payload.meta.rounds.map).toEqual(selected);

    // replayBody를 gunzip한 원문의 sha256 = meta.replay.sha256 (무결성 왕복)
    const restored = gunzipBase64(payload.replayBody);
    expect(await sha256Hex(restored)).toBe(payload.meta.replay.sha256);
    expect(new TextEncoder().encode(restored).length).toBe(payload.meta.replay.bytes);
  });

  it("AW-3 displayCache.roundWinners를 발췌 라운드에 맞춰 재색인(길이 일치)", async () => {
    const doc = loadDoc(TTRM);
    if (!doc) return;
    if (doc.rounds.length < 2) return;
    const selected = [allRoundIndices(doc)[0]!]; // 1개만 발췌
    const payload = await buildUploadPayload({ doc, selectedRounds: selected });
    const winners = payload.meta.displayCache?.roundWinners;
    if (winners) expect(winners.length).toBe(payload.meta.rounds.map.length);
    // 스키마 refine(roundWinners 길이 == rounds.map 길이)을 통과해야 한다.
    expect(metaFileSchema.safeParse(payload.meta).success).toBe(true);
  });
});
