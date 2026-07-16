// 재생 시계 (실시간 셸) — 명세 §6.
//
// 결정론 코어(PlaybackController)를 감싸 실시간으로 step()을 구동한다.
// 타이머(now/schedule/cancel)는 전부 주입식이다 — 이 패키지는 DOM/전역 시계를 직접 만지지 않는다.
// apps/web이 requestAnimationFrame·performance.now를 주입하고, 테스트는 수동 타이머를 주입한다.
import type { PlaybackController } from "./playback.js";

export interface PlaybackClockOptions {
  /** 논리 프레임레이트. 기본 60fps. */
  fps?: number;
  /** 배속. 0.25×~4×로 클램프. 기본 1×. */
  speed?: number;
  /** 현재 시각(ms). 예: performance.now. */
  now: () => number;
  /** 다음 틱 예약(rAF류). 핸들을 반환. */
  schedule: (cb: () => void) => number;
  /** 예약 취소. */
  cancel: (handle: number) => void;
}

const MIN_SPEED = 0.25;
const MAX_SPEED = 4;
const clampSpeed = (s: number): number => Math.min(MAX_SPEED, Math.max(MIN_SPEED, s));

/**
 * 60fps 기준 어큐뮬레이터로 실경과 시간을 프레임 수로 환산해 `controller.step()`을 호출한다.
 * step은 정수 프레임만 진행하므로 일시정지·재개 지점은 **항상 프레임 경계에 정렬**된다(§6).
 */
export class PlaybackClock {
  readonly #controller: PlaybackController;
  readonly #now: () => number;
  readonly #schedule: (cb: () => void) => number;
  readonly #cancel: (handle: number) => void;
  readonly #fps: number;

  #speed: number;
  #playing = false;
  #handle: number | null = null;
  #lastNow = 0;
  #acc = 0; // 아직 소비되지 않은 소수 프레임 (타이밍 평활)

  constructor(controller: PlaybackController, options: PlaybackClockOptions) {
    this.#controller = controller;
    this.#now = options.now;
    this.#schedule = options.schedule;
    this.#cancel = options.cancel;
    this.#fps = options.fps ?? 60;
    this.#speed = clampSpeed(options.speed ?? 1);
  }

  get playing(): boolean {
    return this.#playing;
  }

  get paused(): boolean {
    return !this.#playing;
  }

  get speed(): number {
    return this.#speed;
  }

  /** 배속 변경(0.25×~4× 클램프). 재생 중에도 안전 — 누적 소수 프레임은 유지된다. */
  setSpeed(speed: number): void {
    this.#speed = clampSpeed(speed);
  }

  play(): void {
    if (this.#playing || this.#controller.ended) return;
    this.#playing = true;
    this.#lastNow = this.#now();
    this.#acc = 0;
    this.#handle = this.#schedule(() => this.#wake());
  }

  pause(): void {
    this.#playing = false;
    if (this.#handle !== null) this.#cancel(this.#handle);
    this.#handle = null;
  }

  #wake(): void {
    if (!this.#playing) return;
    const t = this.#now();
    const elapsed = Math.max(0, t - this.#lastNow);
    this.#lastNow = t;

    this.#acc += (elapsed / 1000) * this.#fps * this.#speed;
    const whole = Math.floor(this.#acc);
    this.#acc -= whole;
    if (whole > 0) this.#controller.step(whole);

    if (this.#controller.ended) {
      this.pause();
      return;
    }
    this.#handle = this.#schedule(() => this.#wake());
  }
}
