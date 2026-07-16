// RT-4 seek 등가성 — docs/specs/replay-tetrio.md §9
// 어떤 경로로 프레임 f에 도달하든 engine.snapshot()이 동일해야 한다(§5-2).
import { describe, expect, it } from "vitest";
import { TetrioPlayback } from "./playback.js";
import { hasTtr, loadTtrDoc } from "./testing/fixtures.js";

const LONG = 120_000;

describe("RT-4 seek 등가성", () => {
  describe.skipIf(!hasTtr)("3경로 snapshot 대조 (fixture — 부재 시 skip)", () => {
    it(
      "임의 프레임 f 10곳: 직진 vs 지나친 후 복귀 vs 키프레임 무효화 후 재생성 → snapshot 동일",
      () => {
        const doc = loadTtrDoc();
        const total = new TetrioPlayback(doc, { round: 0, player: 0 }).totalFrames;
        // 키프레임 간격(300) 앞뒤를 섞는다: <300은 재생성, ≥300은 키프레임 복원 경로를 탄다
        const overshoot = total - 1;
        const frames = [1, 45, 150, 299, 300, 305, 600, 900, 1200, overshoot - 1].filter(
          (f) => f >= 1 && f < total,
        );
        expect(frames.length).toBeGreaterThanOrEqual(10);

        for (const f of frames) {
          // 경로 1: 0부터 직진
          const a = new TetrioPlayback(doc, { round: 0, player: 0 });
          a.seek(f);
          expect(a.frame).toBe(f);
          const snapA = a.engine.snapshot();

          // 경로 2: 지나친 후 seek로 복귀 (키프레임 복원 또는 재생성)
          const b = new TetrioPlayback(doc, { round: 0, player: 0 });
          b.seek(overshoot);
          b.seek(f);
          expect(b.frame).toBe(f);
          expect(b.engine.snapshot(), `f=${f} 복귀 경로`).toEqual(snapA);

          // 경로 3: 키프레임 무효화 후 재생성 경로
          const c = new TetrioPlayback(doc, { round: 0, player: 0 });
          c.seek(overshoot);
          c.invalidateKeyframes();
          c.seek(f);
          expect(c.frame).toBe(f);
          expect(c.engine.snapshot(), `f=${f} 재생성 경로`).toEqual(snapA);
        }
      },
      LONG,
    );
  });
});
