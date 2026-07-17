// RT-1 파싱 — 구명세 replay-tetrio §9
import { describe, expect, it } from "vitest";
import { parseReplay } from "./parse.js";
import { hasTtr, hasTtrm, loadTtrDoc, loadTtrmDoc } from "./testing/fixtures.js";

/** W4-a 버그1 재현용 합성 ttrm 라운드 항목. */
function synthEntry(id: string, username: string, alive: boolean) {
  return { id, username, alive, replay: { options: { seed: 1 }, events: [] } };
}

describe("RT-1 파싱", () => {
  describe("3종 ParseError 경로", () => {
    it("invalid-json — JSON 파싱 실패", () => {
      const r = parseReplay("{ not json");
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("invalid-json");
    });

    it("unknown-structure — replay 필드 부재", () => {
      const r = parseReplay(JSON.stringify({ id: "x", users: [] }));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("unknown-structure");
    });

    it("unknown-structure — rounds/events 모두 부재", () => {
      const r = parseReplay(JSON.stringify({ replay: { leaderboard: [] } }));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("unknown-structure");
    });

    it("empty-rounds — 빈 rounds 배열", () => {
      const r = parseReplay(JSON.stringify({ replay: { rounds: [] } }));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("empty-rounds");
    });

    it("empty-rounds — 플레이어 없는 라운드", () => {
      const r = parseReplay(JSON.stringify({ replay: { rounds: [[]] } }));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("empty-rounds");
    });
  });

  describe.skipIf(!hasTtrm)("ttrm (fixture — 부재 시 skip)", () => {
    it("파싱 성공 · [라운드][플레이어] 구조 보존", () => {
      const doc = loadTtrmDoc();
      expect(doc.kind).toBe("ttrm");
      expect(doc.rounds.length).toBeGreaterThan(0);
      for (const round of doc.rounds) {
        expect(round.length).toBeGreaterThan(0);
        for (const entry of round) {
          expect(typeof entry.options.seed).toBe("number");
          expect(Array.isArray(entry.events)).toBe(true);
        }
      }
      // raw는 원문 보존 (발췌 재조립용)
      expect(doc.raw).toBeTypeOf("object");
    });
  });

  // W4-a 버그1: 실물 ttrm의 replay.rounds는 라운드별 리더보드(승자 우선) 순으로 저장된다.
  // 파서는 이를 top-level users[] 순서로 정규화해 doc.rounds[r][p]가 라운드와 무관하게
  // 같은 보드(플레이어)를 가리키게 한다 — origin.player·displayCache.players와 인덱스 정합
  // (meta 명세 §2, replay-tetrio §8). 기존 fixture는 anon-p1 전승이라 위치와 승패가
  // 우연히 일치해 이 결함을 못 잡았으므로, 승자 교대 매치를 합성해 근거 필드(userId)로 검증한다.
  describe("W4-a 버그1 — 라운드 항목을 users[] 순서로 정규화", () => {
    it("승자 교대 매치: 모든 라운드에서 doc.rounds[r][p].userId === info.users[p].id", () => {
      const users = [
        { id: "U-A", username: "alice" },
        { id: "U-B", username: "bob" },
      ];
      const raw = {
        id: null,
        gamemode: "versus",
        ts: "2026-01-01T00:00:00Z",
        users,
        replay: {
          leaderboard: [],
          rounds: [
            // 라운드0: A 승 → 승자 우선 [A, B]
            [synthEntry("U-A", "alice", true), synthEntry("U-B", "bob", false)],
            // 라운드1: B 승 → 승자 우선 [B, A] (위치 인덱스가 라운드0과 뒤집힌다)
            [synthEntry("U-B", "bob", true), synthEntry("U-A", "alice", false)],
          ],
        },
      };
      const r = parseReplay(JSON.stringify(raw));
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const doc = r.value;
      // 정규화 후: 두 라운드 모두 [A(=users[0]), B(=users[1])] 순 — 위치 인덱스가 보드 기준으로 고정
      doc.rounds.forEach((round, ri) => {
        round.forEach((entry, p) => {
          expect(entry.userId, `round ${ri} player ${p}`).toBe(doc.info.users[p]?.id);
        });
      });
      // 승자(alive)의 위치 인덱스도 보드 기준: 라운드0=0(A), 라운드1=1(B)
      expect(doc.rounds[0]?.findIndex((e) => e.alive === true)).toBe(0);
      expect(doc.rounds[1]?.findIndex((e) => e.alive === true)).toBe(1);
    });
  });

  describe.skipIf(!hasTtrm)("W4-a 버그1 fixture 매핑 근거 필드 (부재 시 skip)", () => {
    it("모든 라운드에서 doc.rounds[r][p].userId === info.users[p].id (전승 fixture에서도 근거 검증)", () => {
      const doc = loadTtrmDoc();
      doc.rounds.forEach((round, ri) => {
        round.forEach((entry, p) => {
          expect(entry.userId, `round ${ri} player ${p}`).toBe(doc.info.users[p]?.id);
        });
      });
    });
  });

  describe.skipIf(!hasTtr)("ttr 1×1 정규화 (fixture — 부재 시 skip)", () => {
    it("단판을 1라운드 × 1플레이어로 정규화 · alive=null", () => {
      const doc = loadTtrDoc();
      expect(doc.kind).toBe("ttr");
      expect(doc.rounds.length).toBe(1);
      expect(doc.rounds[0]?.length).toBe(1);
      expect(doc.rounds[0]?.[0]?.alive).toBeNull();
      expect(doc.rounds[0]?.[0]?.events.length).toBeGreaterThan(0);
    });
  });
});
