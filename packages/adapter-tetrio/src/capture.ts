// triangle(@haelp/teto) 엔진 상태 → notes Snapshot 변환 — docs/specs/adapter-tetrio.md v1
// 모든 매핑 값은 2026-07-10 스파이크 실측 확정본(명세 §3·§4)이다. 임의 변경 금지.
import type { Engine, Tile } from "@haelp/teto/engine";
import { NOTES_LIMITS, type PieceType, type Snapshot } from "@tetorial/types";

/** 재생 중인 triangle 엔진 (@haelp/teto v4.2.7). 프레임 경계(tick 완료 직후) 상태만 유효한 캡처 대상 (§5-1) */
export type TriangleEngine = Engine;

/**
 * ttrm/ttr 라운드 항목의 `replay.options` 중 어댑터가 소비하는 부분.
 * 구조적 타이핑 — 호출자(replay-tetrio)는 파싱한 options 객체를 그대로 전달하면 된다.
 */
export type TetrioRoundOptions = {
  kickset?: string; // 생략 시 "SRS+" (스파이크 §3 청사진 폴백)
  spinbonuses?: string; // 생략 시 "all-mini+"
  allow180?: boolean; // 생략 시 true
  boardwidth?: number; // 존재하며 10이 아니면 분기 차단 (§5-5)
  boardheight?: number; // 존재하며 20이 아니면 분기 차단 (§5-5)
};

export type CaptureWarning =
  | { type: "spin-mode-substituted"; from: string; to: "all-mini+" }
  | { type: "pending-garbage-dropped"; lines: number };

export type CaptureResult =
  | {
      ok: true;
      snapshot: Snapshot; // notes 스키마 §4의 Snapshot
      warnings: CaptureWarning[];
      pendingGarbage: number; // 분기 시점에 수신 대기 중이던(미적용) 쓰레기 줄 수 — UI 고지용
    }
  | { ok: false; reason: "unsupported-kickset" | "unsupported-board" | "topped-out" };

/** D-8: 노트 생성 시 큐 유한 사전 파생 권장 길이. NOTES_LIMITS.maxQueueLength(1000) 이내 */
const QUEUE_DERIVE_LENGTH = 200;

/** 엔진 명세 §2 PRESETS의 allow180 기본값 — 방 설정이 이와 다를 때만 Snapshot에 기록 (§3) */
const PRESET_ALLOW180 = { srs: false, "srs+": true } as const;

/** v1 지원 스핀 판정 모드 (§3). 그 외는 "all-mini+" 대체 + 경고 (§5-2, D-10 비대칭 정책) */
const SUPPORTED_SPIN_BONUSES = new Set(["T-spins", "all-mini+"]);

/** 미노 심볼(triangle 소문자) → notes 문자. "gb"는 셀 전용이라 별도 처리 */
const PIECE_CHAR: Readonly<Record<string, PieceType>> = {
  i: "I",
  j: "J",
  l: "L",
  o: "O",
  s: "S",
  t: "T",
  z: "Z",
};

const EMPTY_ROW = "_".repeat(NOTES_LIMITS.boardWidth);

function pieceChar(mino: string): PieceType {
  const ch = PIECE_CHAR[mino];
  if (ch === undefined) {
    // current/hold/queue에는 7미노만 올 수 있다 — 위반은 triangle 실측 전제가 깨진 것
    throw new Error(
      `adapter-tetrio: 미노가 아닌 심볼 "${mino}" — @haelp/teto 실측 전제 재검증 필요`,
    );
  }
  return ch;
}

/** 셀 매핑 (§4): null → "_", gb → "G", 7미노 → 대문자, 미지 심볼 → "G" 강등 + 콘솔 경고 */
function cellChar(tile: Tile | undefined, warned: Set<string>): string {
  if (tile === null || tile === undefined) return "_";
  if (tile.mino === "gb") return "G";
  const ch = PIECE_CHAR[tile.mino];
  if (ch !== undefined) return ch;
  if (!warned.has(tile.mino)) {
    warned.add(tile.mino);
    // 전방 호환(봄 블록 등 특수 셀 대비) — 물리적으로 G와 동일 취급하고 알림만 남긴다
    console.warn(`adapter-tetrio: 미지의 셀 심볼 "${tile.mino}" → "G"로 강등 (명세 §4)`);
  }
  return "G";
}

/** 보드 변환 (§3·§4): 행 방향 동일(둘 다 [0]=최하단), 상단 전부-빈 행 트림. connections는 폐기 */
function convertBoard(state: readonly (readonly Tile[])[]): Snapshot["board"] {
  const warned = new Set<string>();
  const rows = state.map((row) => {
    let encoded = "";
    for (let x = 0; x < NOTES_LIMITS.boardWidth; x++) encoded += cellChar(row[x], warned);
    return encoded;
  });
  while (rows.length > 0 && rows[rows.length - 1] === EMPTY_ROW) rows.pop();
  return { width: NOTES_LIMITS.boardWidth, rows };
}

/**
 * 리플레이 재생 중 시뮬레이터 진입 시점에 triangle 엔진 상태를 notes Snapshot으로 변환한다.
 *
 * - 단방향(triangle → notes)이며 역변환은 존재하지 않는다 (§1).
 * - 차단 사유가 겹치면 unsupported-kickset → unsupported-board → topped-out 순으로 보고한다.
 * - 부작용: 큐 파생을 위해 `engine.queue.minLength`를 200으로 올린다(시드 bag 자동 리필,
 *   스파이크 §2 확정 절차). 큐 내용의 앞부분은 불변이므로 이후 재생에는 영향이 없다.
 */
export function captureSnapshot(
  engine: TriangleEngine,
  roundOptions: TetrioRoundOptions,
): CaptureResult {
  // §3: kickset → preset. SRS-X 등 그 외 킥셋은 조작 가능성이 달라지므로 차단 (D-10)
  const kickset = roundOptions.kickset ?? "SRS+";
  const preset = kickset === "SRS+" ? "srs+" : kickset === "SRS" ? "srs" : null;
  if (preset === null) return { ok: false, reason: "unsupported-kickset" };

  // §5-5: 비표준 보드 크기 방은 차단 — 청사진 board 옵션 교차 대입 진위 미검증(스파이크 R-1)
  if (
    (roundOptions.boardwidth !== undefined && roundOptions.boardwidth !== 10) ||
    (roundOptions.boardheight !== undefined && roundOptions.boardheight !== 20)
  ) {
    return { ok: false, reason: "unsupported-board" };
  }

  // §5-4: 탑아웃 상태에서는 분기 불가 (직전 프레임까지는 가능)
  if (engine.toppedOut) return { ok: false, reason: "topped-out" };

  const warnings: CaptureWarning[] = [];

  // §3·§5-2: 스핀 모드 — 표시만 달라지는 룰이므로 차단 대신 "all-mini+" 대체 + 경고
  const rawSpinBonuses = roundOptions.spinbonuses ?? "all-mini+";
  let spinBonuses = rawSpinBonuses;
  if (!SUPPORTED_SPIN_BONUSES.has(rawSpinBonuses)) {
    spinBonuses = "all-mini+";
    warnings.push({ type: "spin-mode-substituted", from: rawSpinBonuses, to: "all-mini+" });
  }

  // §3: allow180 — 프리셋 기본과 같으면 필드 생략, 다르면 기록
  const allow180 = roundOptions.allow180 ?? true;
  const ruleset: Snapshot["ruleset"] = { preset, spinBonuses };
  if (allow180 !== PRESET_ALLOW180[preset]) ruleset.allow180 = allow180;

  // §3: 큐 — minLength 200 설정으로 시드 bag 자동 리필 후 앞 200개 (current 미포함)
  engine.queue.minLength = QUEUE_DERIVE_LENGTH;
  const queue = engine.queue
    .slice(0, QUEUE_DERIVE_LENGTH)
    .map((mino) => pieceChar(mino))
    .join("");

  // §5-3: 수신 대기 중(미적용) 쓰레기는 의도적으로 제외하고 줄 수만 보고
  const pendingGarbage = engine.garbageQueue.size;
  if (pendingGarbage > 0) {
    warnings.push({ type: "pending-garbage-dropped", lines: pendingGarbage });
  }

  const snapshot: Snapshot = {
    ruleset,
    board: convertBoard(engine.board.state),
    current: pieceChar(engine.falling.symbol),
    hold: engine.held === null ? null : pieceChar(engine.held), // 프로퍼티명은 held (§3 함정)
    holdLocked: engine.holdLocked,
    queue,
    counters: { b2b: engine.stats.b2b, combo: engine.stats.combo }, // D-9: 원값 그대로 (-1 = 없음)
  };

  return { ok: true, snapshot, warnings, pendingGarbage };
}
