import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { metaFileSchema, type MetaFile } from "./index.js";

// meta-schema.md §8 전체 예시 자구 그대로 (2026-07-11 명세 개정으로 공식화 — QUESTIONS.md 3번 해소)
const representativeJson = `{
  "schema": "tetorial.meta/1",
  "createdAt": "2026-07-10T05:00:00Z",
  "title": "FT3 복기용",
  "description": "7라운드 중 2·5라운드 발췌",
  "uploader": { "name": "corun" },
  "replay": {
    "platform": "tetrio",
    "format": "ttrm",
    "file": "replay.ttrm.gz.b64",
    "encoding": "gzip+base64",
    "bytes": 152340,
    "sha256": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"
  },
  "rounds": {
    "totalInOriginal": 7,
    "map": [2, 5]
  },
  "displayCache": {
    "players": ["corun", "opponent"],
    "playedAt": "2026-07-09T14:22:31Z",
    "tetrioReplayId": "6870f00dcafe1234deadbeef",
    "roundWinners": [0, null],
    "formatVersion": 19
  }
}`;

function validMeta(): MetaFile {
  return metaFileSchema.parse(JSON.parse(representativeJson));
}

function checkMutated(mutate: (meta: MetaFile) => void): boolean {
  const meta = structuredClone(validMeta());
  mutate(meta);
  return metaFileSchema.safeParse(meta).success;
}

// 타입 레벨 검증: 손 선언 타입(명세 §2 자구)과 zod 추론 타입의 상호 할당성
type MutualExtends<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const metaTypeMatches: MutualExtends<MetaFile, z.infer<typeof metaFileSchema>> = true;

describe("W0b-1 공식 예시 JSON 왕복 (meta-schema §8)", () => {
  it("공식 예시 JSON이 그대로 파싱 통과한다", () => {
    expect(metaFileSchema.safeParse(JSON.parse(representativeJson)).success).toBe(true);
  });

  it("파싱 결과가 입력과 deep-equal (왕복 무손실)", () => {
    const input: unknown = JSON.parse(representativeJson);
    expect(metaFileSchema.parse(input)).toEqual(input);
  });

  it("displayCache 없는 최소 형태도 통과한다 (선택 필드)", () => {
    expect(
      checkMutated((m) => {
        delete m.title;
        delete m.description;
        delete m.uploader;
        delete m.displayCache;
      }),
    ).toBe(true);
  });

  it("TS 타입과 zod 추론 타입이 상호 할당 가능하다", () => {
    expect(metaTypeMatches).toBe(true);
  });
});

describe("W0b-2 한도 경계 매트릭스 (meta-schema §3·§5-1)", () => {
  it("title 100 코드포인트 통과 / 101 거부", () => {
    expect(checkMutated((m) => void (m.title = "😀".repeat(100)))).toBe(true);
    expect(checkMutated((m) => void (m.title = "😀".repeat(101)))).toBe(false);
  });

  it("description 1000 코드포인트 통과 / 1001 거부", () => {
    expect(checkMutated((m) => void (m.description = "가".repeat(1000)))).toBe(true);
    expect(checkMutated((m) => void (m.description = "가".repeat(1001)))).toBe(false);
  });

  it("rounds.map: 오름차순·중복 없음·범위 [0, totalInOriginal) — 위반 각각 거부", () => {
    const setRounds = (totalInOriginal: number, map: number[]) => (m: MetaFile) => {
      m.rounds = { totalInOriginal, map };
      delete m.displayCache; // roundWinners 길이 결합 제거
    };
    expect(checkMutated(setRounds(7, [0, 1, 2, 3, 4, 5, 6]))).toBe(true); // 전체 업로드
    expect(checkMutated(setRounds(7, [5, 2]))).toBe(false); // 역순
    expect(checkMutated(setRounds(7, [2, 2]))).toBe(false); // 중복
    expect(checkMutated(setRounds(7, [7]))).toBe(false); // 범위 밖 (== total)
    expect(checkMutated(setRounds(7, [-1, 2]))).toBe(false); // 음수
    expect(checkMutated(setRounds(7, []))).toBe(false); // 1개 이상 (D-7)
    expect(checkMutated(setRounds(1, [0]))).toBe(true); // ttr 전형
    expect(checkMutated(setRounds(0, [0]))).toBe(false); // totalInOriginal ≥ 1
  });

  it("roundWinners는 rounds.map과 같은 길이 (§2) — 불일치 거부, null 승자 허용", () => {
    const setWinners = (winners: (number | null)[]) => (m: MetaFile) => {
      m.displayCache = { roundWinners: winners };
    };
    expect(checkMutated(setWinners([1, null]))).toBe(true); // map 길이 2와 일치
    expect(checkMutated(setWinners([0]))).toBe(false);
    expect(checkMutated(setWinners([0, 1, 0]))).toBe(false);
  });

  it("replay 고정 리터럴·형식: platform/encoding/format/sha256/bytes", () => {
    expect(checkMutated((m) => void ((m.replay as { platform: string }).platform = "jstris"))).toBe(
      false,
    );
    expect(checkMutated((m) => void ((m.replay as { encoding: string }).encoding = "base64"))).toBe(
      false,
    );
    expect(checkMutated((m) => void ((m.replay as { format: string }).format = "ttrx"))).toBe(
      false,
    );
    expect(checkMutated((m) => void (m.replay.sha256 = "9F".repeat(32)))).toBe(false); // 대문자
    expect(checkMutated((m) => void (m.replay.sha256 = "9f".repeat(31)))).toBe(false); // 62자
    expect(checkMutated((m) => void (m.replay.bytes = -1))).toBe(false);
    expect(checkMutated((m) => void (m.replay.bytes = 1.5))).toBe(false);
    expect(checkMutated((m) => void (m.replay.file = ""))).toBe(false);
  });

  it('format "ttr" ⇒ totalInOriginal === 1 교차 검증 (§5-1, 2026-07-11 규칙 승격)', () => {
    const setTtr = (totalInOriginal: number, map: number[]) => (m: MetaFile) => {
      m.replay.format = "ttr";
      m.rounds = { totalInOriginal, map };
      delete m.displayCache; // roundWinners 길이 결합 제거
    };
    expect(checkMutated(setTtr(1, [0]))).toBe(true); // ttr 전형
    expect(checkMutated(setTtr(7, [2, 5]))).toBe(false); // ttr인데 멀티라운드
    expect(checkMutated((m) => void (m.replay.format = "ttrm"))).toBe(true); // ttrm은 무제약
  });

  it("createdAt은 UTC(Z) 필수, displayCache.playedAt은 오프셋 표기 허용 (ISO 8601)", () => {
    expect(checkMutated((m) => void (m.createdAt = "2026-07-10T05:00:00+09:00"))).toBe(false);
    expect(
      checkMutated((m) => {
        m.displayCache = { playedAt: "2026-07-09T23:22:31+09:00" };
      }),
    ).toBe(true);
    expect(
      checkMutated((m) => {
        m.displayCache = { playedAt: "지난주" };
      }),
    ).toBe(false);
  });

  it("formatVersion은 number | null (실측 샘플 = 19, 로컬 저장본 null)", () => {
    expect(
      checkMutated((m) => {
        m.displayCache = { formatVersion: null };
      }),
    ).toBe(true);
    expect(
      checkMutated((m) => {
        m.displayCache = { formatVersion: 19.5 };
      }),
    ).toBe(false);
  });
});
