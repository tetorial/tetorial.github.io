// 재생 컨트롤러 (결정론 코어 — 시간 없음) — 명세 §5.
//
// triangle 엔진을 프레임 단위로 구동하고, 키프레임 캐시로 임의 프레임 탐색(seek)을 지원한다.
// 시계(실시간 셸)는 clock.ts로 분리한다(§6). 이 파일은 무시간 코어다 — Date를 읽지 않는다.
import { Engine } from "@haelp/teto/engine";
import type { EngineSnapshot } from "@haelp/teto/engine";
import { captureSnapshot, type CaptureResult } from "@tetorial/adapter-tetrio";
import type { BoardRows, PieceType } from "@tetorial/types";
import { toBoardRows, pieceChar } from "./board-view.js";
import { convert, splitFrames, type TetrioFrame, type TetrioRoundOptions } from "./convert.js";
import type { ReplayDoc } from "./parse.js";

/** 논리 셀 좌표. x 0(좌)→9(우), y 0(최하단)→위 (전 모듈 공통 규약, renderer.CellPos와 동형). */
export type CellPos = { x: number; y: number };

/** 렌더러가 매 프레임 소비하는 상태 뷰 (§5). */
export interface PlaybackView {
  board: BoardRows; // renderer가 소비하는 표준 보드 뷰 (@tetorial/types BoardRows)
  falling: { type: PieceType; cells: CellPos[] } | null; // 재생 중엔 실좌표 노출 (애니메이션용)
  next: PieceType[];
  hold: { piece: PieceType | null; locked: boolean };
  stats: { b2b: number; combo: number; pieces: number; lines: number }; // tetr.io 원값 규약
  pendingGarbage: number;
}

/** 이펙트 이벤트 종류 (renderer·UI 효과용, 로직 근거로 사용 금지 — §5). */
export type PlaybackEffect = "lock" | "clear" | "end";

export interface PlaybackController {
  readonly frame: number;
  readonly totalFrames: number;
  readonly ended: boolean; // 이벤트 소진 또는 toppedOut

  /* 탐색 (모두 결정론·동기) */
  step(frames?: number): void; // 앞으로 n프레임 (기본 1)
  seek(frame: number): void; // 임의 프레임으로. 뒤로 = 키프레임 복원 후 전진 (§5-2)

  /* 렌더링용 상태 뷰 (매 프레임 유효) */
  readonly view: PlaybackView;

  /* 이펙트 이벤트 */
  on(event: PlaybackEffect, cb: (info: unknown) => void): () => void;

  /* 분기 */
  captureBranch(): CaptureResult; // adapter.captureSnapshot 위임. 프레임 경계 보장은 컨트롤러 담당
}

/** 키프레임 간격·개수 기본값 (§5-2). 초과 시 간격 자동 2배 확장. */
const DEFAULT_KEYFRAME_INTERVAL = 300;
const DEFAULT_KEYFRAME_CAP = 120;

/** tetr.io 규칙: 게임의 첫 조각은 S/Z/O가 될 수 없다 (triangle Bag7은 이를 적용하지 않음). */
const FIRST_PIECE_DISALLOWED = new Set(["s", "z", "o"]);

/**
 * 재생 컨트롤러 구현체.
 *
 * `createPlayback`이 반환하는 공개 표면은 `PlaybackController` 인터페이스뿐이다.
 * 이 클래스가 추가로 노출하는 멤버(`engine` getter 등)는 in-package 테스트 전용이며
 * index.ts로 export되지 않는다(공개 API는 index.ts만 — conventions §2).
 */
export class TetrioPlayback implements PlaybackController {
  readonly #roundOptions: TetrioRoundOptions;
  readonly #opponents: number[];
  readonly #frames: TetrioFrame[][];
  readonly #totalFrames: number;

  #engine: Engine;
  #frame = 0;
  #ended = false;
  #endEmitted = false;

  /** frame → EngineSnapshot. 전진 재생 중 #interval 배수 프레임에서 캐시(§5-2). */
  readonly #keyframes = new Map<number, EngineSnapshot>();
  #interval = DEFAULT_KEYFRAME_INTERVAL;
  readonly #cap = DEFAULT_KEYFRAME_CAP;

  /** step()에서만 true — seek의 조용한 재생 중에는 이펙트 이벤트를 억제한다. */
  #emitEffects = false;
  readonly #listeners: Record<PlaybackEffect, Set<(info: unknown) => void>> = {
    lock: new Set(),
    clear: new Set(),
    end: new Set(),
  };

  constructor(doc: ReplayDoc, target: { round: number; player: number }) {
    const round = doc.rounds[target.round];
    const entry = round?.[target.player];
    if (round === undefined || entry === undefined) {
      throw new Error(
        `createPlayback: (round ${target.round}, player ${target.player}) 항목 없음 ` +
          `(라운드 ${doc.rounds.length}개)`,
      );
    }
    this.#roundOptions = entry.options;
    // 라운드 내 다른 플레이어들의 gameid — multiplayer/ige 재생에 필요
    this.#opponents = round
      .filter((r) => r !== entry)
      .map((r) => r.options.gameid)
      .filter((id): id is number => id !== undefined);
    this.#frames = splitFrames(entry.events);
    this.#totalFrames = this.#frames.length;
    this.#engine = this.#createEngine();
    this.#refreshEnded();
  }

  // --- 공개 표면 (PlaybackController) ---

  get frame(): number {
    return this.#frame;
  }

  get totalFrames(): number {
    return this.#totalFrames;
  }

  get ended(): boolean {
    return this.#ended;
  }

  step(frames = 1): void {
    if (frames <= 0) return;
    this.#advance(frames, true);
  }

  seek(frame: number): void {
    const target = Math.max(0, Math.min(frame, this.#totalFrames));
    if (target === this.#frame) return;

    if (target > this.#frame) {
      // 전진: 그대로 재생 (조용히 — 스크럽은 이펙트 없음)
      this.#advance(target - this.#frame, false);
      return;
    }

    // 후진: target 이하 최근접 키프레임 복원 후 전진. 없으면 엔진 재생성 후 0부터.
    const kf = this.#nearestKeyframe(target);
    if (kf !== null) {
      this.#engine.fromSnapshot(this.#keyframes.get(kf) as EngineSnapshot);
      this.#frame = this.#engine.frame;
    } else {
      this.#engine = this.#createEngine();
      this.#frame = 0;
    }
    this.#refreshEnded();
    if (target > this.#frame) this.#advance(target - this.#frame, false);
    else this.#refreshEnded();
  }

  get view(): PlaybackView {
    const e = this.#engine;
    const falling = e.toppedOut
      ? null
      : {
          type: pieceChar(e.falling.symbol),
          cells: e.falling.absoluteBlocks.map(([x, y]) => ({ x, y })),
        };
    return {
      board: toBoardRows(e.board.state),
      falling,
      next: [...e.queue].map((mino) => pieceChar(mino)),
      hold: { piece: e.held === null ? null : pieceChar(e.held), locked: e.holdLocked },
      stats: {
        b2b: e.stats.b2b,
        combo: e.stats.combo,
        pieces: e.stats.pieces,
        lines: e.stats.lines,
      },
      pendingGarbage: e.garbageQueue.size,
    };
  }

  on(event: PlaybackEffect, cb: (info: unknown) => void): () => void {
    this.#listeners[event].add(cb);
    return () => {
      this.#listeners[event].delete(cb);
    };
  }

  captureBranch(): CaptureResult {
    // 컨트롤러는 항상 프레임 경계(정수 frame)에 있으므로 어댑터 §5-1 전제가 충족된다.
    return captureSnapshot(this.#engine, this.#roundOptions);
  }

  // --- in-package 테스트 전용 (index.ts 비노출) ---

  /** RT-4에서 engine.snapshot() 등가성 대조에 쓴다. */
  get engine(): Engine {
    return this.#engine;
  }

  /** RT-4의 "키프레임 무효화 후 재생성 경로"를 강제하기 위한 테스트 전용 훅. */
  invalidateKeyframes(): void {
    this.#keyframes.clear();
    this.#interval = DEFAULT_KEYFRAME_INTERVAL;
  }

  // --- 내부 ---

  #createEngine(): Engine {
    const engine = new Engine(convert(this.#roundOptions, this.#opponents));
    this.#applyFirstPieceRule(engine);
    engine.events.on("falling.lock", (res) => {
      if (!this.#emitEffects) return;
      this.#emit("lock", res);
      if (res.lines > 0) this.#emit("clear", res);
    });
    return engine;
  }

  /**
   * tetr.io 첫 조각 규칙(S/Z/O 금지) 적용 — W4-a 버그2.
   *
   * 라운드 옵션 `no_szo`가 true인 방(실측: 솔로 40L 등)은 게임 첫 조각이 S/Z/O가 되지
   * 않도록 tetr.io가 첫 백의 선두 불가 조각을 뒤로 돌린다. triangle의 Bag7은 이 옵션을
   * 읽지 않고 첫 백을 시드 그대로 셔플하므로, 재현하지 않으면 첫 조각이 S/Z/O인 리플레이가
   * 원본과 어긋난다 (실측: seed 1397564605, no_szo=true → ZIOLSTJ로 재생돼 조기 topout,
   * 40L 미완). `no_szo`가 없거나 false인 방(versus 등)은 원본이 S/Z/O 첫 조각을 그대로
   * 쓰므로 교정하지 않는다 — ttrm 라운드는 이 경로에 들어오지 않는다.
   *
   * 이미 큐에 뽑힌 첫 백(falling + 큐 앞 6개)만 재배열하므로 그 밖의 RNG 상태는 건드리지
   * 않는다 — 이후 백은 그대로 정확하다. frame 0(게임 시작)에서만 동작한다.
   */
  #applyFirstPieceRule(engine: Engine): void {
    if (this.#roundOptions.no_szo !== true) return;
    if (engine.frame !== 0) return;
    const first = engine.falling?.symbol;
    if (first === undefined || !FIRST_PIECE_DISALLOWED.has(first)) return;

    // 첫 백 = [falling, 큐 앞 6개] 7개. 선두 불가 조각을 첫 백 끝으로 회전.
    const firstBag = [first, ...[...engine.queue].slice(0, 6)];
    for (let head = firstBag[0]; head !== undefined && FIRST_PIECE_DISALLOWED.has(head); ) {
      firstBag.shift();
      firstBag.push(head);
      head = firstBag[0];
    }
    const [newFalling, ...newFirstSix] = firstBag;
    if (newFalling === undefined) return; // 방어 (회전 후에도 7개 유지)

    engine.queue.splice(0, 6, ...newFirstSix); // 큐 앞 6개 교체 (이후 조각·내부 RNG 불변)
    engine.initiatePiece(newFalling);
  }

  #advance(n: number, emit: boolean): void {
    const prev = this.#emitEffects;
    this.#emitEffects = emit;
    try {
      for (let i = 0; i < n; i++) {
        if (!this.#tickOne()) break;
      }
    } finally {
      this.#emitEffects = prev;
    }
  }

  #tickOne(): boolean {
    if (this.#frame >= this.#totalFrames || this.#engine.toppedOut) {
      this.#refreshEnded();
      return false;
    }
    this.#engine.tick(this.#frames[this.#frame] ?? []);
    this.#frame = this.#engine.frame; // engine.frame이 진실 (tick이 1 증가)
    this.#maybeCaptureKeyframe();
    this.#refreshEnded();
    return true;
  }

  #maybeCaptureKeyframe(): void {
    if (
      this.#frame > 0 &&
      this.#frame % this.#interval === 0 &&
      !this.#keyframes.has(this.#frame)
    ) {
      this.#keyframes.set(this.#frame, this.#engine.snapshot());
      if (this.#keyframes.size > this.#cap) this.#thinKeyframes();
    }
  }

  /** 상한 초과 시 간격을 2배로 넓히고 새 간격의 배수가 아닌 키프레임을 버린다(§5-2). */
  #thinKeyframes(): void {
    this.#interval *= 2;
    for (const f of [...this.#keyframes.keys()]) {
      if (f % this.#interval !== 0) this.#keyframes.delete(f);
    }
  }

  #nearestKeyframe(frame: number): number | null {
    let best: number | null = null;
    for (const f of this.#keyframes.keys()) {
      if (f <= frame && (best === null || f > best)) best = f;
    }
    return best;
  }

  #refreshEnded(): void {
    const ended = this.#frame >= this.#totalFrames || this.#engine.toppedOut;
    if (ended && !this.#ended && this.#emitEffects && !this.#endEmitted) {
      this.#endEmitted = true;
      this.#emit("end", undefined);
    }
    if (!ended) this.#endEmitted = false;
    this.#ended = ended;
  }

  #emit(event: PlaybackEffect, info: unknown): void {
    for (const cb of this.#listeners[event]) cb(info);
  }
}

/**
 * 리플레이 문서의 한 (round, player)를 재생하는 컨트롤러를 만든다.
 * `round`는 **doc 내부 인덱스**다 — 원본 라운드 번호와의 변환(roundMap)은 호출자 책임(§5).
 */
export function createPlayback(
  doc: ReplayDoc,
  target: { round: number; player: number },
): PlaybackController {
  return new TetrioPlayback(doc, target);
}
