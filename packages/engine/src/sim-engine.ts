// SimEngine — 명세 docs/specs/engine.md §6(상태 모델)·§7(API)·§8(스핀·클리어·카운터)
// 완전 결정론: 같은 입력 → 같은 출력. 랜덤·시각 API 사용 금지 (명세 §3).
import type { PageState, PieceType, Snapshot } from "@tetorial/types";
import { clearFullRows, isLegal, parseBoard, serializeBoard } from "./board.js";
import { isTSpinKick, tryRotate } from "./kicks.js";
import { pieceCells, spawnState } from "./piece.js";
import { detectSpin } from "./spin.js";
import type { Spin } from "./spin.js";
import { PRESETS } from "./types.js";
import type { Cell, CellPos, LockInfo, Rot, RulesetConfig, SpinBonusMode } from "./types.js";

const PIECE_TYPES: readonly PieceType[] = ["I", "J", "L", "O", "S", "T", "Z"];

function isPieceType(ch: string): ch is PieceType {
  return (PIECE_TYPES as readonly string[]).includes(ch);
}

/** 스냅샷 룰셋 → 엔진 룰셋. v1 지원 밖 spinBonuses는 명시적으로 거부 (D-10 차단 정책) */
function resolveRuleset(ruleset: Snapshot["ruleset"]): RulesetConfig {
  const preset = PRESETS[ruleset.preset];
  const spinBonuses = ruleset.spinBonuses ?? preset.spinBonuses;
  if (spinBonuses !== "T-spins" && spinBonuses !== "all-mini+") {
    throw new Error(
      `미지원 spinBonuses: "${spinBonuses}" — v1은 "T-spins"·"all-mini+"만 지원 (엔진 명세 §5)`,
    );
  }
  return {
    kicks: preset.kicks,
    allow180: ruleset.allow180 ?? preset.allow180,
    spinBonuses: spinBonuses satisfies SpinBonusMode,
  };
}

function parseQueue(queue: string): PieceType[] {
  const pieces: PieceType[] = [];
  for (const ch of queue) {
    if (!isPieceType(ch)) throw new Error(`queue의 미노 문자 불일치: "${ch}"`);
    pieces.push(ch);
  }
  return pieces;
}

type Session = { type: PieceType; x: number; y: number; rot: Rot };

export class SimEngine {
  readonly #ruleset: RulesetConfig;
  readonly #board: Cell[][];
  /** snapshot.queue 원본 (불변) — 남은 큐 = #masterQueue.slice(#queueUsed) */
  readonly #masterQueue: readonly PieceType[];
  #queueUsed: number;
  #session: Session | null;
  #hold: PieceType | null;
  #holdLocked: boolean;
  #counters: { b2b: number; combo: number };
  /** 스핀 상태의 수명 (부록 §4): 회전 성공 시 기록, 위치 변경 조작 성공 시 초기화 */
  #lastSpin: Spin | null;

  private constructor(
    ruleset: RulesetConfig,
    board: Cell[][],
    masterQueue: readonly PieceType[],
    queueUsed: number,
    current: PieceType | null,
    hold: PieceType | null,
    holdLocked: boolean,
    counters: { b2b: number; combo: number },
  ) {
    this.#ruleset = ruleset;
    this.#board = board;
    this.#masterQueue = masterQueue;
    this.#queueUsed = queueUsed;
    this.#session = current === null ? null : this.#spawn(current);
    this.#hold = hold;
    this.#holdLocked = holdLocked;
    this.#counters = { b2b: counters.b2b, combo: counters.combo };
    this.#lastSpin = null;
  }

  /** 노트 진입: 스냅샷으로 초기화 */
  static fromSnapshot(snapshot: Snapshot): SimEngine {
    return new SimEngine(
      resolveRuleset(snapshot.ruleset),
      parseBoard(snapshot.board),
      parseQueue(snapshot.queue),
      0,
      snapshot.current,
      snapshot.hold,
      snapshot.holdLocked,
      snapshot.counters,
    );
  }

  /** 페이지에서 재개: 스냅샷(큐 원본·룰셋 공급) + 페이지 상태 (notes 스키마 §4 규범 정의) */
  static fromPageState(snapshot: Snapshot, page: PageState): SimEngine {
    const masterQueue = parseQueue(snapshot.queue);
    if (page.queueUsed > masterQueue.length || page.queueUsed < 0) {
      throw new Error(
        `queueUsed(${page.queueUsed})가 snapshot.queue 길이(${masterQueue.length})를 벗어남`,
      );
    }
    return new SimEngine(
      resolveRuleset(snapshot.ruleset),
      parseBoard(page.board),
      masterQueue,
      page.queueUsed,
      page.current,
      page.hold,
      page.holdLocked,
      page.counters,
    );
  }

  /* ── 관측 ─────────────────────────────────────────────── */

  get boardView(): Readonly<Cell[][]> {
    return this.#board.map((row) => [...row]);
  }

  get currentPiece(): { type: PieceType; x: number; y: number; rot: Rot; cells: CellPos[] } | null {
    const s = this.#session;
    if (s === null) return null;
    return { type: s.type, x: s.x, y: s.y, rot: s.rot, cells: this.#cellsOf(s) };
  }

  get holdView(): { piece: PieceType | null; locked: boolean } {
    return { piece: this.#hold, locked: this.#holdLocked };
  }

  /** 남은 큐 미리보기 (원본 순서 그대로 — 표시 개수는 소비자가 slice) */
  get nextView(): PieceType[] {
    return this.#masterQueue.slice(this.#queueUsed);
  }

  /** 하드드롭 착지 미리보기 (렌더링용) */
  ghostCells(): CellPos[] | null {
    const s = this.#session;
    if (s === null) return null;
    return this.#cellsOf({ ...s, y: this.#floorY(s) });
  }

  /* ── 원자 조작 (입력 레이어가 호출) — 반환: 상태가 변했으면 true ── */

  /** 좌우 1칸 */
  move(dir: -1 | 1): boolean {
    const s = this.#session;
    if (s === null) return false;
    if (!isLegal(this.#board, this.#cellsOf({ ...s, x: s.x + dir }))) return false;
    s.x += dir;
    this.#lastSpin = null; // 위치 변경 성공 → 스핀 소멸 (부록 §4)
    return true;
  }

  /** 벽까지 (ARR 0 대응) */
  moveToWall(dir: -1 | 1): boolean {
    let moved = false;
    while (this.move(dir)) moved = true;
    return moved;
  }

  /** 아래로 1칸 (SDF 유한값 대응, 중간 높이 정지 가능) */
  moveDown(): boolean {
    const s = this.#session;
    if (s === null) return false;
    if (!isLegal(this.#board, this.#cellsOf({ ...s, y: s.y - 1 }))) return false;
    s.y -= 1;
    this.#lastSpin = null;
    return true;
  }

  /** 바닥까지 (SDF ∞ 대응). 락 아님 — 이후에도 조작 가능 */
  softDropToFloor(): boolean {
    const s = this.#session;
    if (s === null) return false;
    const floor = this.#floorY(s);
    if (floor === s.y) return false;
    s.y = floor;
    this.#lastSpin = null;
    return true;
  }

  /** 킥테이블 적용 회전. allow180=false면 "180"은 항상 false */
  rotate(dir: "cw" | "ccw" | "180"): boolean {
    const s = this.#session;
    if (s === null) return false;
    if (dir === "180" && !this.#ruleset.allow180) return false;
    const amount = dir === "cw" ? 1 : dir === "ccw" ? 3 : 2;
    const to = ((s.rot + amount) % 4) as Rot;
    const res = tryRotate(this.#board, this.#ruleset.kicks, s.type, s.rot, to, s.x, s.y);
    if (res === null) return false;
    s.x = res.x;
    s.y = res.y;
    s.rot = to;
    // 회전 성공 직후 스핀 판정해 기록 (부록 §4)
    this.#lastSpin = detectSpin(
      this.#board,
      this.#ruleset.kicks,
      this.#ruleset.spinBonuses,
      s.type,
      s.rot,
      s.x,
      s.y,
      isTSpinKick(res),
    );
    return true;
  }

  /** 홀드 교환. holdLocked거나 조작 중 미노가 없으면 false */
  swapHold(): boolean {
    const s = this.#session;
    if (s === null || this.#holdLocked) return false;
    if (this.#hold === null) {
      // 첫 사용: 현재 미노를 보관하고 큐에서 1개 소비 (E-6 queueUsed 산술)
      this.#hold = s.type;
      this.#session = this.#takeFromQueue();
    } else {
      const saved = this.#hold;
      this.#hold = s.type;
      this.#session = this.#spawn(saved);
    }
    this.#holdLocked = true;
    // 주: triangle은 홀드 교환에서 lastSpin을 초기화하지 않는다 — 동일하게 유지 (E-4 대조 준거)
    return true;
  }

  /* ── 락 (배치 확정) ───────────────────────────────────── */

  /** 바닥까지 내리고 즉시 락 */
  hardDrop(): LockInfo {
    this.softDropToFloor();
    return this.lock();
  }

  /** 현 위치에서 락 (접지 상태가 아니면 하강 후 락) */
  lock(): LockInfo {
    const s = this.#session;
    if (s === null) throw new Error("락 불가: 조작 중 미노가 없다 (큐 소진)");
    if (!isLegal(this.#board, this.#cellsOf(s))) {
      // setCells로 스폰 위치가 점유된 상태 (§7) — 사용자가 조작·지우개로 해소할 때까지 거부
      throw new Error("락 불가: 미노가 기존 셀과 겹쳐 있다 (overlap)");
    }
    this.softDropToFloor();
    for (const c of this.#cellsOf(s)) {
      const row = this.#board[c.y];
      if (row) row[c.x] = s.type;
    }
    const spin = this.#lastSpin ?? "none";
    const linesCleared = clearFullRows(this.#board);
    // 카운터 갱신 (부록 §6 — D-9 원값 규약)
    if (linesCleared > 0) {
      this.#counters.combo++;
      if (spin !== "none" || linesCleared >= 4) this.#counters.b2b++;
      else this.#counters.b2b = -1;
    } else {
      this.#counters.combo = -1;
    }
    this.#holdLocked = false;
    this.#session = this.#takeFromQueue();
    this.#lastSpin = null;
    const toppedOut = this.#session !== null && !isLegal(this.#board, this.#cellsOf(this.#session));
    return {
      linesCleared,
      spin,
      counters: { ...this.#counters },
      toppedOut,
      queueExhausted: this.#session === null,
    };
  }

  /* ── 셀 그리기 (자유 편집) ─────────────────────────────── */

  /**
   * 보드 직접 수정. 큐·홀드·카운터 불변, 라인 클리어 유발 없음 (§7).
   * "D"는 물리적으로 "G"와 동일 취급(점유 판정이 "_" 외 전부 점유이므로 자동 성립).
   * 조작 중 미노와 겹치는 셀을 그리면 미노를 스폰 위치로 조용히 리셋한다.
   */
  setCells(cells: { x: number; y: number; v: Cell }[]): void {
    for (const c of cells) {
      const row = this.#board[c.y];
      if (c.x < 0 || c.x >= (row?.length ?? 0) || !row) {
        throw new RangeError(`setCells 좌표 범위 밖: (${c.x}, ${c.y})`);
      }
      row[c.x] = c.v;
    }
    const s = this.#session;
    if (s !== null && !isLegal(this.#board, this.#cellsOf(s))) {
      this.#session = this.#spawn(s.type);
      this.#lastSpin = null;
      // 스폰 위치마저 점유면 겹친 채 유지 — lock()이 overlap 사유로 거부한다 (§7)
    }
  }

  /* ── 체크포인트 ──────────────────────────────────────── */

  /** "페이지 추가"가 호출. 조작 중 미노의 위치는 포함하지 않는다 (명세 §6) */
  capturePageState(): PageState {
    return {
      board: serializeBoard(this.#board),
      current: this.#session?.type ?? null,
      hold: this.#hold,
      holdLocked: this.#holdLocked,
      queueUsed: this.#queueUsed,
      counters: { ...this.#counters },
    };
  }

  /* ── 내부 ───────────────────────────────────────────── */

  #cellsOf(s: Session): CellPos[] {
    return pieceCells(this.#ruleset.kicks, s.type, s.rot, s.x, s.y);
  }

  /** 하드드롭 착지 y (현 위치가 이미 불법이면 제자리) */
  #floorY(s: Session): number {
    let y = s.y;
    while (isLegal(this.#board, this.#cellsOf({ ...s, y: y - 1 }))) y--;
    return y;
  }

  #spawn(type: PieceType): Session {
    const { x, y, rot } = spawnState(this.#ruleset.kicks, type);
    return { type, x, y, rot };
  }

  /** 큐에서 다음 미노 소비. 소진이면 null (current = null) */
  #takeFromQueue(): Session | null {
    const next = this.#masterQueue[this.#queueUsed];
    if (next === undefined) return null;
    this.#queueUsed++;
    return this.#spawn(next);
  }
}
