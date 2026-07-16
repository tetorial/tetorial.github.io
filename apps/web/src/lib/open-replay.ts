// 리플레이 열기 오케스트레이션 (로컬 파일 / gist 딥링크 — apps-web §3-A).
// gist는 index → rawUrl 병렬 fetch → gunzip → sha256 대조 → parse 순으로 무결성 게이트를 통과한다.
import { parseReplay } from "@tetorial/replay-tetrio";
import type { ReplayDoc } from "@tetorial/replay-tetrio";
import { metaFileSchema } from "@tetorial/types";
import type { MetaFile, Origin } from "@tetorial/types";
import { gunzipBase64 } from "./compression.js";
import { sha256Hex } from "./integrity.js";
import { loadNotesFiles, type LoadedNotesFile } from "./notes-loading.js";
import type { ErrorInput } from "./errors.js";
import { WorkerError, RawFetchError, type GistIndex, type WorkerClient } from "./worker-client.js";

export interface LoadedReplay {
  doc: ReplayDoc;
  source: "local" | { gistId: string };
  /** doc 내부 라운드 인덱스 → 원본 라운드 번호. 로컬은 항등, gist는 meta.rounds.map. */
  roundMap: number[];
  meta: MetaFile | null;
  notesFiles: LoadedNotesFile[];
}

export type OpenResult = { ok: true; loaded: LoadedReplay } | { ok: false; error: ErrorInput };

/** 로컬 .ttrm/.ttr 텍스트를 연다(업로드 없이 전 기능 사용 — §3-A). roundMap은 항등. */
export function openLocalReplay(text: string): OpenResult {
  const parsed = parseReplay(text);
  if (!parsed.ok) {
    // 파싱 불가 = 형식이 다름 → 손상/형식 문구(§6)
    return { ok: false, error: { source: "integrity" } };
  }
  const doc = parsed.value;
  return {
    ok: true,
    loaded: {
      doc,
      source: "local",
      roundMap: doc.rounds.map((_, i) => i),
      meta: null,
      notesFiles: [],
    },
  };
}

/**
 * gist 딥링크를 연다: GET /g/:id → meta·replay를 rawUrl로 병렬 fetch → 무결성 대조 → parse.
 * roundMap은 항상 meta.rounds.map(라운드 표시는 원본 번호 — §3-A). 노트 파일도 함께 로드.
 */
export async function openGistReplay(gistId: string, worker: WorkerClient): Promise<OpenResult> {
  let index: GistIndex;
  try {
    index = await worker.getIndex(gistId);
  } catch (e) {
    return { ok: false, error: normalizeFetchError(e) };
  }

  const metaFile = index.files.find((f) => f.name === "meta.json");
  const replayFile = index.files.find((f) => /^replay\.(ttrm|ttr)\.gz\.b64$/.test(f.name));
  if (!metaFile || !replayFile) {
    // 서비스 규약 외 gist(Worker가 보통 404 위장하지만 방어적으로) → not-found
    return { ok: false, error: { source: "worker", status: 404, body: { code: "not-found" } } };
  }

  let meta: MetaFile;
  let doc: ReplayDoc;
  try {
    const [metaText, replayBodyB64] = await Promise.all([
      worker.fetchRaw(metaFile.rawUrl),
      worker.fetchRaw(replayFile.rawUrl),
    ]);
    const metaParsed = metaFileSchema.safeParse(JSON.parse(metaText));
    if (!metaParsed.success) return { ok: false, error: { source: "integrity" } };
    meta = metaParsed.data;

    // gunzip 실패 = 손상(§6). base64 디코드 → gunzip → 원문.
    const replayJson = gunzipBase64(replayBodyB64);
    // sha256 대조(불일치 = 손상)
    const digest = await sha256Hex(replayJson);
    if (digest !== meta.replay.sha256) return { ok: false, error: { source: "integrity" } };

    const parsed = parseReplay(replayJson);
    if (!parsed.ok) return { ok: false, error: { source: "integrity" } };
    doc = parsed.value;
  } catch (e) {
    if (e instanceof WorkerError || e instanceof RawFetchError) {
      return { ok: false, error: normalizeFetchError(e) };
    }
    // gunzip/JSON 파싱 예외 등 = 손상
    return { ok: false, error: { source: "integrity" } };
  }

  const notesFiles = await loadNotesFiles(index, (u) => worker.fetchRaw(u)).catch(() => []);

  return {
    ok: true,
    loaded: { doc, source: { gistId }, roundMap: meta.rounds.map, meta, notesFiles },
  };
}

/** doc 내부 라운드 인덱스 → 원본 라운드 번호(표시·origin 기록용 — §3-C). */
export function originalRound(loaded: LoadedReplay, docRoundIndex: number): number {
  return loaded.roundMap[docRoundIndex] ?? docRoundIndex;
}

/** 분기(시뮬레이터 진입) origin 조립 — round는 원본 번호로 기록(origin 스키마 규약). */
export function branchOrigin(
  loaded: LoadedReplay,
  docRoundIndex: number,
  player: number,
  frame: number,
): Extract<Origin, { type: "replay" }> {
  return { type: "replay", round: originalRound(loaded, docRoundIndex), player, frame };
}

function normalizeFetchError(e: unknown): ErrorInput {
  if (e instanceof WorkerError) {
    return { source: "worker", status: e.status, body: e.body, retryAfterMs: e.retryAfterMs };
  }
  if (e instanceof RawFetchError) {
    // rawUrl 비200(리비전 소실 등) → 손상/형식 문구로 통일
    return { source: "integrity" };
  }
  return { source: "network" };
}
