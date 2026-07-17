// RT-3 발췌 등가성 — 구명세 replay-tetrio §9
import { describe, expect, it } from "vitest";
import { excerptRounds, roundSizes } from "./excerpt.js";
import { parseReplay } from "./parse.js";
import { TetrioPlayback } from "./playback.js";
import { hasTtr, hasTtrm, loadTtrDoc, loadTtrmDoc } from "./testing/fixtures.js";

const LONG = 120_000;

/** 완주 후 최종 상태 요약 (프레임·배치·보드) — 발췌 등가성 대조 대상. */
function finalState(pb: TetrioPlayback): { frame: number; pieces: number; board: string[] } {
  pb.step(pb.totalFrames);
  return { frame: pb.frame, pieces: pb.view.stats.pieces, board: pb.view.board.rows };
}

describe("RT-3 발췌 등가성", () => {
  describe.skipIf(!hasTtrm)("ttrm 라운드 발췌 (fixture — 부재 시 skip)", () => {
    it(
      "excerptRounds(doc, [1]) 재파싱·재생 최종 상태 = 원본 라운드 1 재생과 deep equal",
      () => {
        const doc = loadTtrmDoc();
        const excerpt = excerptRounds(doc, [1]);
        expect(excerpt.roundMap).toEqual([1]);
        expect(excerpt.rawBytes).toBeGreaterThan(0);

        const reparsed = parseReplay(excerpt.json);
        expect(reparsed.ok).toBe(true);
        if (!reparsed.ok) return;
        // 발췌본은 라운드 1개만 남는다 (그 외 필드는 보존)
        expect(reparsed.value.rounds.length).toBe(1);
        expect(reparsed.value.rounds[0]?.length).toBe(doc.rounds[1]?.length);

        const players = doc.rounds[1]?.length ?? 0;
        for (let p = 0; p < players; p++) {
          const original = finalState(new TetrioPlayback(doc, { round: 1, player: p }));
          const excerpted = finalState(new TetrioPlayback(reparsed.value, { round: 0, player: p }));
          expect(excerpted, `플레이어 ${p} 발췌 등가성`).toEqual(original);
        }
      },
      LONG,
    );

    it("roundSizes — 라운드별 바이트 (길이 = 라운드 수, 모두 양수)", () => {
      const doc = loadTtrmDoc();
      const sizes = roundSizes(doc);
      expect(sizes.length).toBe(doc.rounds.length);
      for (const s of sizes) expect(s).toBeGreaterThan(0);
    });

    it("originalRounds 오름차순·중복 위반 시 throw", () => {
      const doc = loadTtrmDoc();
      expect(() => excerptRounds(doc, [1, 0])).toThrow();
      expect(() => excerptRounds(doc, [0, 0])).toThrow();
    });
  });

  describe.skipIf(!hasTtr)("ttr 발췌 불가 (fixture — 부재 시 skip)", () => {
    it("[0]이면 전체 그대로, [1]이면 오류", () => {
      const doc = loadTtrDoc();
      const whole = excerptRounds(doc, [0]);
      expect(whole.roundMap).toEqual([0]);
      expect(parseReplay(whole.json).ok).toBe(true);
      expect(() => excerptRounds(doc, [1])).toThrow();
      expect(roundSizes(doc).length).toBe(1);
    });
  });
});
