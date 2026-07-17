// RT-5 지원성 보고 — 구명세 replay-tetrio §9
import { describe, expect, it } from "vitest";
import type { TetrioRoundOptions } from "./convert.js";
import type { RoundEntry } from "./parse.js";
import { supportReport } from "./support.js";
import { hasTtrm, loadTtrmDoc } from "./testing/fixtures.js";

function entryWith(options: Partial<TetrioRoundOptions>): RoundEntry {
  return {
    userId: "u",
    username: "anon",
    alive: null,
    options: { seed: 1, ...options },
    events: [],
    stats: null,
  };
}

describe("RT-5 지원성 보고", () => {
  describe("kickset 상태", () => {
    it("SRS+/SRS/생략 → ok, 그 외 → unsupported", () => {
      expect(supportReport(entryWith({ kickset: "SRS+" })).branch.kickset).toBe("ok");
      expect(supportReport(entryWith({ kickset: "SRS" })).branch.kickset).toBe("ok");
      expect(supportReport(entryWith({})).branch.kickset).toBe("ok"); // 생략 → "SRS+" 폴백
      expect(supportReport(entryWith({ kickset: "SRS-X" })).branch.kickset).toBe("unsupported");
    });
  });

  describe("board 상태", () => {
    it("기본/10·20 → ok, 비표준 → unsupported", () => {
      expect(supportReport(entryWith({})).branch.board).toBe("ok");
      expect(supportReport(entryWith({ boardwidth: 10, boardheight: 20 })).branch.board).toBe("ok");
      expect(supportReport(entryWith({ boardwidth: 12 })).branch.board).toBe("unsupported");
      expect(supportReport(entryWith({ boardheight: 10 })).branch.board).toBe("unsupported");
    });
  });

  describe("spin 상태", () => {
    it("지원 모드 → ok, 미지원 → will-substitute (차단 아님)", () => {
      expect(supportReport(entryWith({ spinbonuses: "all-mini+" })).branch.spin).toBe("ok");
      expect(supportReport(entryWith({ spinbonuses: "T-spins" })).branch.spin).toBe("ok");
      expect(supportReport(entryWith({})).branch.spin).toBe("ok"); // 생략 → "all-mini+"
      expect(supportReport(entryWith({ spinbonuses: "all-spin" })).branch.spin).toBe(
        "will-substitute",
      );
      expect(supportReport(entryWith({ spinbonuses: "none" })).branch.spin).toBe("will-substitute");
    });
  });

  it("playback은 항상 ok, formatVersion은 options.version", () => {
    const r = supportReport(entryWith({ version: 19 }));
    expect(r.playback).toBe("ok");
    expect(r.formatVersion).toBe(19);
    expect(supportReport(entryWith({})).formatVersion).toBeNull();
  });

  describe.skipIf(!hasTtrm)("실물 라운드 (fixture — 부재 시 skip)", () => {
    it("기본 보드·SRS+·all-mini+ 라운드는 전부 ok, formatVersion 19", () => {
      const entry = loadTtrmDoc().rounds[0]?.[0];
      expect(entry).toBeDefined();
      if (!entry) return;
      const r = supportReport(entry);
      expect(r.branch).toEqual({ kickset: "ok", board: "ok", spin: "ok" });
      expect(r.formatVersion).toBe(19);
    });
  });
});
