// 라운드 발췌 (업로드 경로) — 명세 §3.
//
// 재조립은 `raw`의 `replay.rounds`를 필터링하는 방식이며 그 외 필드는 그대로 보존한다.
// 발췌본의 재생 동일성은 실증 완료(스파이크 R-3, RT-3에서 회귀 고정).
import type { ReplayDoc } from "./parse.js";

export interface ExcerptResult {
  json: string; // 재조립된 유효한 ttrm/ttr 텍스트
  rawBytes: number; // json의 UTF-8 바이트 수 (gzip 전. 압축·한도 판단은 호출자)
  roundMap: number[]; // = originalRounds (meta.json에 전달)
}

/** 발췌·용량 계산이 참조하는 원문의 최소 형태 (그 외 필드는 스프레드로 보존). */
type RawReplay = { replay: { rounds?: unknown[] } & Record<string, unknown> } & Record<
  string,
  unknown
>;

const utf8Bytes = (s: string): number => new TextEncoder().encode(s).length;

function assertAscendingUnique(rounds: readonly number[]): void {
  for (let i = 0; i < rounds.length; i++) {
    const v = rounds[i];
    if (v === undefined || !Number.isInteger(v) || v < 0) {
      throw new Error(`excerptRounds: originalRounds는 음이 아닌 정수여야 함 (받음: ${String(v)})`);
    }
    if (i > 0 && v <= (rounds[i - 1] as number)) {
      throw new Error("excerptRounds: originalRounds는 오름차순·중복 없음이어야 함");
    }
  }
}

/**
 * 원본 라운드 번호 목록(`originalRounds`)만 남긴 발췌 ttrm/ttr 텍스트를 재조립한다.
 *
 * - `originalRounds`는 0-base·오름차순·중복 없음. `doc.rounds` 인덱스와 같은 기준이다
 *   (파싱은 원본 순서를 보존하므로 doc 내부 인덱스 = 원본 라운드 번호).
 * - ttr은 발췌 개념이 없다(항상 전체). `originalRounds`가 `[0]`이 아니면 오류.
 */
export function excerptRounds(doc: ReplayDoc, originalRounds: number[]): ExcerptResult {
  assertAscendingUnique(originalRounds);

  if (doc.kind === "ttr") {
    if (originalRounds.length !== 1 || originalRounds[0] !== 0) {
      throw new Error("excerptRounds: ttr은 발췌 불가 — originalRounds는 [0]만 허용");
    }
    const json = JSON.stringify(doc.raw);
    return { json, rawBytes: utf8Bytes(json), roundMap: [0] };
  }

  const raw = doc.raw as RawReplay;
  const rawRounds = raw.replay.rounds ?? [];
  const filtered = originalRounds.map((i) => {
    if (i >= rawRounds.length) {
      throw new Error(`excerptRounds: 라운드 ${i}는 범위를 벗어남 (총 ${rawRounds.length})`);
    }
    return rawRounds[i];
  });

  const reassembled = { ...raw, replay: { ...raw.replay, rounds: filtered } };
  const json = JSON.stringify(reassembled);
  return { json, rawBytes: utf8Bytes(json), roundMap: [...originalRounds] };
}

/**
 * 라운드별 직렬화 바이트(업로드 UI의 용량 표시용).
 * ttrm은 라운드 항목 배열별, ttr은 단판 replay 전체를 하나로 계산한다.
 */
export function roundSizes(doc: ReplayDoc): number[] {
  const raw = doc.raw as RawReplay;
  if (doc.kind === "ttr") {
    return [utf8Bytes(JSON.stringify(raw.replay))];
  }
  const rawRounds = raw.replay.rounds ?? [];
  return rawRounds.map((round) => utf8Bytes(JSON.stringify(round)));
}
