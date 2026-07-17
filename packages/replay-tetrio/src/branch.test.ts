// RT-6 분기 연동 — 구명세 replay-tetrio §9
// captureBranch() 산출 Snapshot이 어댑터 A-1(큐 정합성 골든)을 fixture에서 통과.
import { describe, expect, it } from "vitest";
import type { Engine } from "@haelp/teto/engine";
import { snapshotSchema } from "@tetorial/types";
import { TetrioPlayback } from "./playback.js";
import { hasTtr, hasTtrm, loadTtrDoc, loadTtrmDoc } from "./testing/fixtures.js";

const LONG = 120_000;

/** 큐 소비 관측: queue.shift를 패치해 이후 스폰돼 나가는 미노 열을 기록(어댑터 A-1과 동일 기법). */
function recordQueueConsumption(engine: Engine): string[] {
  const consumed: string[] = [];
  const original = engine.queue.shift.bind(engine.queue);
  engine.queue.shift = () => {
    const mino = original();
    if (mino !== undefined) consumed.push(String(mino).toUpperCase());
    return mino;
  };
  return consumed;
}

type Sample = { label: string; make: () => TetrioPlayback; frame: number };

describe("RT-6 분기 연동 (captureBranch → 어댑터 A-1)", () => {
  const samples: Sample[] = [];

  if (hasTtrm) {
    const doc = loadTtrmDoc();
    // 생존 플레이어(p0)는 라운드 끝까지 재생되므로 어떤 프레임에서도 캡처 가능
    for (const [round, frames] of [
      [0, [60, 400, 1200, 2500, 4000]],
      [1, [60, 400, 1200]],
    ] as const) {
      for (const frame of frames) {
        samples.push({
          label: `ttrm R${round} P0 @${frame}`,
          make: () => new TetrioPlayback(doc, { round, player: 0 }),
          frame,
        });
      }
    }
  }
  if (hasTtr) {
    const doc = loadTtrDoc();
    for (const frame of [60, 400, 900, 1300]) {
      samples.push({
        label: `ttr @${frame}`,
        make: () => new TetrioPlayback(doc, { round: 0, player: 0 }),
        frame,
      });
    }
  }

  describe.skipIf(samples.length === 0)("fixture 표본 (부재 시 skip)", () => {
    it(
      "표본 10곳+에서 snapshot.queue 앞 k개 = 이후 실제 큐 스폰 열 · 스키마 통과",
      () => {
        expect(samples.length).toBeGreaterThanOrEqual(10);
        for (const s of samples) {
          const pb = s.make();
          pb.seek(s.frame);
          const result = pb.captureBranch();
          expect(result.ok, `${s.label}: 캡처 실패`).toBe(true);
          if (!result.ok) continue;

          expect(() => snapshotSchema.parse(result.snapshot)).not.toThrow(); // 산출물 검증 병행

          // 캡처 후 계속 재생 — 큐에서 스폰돼 나가는 미노 열을 관측
          const consumed = recordQueueConsumption(pb.engine);
          pb.step(pb.totalFrames);
          const k = Math.min(consumed.length, result.snapshot.queue.length);
          expect(k, `${s.label}: 캡처 후 스폰 없음`).toBeGreaterThan(0);
          expect(consumed.slice(0, k).join(""), `${s.label}: 큐 불일치`).toBe(
            result.snapshot.queue.slice(0, k),
          );
        }
      },
      LONG,
    );
  });
});
