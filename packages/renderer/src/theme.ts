// 기본 테마 + 부분 오버라이드 병합 (명세 §4-3, 수용 기준 RD-7).
import type { Theme } from "./types.js";

/**
 * 기본 테마 1종. 7미노는 가이드라인 표준색, G=회색, D=밝은 회색(G와 구분되는 무채색).
 * 고스트는 반투명 rgba(셀 위 표시 레이어), 하이라이트는 불투명 외곽선 색(RD-8).
 */
export const DEFAULT_THEME: Theme = {
  background: "#101318",
  gridLine: "#20262e",
  cell: {
    I: "#31c7ef", // cyan
    J: "#5a65ad", // blue
    L: "#ef7921", // orange
    O: "#f7d308", // yellow
    S: "#42b642", // green
    T: "#ad4d9c", // purple
    Z: "#ef2029", // red
    G: "#6d6d6d", // 쓰레기 = 회색
    D: "#b6bcc4", // 더미 = 밝은 회색 (G보다 명확히 밝음 — 무채색 구분)
  },
  dummyBorder: "#5b6169", // D·미지 문자 셀의 외곽선 (다른 테두리로 G와 재차 구분)
  ghostFill: "rgba(255, 255, 255, 0.12)",
  ghostStroke: "rgba(255, 255, 255, 0.55)",
  highlight: "#ffffff", // 하이라이트 외곽선 색 — 불투명 흰색 (채움 아님, RD-8)
};

/**
 * 부분 오버라이드를 base 테마 위에 병합한다. cell 맵은 문자 단위로 병합(미지정 문자는 base색 유지),
 * 그 외 스칼라 필드는 지정 시 대체. override 없으면 base의 사본.
 */
export function mergeTheme(base: Theme, override?: Partial<Theme>): Theme {
  if (!override) return { ...base, cell: { ...base.cell } };
  return {
    background: override.background ?? base.background,
    gridLine: override.gridLine ?? base.gridLine,
    cell: { ...base.cell, ...override.cell },
    dummyBorder: override.dummyBorder ?? base.dummyBorder,
    ghostFill: override.ghostFill ?? base.ghostFill,
    ghostStroke: override.ghostStroke ?? base.ghostStroke,
    highlight: override.highlight ?? base.highlight,
  };
}

/** 부분 오버라이드를 기본 테마 위에 병합 (부분 오버라이드 → 기본 테마 폴백, RD-7). */
export function resolveTheme(override?: Partial<Theme>): Theme {
  return mergeTheme(DEFAULT_THEME, override);
}
