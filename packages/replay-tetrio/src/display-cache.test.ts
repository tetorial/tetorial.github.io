// RT-7 displayCache — 구명세 replay-tetrio §9
import { describe, expect, it } from "vitest";
import { extractDisplayCache } from "./display-cache.js";
import { hasTtr, hasTtrm, loadTtrDoc, loadTtrmDoc } from "./testing/fixtures.js";

describe("RT-7 displayCache", () => {
  describe.skipIf(!hasTtrm)("ttrm (fixture — 부재 시 skip)", () => {
    it("players·roundWinners(전부 anon-p1=0)·id null(생략)·formatVersion 19", () => {
      const cache = extractDisplayCache(loadTtrmDoc());
      expect(cache.players).toEqual(["anon-p1", "anon-p2"]);
      expect(cache.roundWinners).toEqual([0, 0, 0]); // 3라운드 모두 anon-p1 생존
      expect(cache.tetrioReplayId).toBeUndefined(); // 로컬 저장본 id=null → 필드 생략
      expect(cache.formatVersion).toBe(19);
      expect(typeof cache.playedAt).toBe("string");
    });
  });

  describe.skipIf(!hasTtr)("ttr (fixture — 부재 시 skip)", () => {
    it("players 1명·roundWinners [null]·id 익명화값·formatVersion 19", () => {
      const cache = extractDisplayCache(loadTtrDoc());
      expect(cache.players).toEqual(["anon-p1"]);
      expect(cache.roundWinners).toEqual([null]); // ttr은 승패 개념 없음
      expect(cache.tetrioReplayId).toBe("000000000000"); // 익명화 치환값
      expect(cache.formatVersion).toBe(19);
    });
  });
});
