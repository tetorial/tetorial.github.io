// 재생 세션 — 결정론 컨트롤러(createPlayback) + 실시간 시계(PlaybackClock)를 묶은 얇은 셸.
// 타이머(now/schedule/cancel)는 주입식이다 — 브라우저는 performance.now·rAF, 테스트는 수동 타이머.
import { createPlayback, PlaybackClock } from "@tetorial/replay-tetrio";
import type {
  PlaybackController,
  PlaybackView,
  PlaybackClockOptions,
} from "@tetorial/replay-tetrio";
import type { CaptureResult } from "@tetorial/adapter-tetrio";

export type PlaybackTimers = Pick<PlaybackClockOptions, "now" | "schedule" | "cancel">;

export interface PlaybackSession {
  readonly controller: PlaybackController;
  readonly clock: PlaybackClock;
  readonly frame: number;
  readonly totalFrames: number;
  readonly ended: boolean;
  readonly speed: number;
  readonly playing: boolean;
  readonly view: PlaybackView;
  play(): void;
  pause(): void;
  seek(frame: number): void;
  step(frames?: number): void;
  setSpeed(speed: number): void;
  /** 분기(시뮬레이터 진입) 캡처 — 항상 프레임 경계(§5). */
  captureBranch(): CaptureResult;
  subscribe(cb: () => void): () => void;
  dispose(): void;
}

/**
 * (round, player)를 재생하는 세션을 만든다. `round`는 doc 내부 인덱스다
 * (원본 번호 변환은 open-replay.originalRound가 담당).
 */
export function createPlaybackSession(
  doc: Parameters<typeof createPlayback>[0],
  target: { round: number; player: number },
  timers: PlaybackTimers,
): PlaybackSession {
  const controller = createPlayback(doc, target);
  const clock = new PlaybackClock(controller, {
    now: timers.now,
    schedule: timers.schedule,
    cancel: timers.cancel,
  });
  const listeners = new Set<() => void>();
  const notify = (): void => {
    for (const cb of listeners) cb();
  };

  return {
    controller,
    clock,
    get frame() {
      return controller.frame;
    },
    get totalFrames() {
      return controller.totalFrames;
    },
    get ended() {
      return controller.ended;
    },
    get speed() {
      return clock.speed;
    },
    get playing() {
      return clock.playing;
    },
    get view() {
      return controller.view;
    },
    play() {
      clock.play();
      notify();
    },
    pause() {
      clock.pause();
      notify();
    },
    seek(frame) {
      controller.seek(frame);
      notify();
    },
    step(frames) {
      controller.step(frames);
      notify();
    },
    setSpeed(speed) {
      clock.setSpeed(speed);
      notify();
    },
    captureBranch() {
      return controller.captureBranch();
    },
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    dispose() {
      clock.pause();
      listeners.clear();
    },
  };
}
