// 셀 팔레트·포인터 도구 계산부 (m5-d-web §2~5 — AW-30~33). 그리기 자체는 SimulatorPanel/BoardCanvas —
// 여기는 "무엇을 그릴지·어디에 스냅할지·어느 버튼이 무슨 스트로크인지·스포이드 결과"만 순수 함수로 낸다.
import type { Cell } from "@tetorial/engine";
import type { Tool } from "@tetorial/sim";

/** 팔레트에 실제로 올라가는 셀 값 — 빈 칸("_")은 그리기 대상이 아니다(스포이드 무시 대상, AW-33). */
export type PaletteCell = Exclude<Cell, "_">;

/** 셀 팔레트 항목 목록 — G·D·미노 7종, 이 순서로 노출한다(명세 §2, AW-30). */
export const PALETTE_CELLS: readonly PaletteCell[] = ["G", "D", "I", "J", "L", "O", "S", "T", "Z"];

/** 팔레트 선택값 → 그리기 Tool (AW-30 — `v:"G"` 하드코딩 대신 선택값을 스트로크에 싣는다). */
export function cellToTool(v: PaletteCell): Tool {
  return { kind: "cell", v };
}

/**
 * 호버 위치(CSS px) → 고스트 오버레이 좌상단 CSS px 스냅(명세 §3, AW-31).
 * 격자 원점 정렬만 쓴다 — renderer의 버퍼 행·y 뒤집기 기하는 여기 관여하지 않는다.
 */
export function snapToCellOrigin(
  offsetX: number,
  offsetY: number,
  cellSize: number,
): { left: number; top: number } {
  return {
    left: Math.floor(offsetX / cellSize) * cellSize,
    top: Math.floor(offsetY / cellSize) * cellSize,
  };
}

/**
 * (현재 도구, 눌린 마우스 버튼) → 스트로크로 시작할 Tool(명세 §4, AW-32).
 * button: PointerEvent.button (0=좌, 2=우). 그 외(휠클릭 등)는 스트로크가 아니므로 null.
 * 좌클릭은 현행 도구 동작 불변, 우클릭은 지우기(highlight는 force:"off").
 */
export function strokeToolFor(
  toolKind: Tool["kind"],
  button: number,
  selected: PaletteCell,
): Tool | null {
  if (button === 0) {
    if (toolKind === "cell") return { kind: "cell", v: selected };
    if (toolKind === "erase") return { kind: "erase" };
    return { kind: "highlight" };
  }
  if (button === 2) {
    if (toolKind === "highlight") return { kind: "highlight", force: "off" };
    return { kind: "erase" };
  }
  return null;
}

/** 스포이드 판정 결과 — 무시(null) 또는 팔레트에 반영할 셀 값(명세 §5, AW-33). */
export function eyedropperPick(value: Cell): PaletteCell | null {
  return value === "_" ? null : value;
}

/** 고스트 프리뷰 알파(명세 §3 — 0.4~0.6 범위). */
export const GHOST_ALPHA = 0.5;

/** hex 색(#rrggbb) → rgba() 문자열 — 고스트 프리뷰의 반투명 합성(AW-31). */
export function withAlpha(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
