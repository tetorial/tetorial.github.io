// 실물 리플레이 골든 테스트 — 수용 기준 A-1·A-3·A-5·A-6·A-7 (docs/specs/adapter-tetrio.md §6)
// fixture는 공개 커밋 미결(decisions 미결 항목) → 부재 시 skip (kickoff §1-4)
import { beforeAll, describe, expect, it } from "vitest";
import { snapshotSchema } from "@tetorial/types";
import { captureSnapshot } from "./capture.js";
import {
  expectOk,
  hasTtrm,
  loadTtrm,
  opponentsOf,
  Playback,
  recordQueueConsumption,
  type RoundEntry,
} from "./testing/harness.js";

const LONG = 120_000; // 전체 리플레이 다회 재생 — 기본 타임아웃(5s) 상향

type Scan = {
  end: number; // 재생 정지 프레임 (이벤트 소진 또는 탑아웃)
  holdBoundaries: number[]; // 홀드 발생 tick 직후의 프레임 경계
  clearBoundaries: number[]; // 라인 클리어 발생 tick 직후의 프레임 경계
  bothNegativeBoundary: number | null; // b2b/combo 둘 다 -1인 첫 경계 (A-3)
  pendingGarbage: { frame: number; lines: number } | null; // 대기 쓰레기 첫 관측 경계 (A-5)
};

type Target = { label: string; entry: RoundEntry; opponents: number[]; scan: Scan };

/** 전체 재생 1회로 관심 프레임 경계를 수집한다. 캡처는 항상 tick 완료 직후 경계(§5-1) */
function scanEntry(entry: RoundEntry, opponents: number[]): Scan {
  const pb = new Playback(entry, opponents);
  let holdFlag = false;
  let clearFlag = false;
  pb.engine.events.on("falling.new", ({ isHold }) => {
    if (isHold) holdFlag = true;
  });
  pb.engine.events.on("falling.lock", (res) => {
    if (res.lines > 0) clearFlag = true;
  });

  const scan: Scan = {
    end: 0,
    holdBoundaries: [],
    clearBoundaries: [],
    bothNegativeBoundary: null,
    pendingGarbage: null,
  };
  while (pb.hasMore()) {
    holdFlag = false;
    clearFlag = false;
    pb.tickOnce();
    if (pb.engine.toppedOut) break; // 탑아웃 경계는 캡처 불가(§5-4) — 표본에서 제외
    const frame = pb.engine.frame;
    if (holdFlag) scan.holdBoundaries.push(frame);
    if (clearFlag) scan.clearBoundaries.push(frame);
    if (
      scan.bothNegativeBoundary === null &&
      pb.engine.stats.b2b === -1 &&
      pb.engine.stats.combo === -1
    ) {
      scan.bothNegativeBoundary = frame;
    }
    const pending = pb.engine.garbageQueue.size;
    if (scan.pendingGarbage === null && pending > 0) {
      scan.pendingGarbage = { frame, lines: pending };
    }
  }
  scan.end = pb.engine.frame;
  return scan;
}

/** 라운드 초반·후반 + 홀드 직후·라인 클리어 직후를 섞은 캡처 표본 (A-1 요구 분포) */
function sampleFrames(scan: Scan): number[] {
  const early = Math.min(60, Math.max(1, scan.end - 1));
  const late = Math.floor(scan.end * 0.9);
  const samples = new Set<number>([
    early,
    late,
    ...scan.holdBoundaries.slice(0, 2),
    ...scan.clearBoundaries.slice(0, 2),
  ]);
  return [...samples].filter((f) => f >= 1 && f < scan.end).sort((a, b) => a - b);
}

function replayTo(target: Target, frame: number): Playback {
  const pb = new Playback(target.entry, target.opponents);
  pb.runTo(frame);
  if (pb.engine.frame !== frame) {
    throw new Error(`${target.label}: 프레임 ${frame} 도달 실패 (정지: ${pb.engine.frame})`);
  }
  return pb;
}

describe.skipIf(!hasTtrm)("골든 — fixtures/replay_sample.ttrm (부재 시 skip)", () => {
  const targets: Target[] = [];

  beforeAll(() => {
    const ttrm = loadTtrm();
    ttrm.replay.rounds.forEach((round, ri) => {
      for (const entry of round) {
        const opponents = opponentsOf(round, entry);
        targets.push({
          label: `라운드 ${ri} · ${entry.username ?? "?"}`,
          entry,
          opponents,
          scan: scanEntry(entry, opponents),
        });
      }
    });
  }, LONG);

  describe("A-1 큐 정합성", () => {
    it(
      "표본 10곳 이상(홀드·클리어 직후, 초반/후반 포함)에서 snapshot.queue 앞 k개 = 이후 실제 큐 스폰 열",
      () => {
        const samples = targets.flatMap((target) =>
          sampleFrames(target.scan).map((frame) => ({ target, frame })),
        );
        expect(samples.length).toBeGreaterThanOrEqual(10);
        // 요구 분포 충족 확인: 홀드 직후·라인 클리어 직후 표본이 실제로 포함돼 있다
        expect(targets.some((t) => t.scan.holdBoundaries.length > 0)).toBe(true);
        expect(targets.some((t) => t.scan.clearBoundaries.length > 0)).toBe(true);

        for (const { target, frame } of samples) {
          const pb = replayTo(target, frame);
          const { snapshot } = expectOk(captureSnapshot(pb.engine, target.entry.replay.options));
          expect(() => snapshotSchema.parse(snapshot)).not.toThrow(); // A-7 병행 검증

          // 캡처 후 재생 계속 — 큐에서 꺼내(스폰돼) 나가는 미노 열을 관측
          const consumed = recordQueueConsumption(pb.engine);
          pb.runToEnd();
          const k = Math.min(consumed.length, snapshot.queue.length);
          expect(k, `${target.label} @${frame}: 캡처 후 스폰 없음`).toBeGreaterThan(0);
          expect(consumed.slice(0, k).join(""), `${target.label} @${frame}: 큐 불일치`).toBe(
            snapshot.queue.slice(0, k),
          );
        }
      },
      LONG,
    );
  });

  describe("A-3 카운터 규약 (실물)", () => {
    it("b2b/combo가 -1인 시점 캡처 → 원값 -1 보존", () => {
      const target = targets.find((t) => t.scan.bothNegativeBoundary !== null);
      expect(target).toBeDefined();
      if (!target || target.scan.bothNegativeBoundary === null) return;
      const pb = replayTo(target, target.scan.bothNegativeBoundary);
      const { snapshot } = expectOk(captureSnapshot(pb.engine, target.entry.replay.options));
      expect(snapshot.counters).toEqual({ b2b: -1, combo: -1 });
    });
  });

  describe("A-5 대기 쓰레기 (실물)", () => {
    it(
      "상대 공격 수신 직후(적용 전) 프레임 캡처 → pendingGarbage 정확 보고 + 경고 동반",
      () => {
        const target = targets.find((t) => t.scan.pendingGarbage !== null);
        expect(target, "리플레이에서 대기 쓰레기 프레임을 찾지 못함").toBeDefined();
        if (!target || target.scan.pendingGarbage === null) return;

        const { frame, lines } = target.scan.pendingGarbage;
        const pb = replayTo(target, frame);
        expect(pb.engine.garbageQueue.size).toBe(lines); // 결정론 재현 확인
        const result = expectOk(captureSnapshot(pb.engine, target.entry.replay.options));
        expect(result.pendingGarbage).toBe(lines);
        expect(result.warnings).toContainEqual({ type: "pending-garbage-dropped", lines });
        // 대기분은 보드에 반영되지 않는다 — 캡처 보드 = 그 시점 엔진 보드 그대로
        expect(() => snapshotSchema.parse(result.snapshot)).not.toThrow();
      },
      LONG,
    );
  });

  describe("A-6 결정론 (실물)", () => {
    it(
      "같은 리플레이·같은 프레임 캡처 2회 → CaptureResult deep equal",
      () => {
        const target = targets[0];
        if (!target) throw new Error("표본 없음");
        const frame = sampleFrames(target.scan)[0];
        if (frame === undefined) throw new Error("표본 프레임 없음");

        // 독립 재생 2회
        const first = captureSnapshot(replayTo(target, frame).engine, target.entry.replay.options);
        const second = captureSnapshot(replayTo(target, frame).engine, target.entry.replay.options);
        expect(second).toEqual(first);

        // 같은 엔진 2회 캡처도 동일 (queue.minLength 상향의 멱등성)
        const pb = replayTo(target, frame);
        const third = captureSnapshot(pb.engine, target.entry.replay.options);
        const fourth = captureSnapshot(pb.engine, target.entry.replay.options);
        expect(fourth).toEqual(third);
        expect(third).toEqual(first);
      },
      LONG,
    );
  });

  describe("A-7 산출물 검증 (실물)", () => {
    it(
      "모든 플레이어·라운드의 초반 경계 캡처가 snapshotSchema를 통과한다",
      () => {
        for (const target of targets) {
          const frame = Math.min(60, Math.max(1, target.scan.end - 1));
          const pb = replayTo(target, frame);
          const { snapshot } = expectOk(captureSnapshot(pb.engine, target.entry.replay.options));
          expect(() => snapshotSchema.parse(snapshot), `${target.label} @${frame}`).not.toThrow();
        }
      },
      LONG,
    );
  });
});
