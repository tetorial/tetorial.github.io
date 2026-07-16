// 업로드 조립 (로컬 → 공유, apps-web §3-B). 라운드 발췌 → MetaFile 조립 → gzip+base64.
// sha256·bytes는 발췌 후·압축 전 원문 기준(meta 스키마 §3). createdAt은 Worker가 덮어쓴다(§4-3).
import { excerptRounds, roundSizes, extractDisplayCache } from "@tetorial/replay-tetrio";
import type { ReplayDoc } from "@tetorial/replay-tetrio";
import { metaFileSchema, META_LIMITS } from "@tetorial/types";
import type { MetaFile } from "@tetorial/types";
import { gzipBase64 } from "./compression.js";
import { replayIntegrity } from "./integrity.js";

/** 서버가 덮어쓰는 createdAt의 sentinel(형태만 맞춘 ISO UTC — gist-proxy §4-3). */
const SERVER_TIMESTAMP_SENTINEL = "1970-01-01T00:00:00.000Z";

/** 업로드 용량 사전 경고 임계치(base64 replay body 기준 — meta §5 maxReplayBodyBytes). */
export const UPLOAD_WARN_BYTES = META_LIMITS.maxReplayBodyBytes; // 800_000

export interface UploadSizeEstimate {
  perRoundRawBytes: number[]; // 라운드별 직렬화 바이트(발췌 전 원문 — roundSizes)
  selectedRawBytes: number; // 선택 라운드 발췌 원문 바이트
  replayBodyBytes: number; // 실제 gzip+base64 후 바이트(업로드 본문 크기)
  overWarn: boolean; // 임계치 초과(사전 경고)
}

/** 기본 선택 = 전체 라운드(0-base 오름차순). ttr은 [0]. */
export function allRoundIndices(doc: ReplayDoc): number[] {
  return doc.rounds.map((_, i) => i);
}

/**
 * 선택 라운드의 업로드 용량을 계산한다(라운드 다중 선택 UI의 용량 표시·사전 경고 — §3-B).
 * 실제 gzip+base64를 수행해 정확한 본문 크기를 준다.
 */
export function estimateUploadSize(doc: ReplayDoc, selectedRounds: number[]): UploadSizeEstimate {
  const perRoundRawBytes = roundSizes(doc);
  const excerpt = excerptRounds(doc, [...selectedRounds].sort((a, b) => a - b));
  const replayBody = gzipBase64(excerpt.json);
  const replayBodyBytes = new TextEncoder().encode(replayBody).length;
  return {
    perRoundRawBytes,
    selectedRawBytes: excerpt.rawBytes,
    replayBodyBytes,
    overWarn: replayBodyBytes > UPLOAD_WARN_BYTES,
  };
}

export interface BuildUploadInput {
  doc: ReplayDoc;
  selectedRounds: number[]; // 원본 라운드 번호(0-base). doc 내부 인덱스와 동일 기준
  title?: string;
  description?: string;
  nickname?: string;
}

export interface UploadPayload {
  meta: MetaFile;
  replayBody: string; // gzip+base64
  roundMap: number[];
}

/**
 * MetaFile + replayBody를 조립한다(POST /g 요청 본문). displayCache.roundWinners는 발췌한
 * 라운드에 맞춰 재색인한다(meta 스키마 §2 — roundWinners 길이 = rounds.map 길이).
 */
export async function buildUploadPayload(input: BuildUploadInput): Promise<UploadPayload> {
  const { doc } = input;
  const selected = [...input.selectedRounds].sort((a, b) => a - b);
  const excerpt = excerptRounds(doc, selected);
  const { sha256, bytes } = await replayIntegrity(excerpt.json);
  const replayBody = gzipBase64(excerpt.json);

  const format = doc.kind; // "ttrm" | "ttr"
  const fullCache = extractDisplayCache(doc);
  // 발췌 라운드에 맞춰 roundWinners 재색인(전체 → 선택). 그 외 필드(players 등)는 그대로.
  const roundWinners = fullCache.roundWinners
    ? selected.map((r) => fullCache.roundWinners?.[r] ?? null)
    : undefined;
  const displayCache = { ...fullCache, ...(roundWinners ? { roundWinners } : {}) };

  const meta: MetaFile = {
    schema: "tetorial.meta/1",
    createdAt: SERVER_TIMESTAMP_SENTINEL,
    ...(input.title ? { title: input.title } : {}),
    ...(input.description ? { description: input.description } : {}),
    ...(input.nickname ? { uploader: { name: input.nickname } } : {}),
    replay: {
      platform: "tetrio",
      format,
      file: `replay.${format}.gz.b64`,
      encoding: "gzip+base64",
      bytes,
      sha256,
    },
    rounds: {
      totalInOriginal: format === "ttr" ? 1 : doc.rounds.length,
      map: excerpt.roundMap,
    },
    displayCache,
  };

  // 조립 산출물을 스키마로 자기검증(정화 + 조립 버그 조기 차단). Worker도 재검증한다.
  const parsed = metaFileSchema.safeParse(meta);
  if (!parsed.success) {
    throw new Error(`meta 조립 검증 실패: ${JSON.stringify(parsed.error.issues)}`);
  }
  return { meta: parsed.data, replayBody, roundMap: excerpt.roundMap };
}
