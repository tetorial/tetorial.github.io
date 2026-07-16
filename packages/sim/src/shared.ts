// sim 내부 공용 유틸.

/** 유니코드 코드포인트 기준 길이 (comment ≤ 500자 검증용 — UTF-16 단위 아님, notes 스키마 §6) */
export function codePointLength(s: string): number {
  return [...s].length;
}
