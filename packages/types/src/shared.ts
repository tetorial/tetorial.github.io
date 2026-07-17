// notes·meta 스키마가 공유하는 기본 요소 (docs/specs/notes-schema.md §4·§6, meta-schema.md §2)
import { z } from "zod";

/** SHA-256 hex 64자 (crypto.subtle 관례에 따라 소문자 — QUESTIONS.md 참조) */
export const sha256HexSchema = z
  .string()
  .regex(/^[0-9a-f]{64}$/, "SHA-256 hex 64자(소문자)여야 한다");

/** ISO 8601 UTC (Z 필수) */
export const isoUtcSchema = z.iso.datetime();

/** 유니코드 코드포인트 기준 길이 (comment ≤ 500자 등 — UTF-16 단위 아님) */
export function codePointLength(s: string): number {
  return [...s].length;
}

/**
 * 보드 논리 셀 좌표 — 전 모듈 공통 규약: x 0(왼쪽)→오른쪽, y 0(최하단)→위.
 * engine·renderer·replay-tetrio에 3중 정의돼 있던 것을 승격 (#12, M2C-1).
 */
export type CellPos = { x: number; y: number };
