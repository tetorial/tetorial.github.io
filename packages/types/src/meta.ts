// 리플레이 메타데이터(meta.json) 스키마 — 구명세 meta-schema §2(타입)·§3(필드 규약) 자구 전사
import { z } from "zod";
import { codePointLength, isoUtcSchema, sha256HexSchema } from "./shared.js";

// ---------------------------------------------------------------------------
// TS 타입 (명세 §2 표기 그대로)
// ---------------------------------------------------------------------------

export type MetaFile = {
  schema: "tetorial.meta/1";
  createdAt: string; // ISO 8601 UTC. Worker가 서버 시각으로 기록

  /** 업로더가 붙이는 표시 정보 (비인증 자유 텍스트) */
  title?: string; // ≤ 100자. Gist description에도 미러링됨 (§4)
  description?: string; // ≤ 1000자
  uploader?: { name?: string }; // 닉네임. 인증 아님 — notes의 author와 동일 취급

  /** 리플레이 본문 정보 */
  replay: {
    platform: "tetrio"; // v1은 tetrio 고정. 확장 대비 필드
    format: "ttrm" | "ttr"; // ttrm = 1vs1(멀티라운드), ttr = 솔로
    file: string; // Gist 내 파일명. 예: "replay.ttrm.gz.b64"
    encoding: "gzip+base64"; // v1 고정
    bytes: number; // 저장 대상 원문(발췌 후, 압축 전) 크기
    sha256: string; // 저장 대상 원문(발췌 후, 압축 전)의 SHA-256 hex. 무결성 검증용
  };

  /** 라운드 발췌 정보 */
  rounds: {
    totalInOriginal: number; // 원본 리플레이의 전체 라운드 수. ttr은 1
    map: number[]; // 파일 내부 인덱스 → 원본 라운드 번호(0-base). 오름차순·중복 불가
  };

  /** 표시 캐시 (선택). UI 표시 전용 — 게임 로직의 근거로 사용 금지 (§3) */
  displayCache?: {
    players?: string[]; // 플레이어 이름. 인덱스 = notes의 origin.player와 대응
    playedAt?: string; // 리플레이에 기록된 경기 시각 (ISO 8601)
    tetrioReplayId?: string; // tetr.io 원본 리플레이 ID (역링크용)
    roundWinners?: (number | null)[]; // rounds.map과 같은 길이. 승자 player 인덱스
    formatVersion?: number | null; // 리플레이 포맷 버전 (options.version, 실측 샘플 = 19)
  };
};

// ---------------------------------------------------------------------------
// zod 검증기 (§3 + Worker 검증 규칙 §5-1의 한도)
// ---------------------------------------------------------------------------

/** meta 스키마 한도 (§5). maxReplayBodyBytes(base64 기준)는 Worker의 요청 크기 검사 몫 */
export const META_LIMITS = {
  maxTitleCodePoints: 100,
  maxDescriptionCodePoints: 1000,
  maxReplayBodyBytes: 800_000,
} as const;

const roundsSchema = z
  .object({
    totalInOriginal: z.number().int().positive(),
    map: z.array(z.number().int().nonnegative()).min(1), // 1개 이상 다중 선택 (D-7)
  })
  // §3: map은 오름차순·중복 불가, 값의 범위는 [0, totalInOriginal)
  .refine((r) => r.map.every((v, i) => i === 0 || v > (r.map[i - 1] ?? Number.NaN)), {
    message: "rounds.map은 오름차순이며 중복 불가",
    path: ["map"],
  })
  .refine((r) => r.map.every((v) => v < r.totalInOriginal), {
    message: "rounds.map 값의 범위는 [0, totalInOriginal)",
    path: ["map"],
  });

const displayCacheSchema = z.object({
  players: z.array(z.string()).optional(),
  playedAt: z.iso.datetime({ offset: true }).optional(), // §2: UTC 강제 없음(ISO 8601)
  tetrioReplayId: z.string().optional(),
  roundWinners: z.array(z.number().int().nonnegative().nullable()).optional(),
  formatVersion: z.number().int().nullable().optional(),
});

/** meta.json 루트 검증기 */
export const metaFileSchema = z
  .object({
    schema: z.literal("tetorial.meta/1"),
    createdAt: isoUtcSchema,
    title: z
      .string()
      .refine(
        (s) => codePointLength(s) <= META_LIMITS.maxTitleCodePoints,
        "title은 100자 이하(유니코드 코드포인트 기준)",
      )
      .optional(),
    description: z
      .string()
      .refine(
        (s) => codePointLength(s) <= META_LIMITS.maxDescriptionCodePoints,
        "description은 1000자 이하(유니코드 코드포인트 기준)",
      )
      .optional(),
    uploader: z.object({ name: z.string().optional() }).optional(),
    replay: z.object({
      platform: z.literal("tetrio"),
      format: z.enum(["ttrm", "ttr"]),
      file: z.string().min(1),
      encoding: z.literal("gzip+base64"),
      bytes: z.number().int().nonnegative(),
      sha256: sha256HexSchema,
    }),
    rounds: roundsSchema,
    displayCache: displayCacheSchema.optional(),
  })
  // §2: roundWinners는 rounds.map과 같은 길이
  .refine(
    (m) =>
      m.displayCache?.roundWinners === undefined ||
      m.displayCache.roundWinners.length === m.rounds.map.length,
    {
      message: "displayCache.roundWinners는 rounds.map과 같은 길이여야 한다",
      path: ["displayCache", "roundWinners"],
    },
  )
  // §5-1: ttr(솔로)은 라운드가 항상 1개
  .refine((m) => m.replay.format !== "ttr" || m.rounds.totalInOriginal === 1, {
    message: 'format "ttr"은 rounds.totalInOriginal이 1이어야 한다',
    path: ["rounds", "totalInOriginal"],
  });
