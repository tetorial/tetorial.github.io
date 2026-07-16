// 테스트 전용 fixture 로더 — 런타임 소스가 아니다.
// 커밋된 fixture는 익명화본이다(D-16). 부재 시 테스트는 skip한다(conventions §4).
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseReplay, type ReplayDoc } from "../parse.js";

const FIXTURES_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../fixtures",
);

export const TTRM_PATH = path.join(FIXTURES_DIR, "replay_sample.ttrm");
export const TTR_PATH = path.join(FIXTURES_DIR, "sprint_rep_sample.ttr");
// W4-a 버그2 재현 fixture: seed 1397564605 — 원본 첫 조각이 S/Z/O가 될 수 없어야 하는 시드.
export const SEED_TTR_PATH = path.join(FIXTURES_DIR, "seed_1397564605.ttr");

export const hasTtrm = existsSync(TTRM_PATH);
export const hasTtr = existsSync(TTR_PATH);
export const hasSeedTtr = existsSync(SEED_TTR_PATH);

export function readTtrm(): string {
  return readFileSync(TTRM_PATH, "utf8");
}

export function readTtr(): string {
  return readFileSync(TTR_PATH, "utf8");
}

export function readSeedTtr(): string {
  return readFileSync(SEED_TTR_PATH, "utf8");
}

/** 파싱 성공을 단언하고 ReplayDoc을 반환한다(실패 사유를 테스트 메시지로). */
export function expectDoc(text: string): ReplayDoc {
  const result = parseReplay(text);
  if (!result.ok)
    throw new Error(`parseReplay 실패: ${result.error.code} ${result.error.detail ?? ""}`);
  return result.value;
}

export function loadTtrmDoc(): ReplayDoc {
  return expectDoc(readTtrm());
}

export function loadTtrDoc(): ReplayDoc {
  return expectDoc(readTtr());
}

export function loadSeedTtrDoc(): ReplayDoc {
  return expectDoc(readSeedTtr());
}
