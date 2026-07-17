// RT-8 시계 분리 — 구명세 replay-tetrio §9
// 수동 타이머로 PlaybackClock 구동. 배속·일시정지·프레임 경계 정렬 검증.
// (코어 재생 테스트는 시계 없이 통과하므로 여기선 스텁 컨트롤러로 시계 로직만 격리 검증.)
import { beforeEach, describe, expect, it } from "vitest";
import { PlaybackClock } from "./clock.js";
import type { PlaybackController, PlaybackView } from "./playback.js";

/** step 호출만 관측하면 되는 최소 컨트롤러 스텁. */
class StubController implements PlaybackController {
  frame = 0;
  readonly totalFrames: number;
  readonly steps: number[] = [];

  constructor(total: number) {
    this.totalFrames = total;
  }

  get ended(): boolean {
    return this.frame >= this.totalFrames;
  }

  step(frames = 1): void {
    this.steps.push(frames);
    this.frame = Math.min(this.totalFrames, this.frame + frames);
  }

  seek(frame: number): void {
    this.frame = Math.max(0, Math.min(frame, this.totalFrames));
  }

  get view(): PlaybackView {
    return {
      board: { width: 10, rows: [] },
      falling: null,
      next: [],
      hold: { piece: null, locked: false },
      stats: { b2b: -1, combo: -1, pieces: 0, lines: 0 },
      pendingGarbage: 0,
    };
  }

  on(): () => void {
    return () => {};
  }

  captureBranch(): { ok: false; reason: "topped-out" } {
    return { ok: false, reason: "topped-out" };
  }
}

/** 주입식 수동 타이머. advance(ms)로 시각을 밀고 예약된 콜백을 1회 실행한다. */
function manualTimer() {
  let nowMs = 0;
  let scheduled: (() => void) | null = null;
  return {
    options: {
      now: () => nowMs,
      schedule: (cb: () => void) => {
        scheduled = cb;
        return 1;
      },
      cancel: () => {
        scheduled = null;
      },
    },
    advance(ms: number): void {
      nowMs += ms;
      const cb = scheduled;
      scheduled = null;
      cb?.();
    },
    get pending(): boolean {
      return scheduled !== null;
    },
  };
}

describe("RT-8 시계 분리", () => {
  let controller: StubController;

  beforeEach(() => {
    controller = new StubController(100_000);
  });

  it("60fps·1× — 100ms 경과 → 6프레임 전진", () => {
    const timer = manualTimer();
    const clock = new PlaybackClock(controller, timer.options);
    clock.play();
    timer.advance(100);
    expect(controller.frame).toBe(6); // 100ms × 60fps = 6
  });

  it("배속 2× / 0.5× 반영", () => {
    const t2 = manualTimer();
    new PlaybackClock(controller, { ...t2.options, speed: 2 }).play();
    t2.advance(100);
    expect(controller.frame).toBe(12);

    const half = new StubController(100_000);
    const th = manualTimer();
    new PlaybackClock(half, { ...th.options, speed: 0.5 }).play();
    th.advance(100);
    expect(half.frame).toBe(3);
  });

  it("배속 0.25×~4× 클램프", () => {
    const timer = manualTimer();
    const clock = new PlaybackClock(controller, timer.options);
    clock.setSpeed(10);
    expect(clock.speed).toBe(4);
    clock.setSpeed(0.01);
    expect(clock.speed).toBe(0.25);
  });

  it("일시정지 — 이후 시간 경과가 무시된다", () => {
    const timer = manualTimer();
    const clock = new PlaybackClock(controller, timer.options);
    clock.play();
    timer.advance(100);
    expect(controller.frame).toBe(6);
    clock.pause();
    expect(clock.paused).toBe(true);
    timer.advance(1000);
    expect(controller.frame).toBe(6); // 정지 후 전진 없음
  });

  it("프레임 경계 정렬 — step은 정수 프레임만, 소수분은 누적", () => {
    const timer = manualTimer();
    const clock = new PlaybackClock(controller, timer.options);
    clock.play();
    // 16ms × 60 / 1000 = 0.96프레임 → 첫 wake는 0프레임(누적 0.96)
    timer.advance(16);
    expect(controller.frame).toBe(0);
    expect(Number.isInteger(controller.frame)).toBe(true);
    // 두 번째 16ms → 누적 1.92 → 1프레임
    timer.advance(16);
    expect(controller.frame).toBe(1);
    expect(Number.isInteger(controller.frame)).toBe(true);
  });

  it("종료 도달 시 자동 일시정지", () => {
    const small = new StubController(3);
    const timer = manualTimer();
    const clock = new PlaybackClock(small, timer.options);
    clock.play();
    timer.advance(1000); // 60프레임어치 → 3에서 종료
    expect(small.frame).toBe(3);
    expect(small.ended).toBe(true);
    expect(clock.paused).toBe(true);
    expect(timer.pending).toBe(false); // 재예약 안 함
  });

  it("종료 상태에서는 play()가 무시된다", () => {
    const ended = new StubController(0);
    const timer = manualTimer();
    const clock = new PlaybackClock(ended, timer.options);
    clock.play();
    expect(clock.playing).toBe(false);
    expect(timer.pending).toBe(false);
  });
});
