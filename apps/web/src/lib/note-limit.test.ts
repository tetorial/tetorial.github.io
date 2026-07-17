import { describe, it, expect } from "vitest";
import { NOTES_LIMITS } from "@tetorial/types";
import {
  countReplayNotes,
  noteLimitReason,
  projectedReplayNoteCount,
  replayLimitViolation,
} from "./note-limit.js";

/** n개의 노트를 가진 노트 파일 흉내(합산은 notes.length만 본다). */
function fileWith(n: number): { notes: unknown[] } {
  return { notes: Array.from({ length: n }, (_, i) => ({ id: `note000${i}` })) };
}

describe("M1d-6 노트 생성 한도 차단", () => {
  it("M1d-6 합산은 모든 notes-*.json의 합이다(자기 파일만이 아님)", () => {
    expect(countReplayNotes([fileWith(3), fileWith(4), fileWith(2)])).toBe(9);
    expect(countReplayNotes([])).toBe(0);
  });

  it("M1d-6 합산이 maxNotesPerReplay 미달이면 차단하지 않는다(정상 진입)", () => {
    const limit = NOTES_LIMITS.maxNotesPerReplay;
    expect(noteLimitReason([fileWith(limit - 1)])).toBeNull();
    expect(noteLimitReason([])).toBeNull();
  });

  it("M1d-6 합산이 한도 도달 시 차단 사유를 반환하고 문구에 한도값을 포함한다", () => {
    const limit = NOTES_LIMITS.maxNotesPerReplay;
    // 단일 파일 도달·여러 파일 합산 도달 모두 차단
    const single = noteLimitReason([fileWith(limit)]);
    const summed = noteLimitReason([fileWith(limit - 2), fileWith(2)]);
    expect(single).not.toBeNull();
    expect(summed).not.toBeNull();
    expect(single).toContain(String(limit)); // 한도값은 상수에서 읽어 문구에 포함
    expect(summed).toContain(String(limit));
  });
});

describe("AW-17 묶음 업로드 합산 사전 검사 (Worker M2E 교차 검사와 정합)", () => {
  /** clientId를 가진 노트 파일 흉내. */
  function ownedFile(clientId: string, n: number): { clientId: string; notes: unknown[] } {
    return { clientId, ...fileWith(n) };
  }
  const MINE = "k3XmP9qLwR2v";

  it("AW-17 합산은 대상 파일을 요청본으로 교체한 뒤 나머지를 더한다", () => {
    const files = [ownedFile(MINE, 4), ownedFile("other1______", 3)];
    // 내 파일의 기존 4개는 세지 않는다 — 요청본(2)이 대체하고 타인 파일(3)만 더한다.
    expect(projectedReplayNoteCount(files, MINE, 2)).toBe(5);
    // 내 파일이 아직 없는 경우
    expect(projectedReplayNoteCount([ownedFile("other1______", 3)], MINE, 2)).toBe(5);
  });

  it("AW-17 한도 이하면 위반 없음(null)", () => {
    const limit = NOTES_LIMITS.maxNotesPerReplay;
    expect(replayLimitViolation([], MINE, limit)).toBeNull();
    expect(replayLimitViolation([ownedFile("other1______", 1)], MINE, limit - 1)).toBeNull();
  });

  it("AW-17 한도 초과 시 위반 내용(한도·실제·문구)을 준다", () => {
    const limit = NOTES_LIMITS.maxNotesPerReplay;
    const v = replayLimitViolation([ownedFile("other1______", 1)], MINE, limit);
    expect(v).not.toBeNull();
    expect(v?.limit).toBe(limit);
    expect(v?.actual).toBe(limit + 1);
    expect(v?.message).toContain(String(limit));
  });

  it("AW-17 이미 한도인 내 파일을 노트 수 그대로 다시 올리면 통과한다(초과 '생성'만 거부)", () => {
    const limit = NOTES_LIMITS.maxNotesPerReplay;
    expect(replayLimitViolation([ownedFile(MINE, limit)], MINE, limit)).toBeNull();
    // 한 개라도 늘리면 거부
    expect(replayLimitViolation([ownedFile(MINE, limit)], MINE, limit + 1)).not.toBeNull();
  });
});
