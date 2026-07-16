// 엔진 공개 타입 — 명세 docs/specs/engine.md §5(룰셋)·§7(API) 자구 전사
import type { PieceType } from "@tetorial/types";

/** 회전 상태 (0=스폰, 1=CW, 2=180, 3=CCW) */
export type Rot = 0 | 1 | 2 | 3;

/** 보드 셀. notes 스키마 행 문자와 동일 ("_"=빈 칸, "G"=쓰레기, "D"=더미 — 물리는 G와 동일) */
export type Cell = "_" | "G" | "D" | PieceType;

/** 보드 절대 좌표 (x: 0=왼쪽, y: 0=최하단) */
export type CellPos = { x: number; y: number };

/** v1 지원 스핀 판정 모드. 이외 tetr.io 모드는 v2 (명세 §10) */
export type SpinBonusMode = "T-spins" | "all-mini+";

export type RulesetConfig = {
  kicks: "SRS" | "SRS+"; // 킥테이블 (데이터는 triangle kicks/data 원본 복제)
  allow180: boolean; // SRS+ 프리셋 기본 true, SRS 기본 false
  spinBonuses: SpinBonusMode;
};

export const PRESETS = {
  srs: { kicks: "SRS", allow180: false, spinBonuses: "T-spins" },
  "srs+": { kicks: "SRS+", allow180: true, spinBonuses: "all-mini+" },
} as const satisfies Record<string, RulesetConfig>;

export type LockInfo = {
  // 전부 라이브 표시(UI 이펙트·카운터 애니메이션) 전용 — 저장되지 않는다
  linesCleared: number;
  spin: "none" | "mini" | "normal";
  counters: { b2b: number; combo: number }; // 적용 후 값 (tetr.io 원값 규약: -1 = 없음, D-9)
  toppedOut: boolean;
  queueExhausted: boolean; // current가 null이 됨
};
