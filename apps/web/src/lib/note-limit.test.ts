import { describe, it, expect } from "vitest";
import { NOTES_LIMITS } from "@tetorial/types";
import { countReplayNotes, noteLimitReason } from "./note-limit.js";

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
