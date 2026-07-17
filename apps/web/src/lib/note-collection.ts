// 노트 수집함 + 묶음 업로드 (m3b §2 — AW-15·16·17).
// 수집함은 리플레이(gistId) 단위 **메모리 전용**이다 — localStorage 영속화 없음(소유자 결정 2026-07-17).
// 이탈 보호는 경고만(beforeunload). 업로드 경로는 하나다: 신규 노트도 재편집 노트도 이 수집함을 거쳐
// 하나의 NotesFile로 조립돼 단일 PUT으로 나간다(와이어 포맷·Worker 계약 무변경).
import { assembleNotesFile, NoteLimitError } from "@tetorial/sim";
import type { AuthoringSession, LimitViolation } from "@tetorial/sim";
import type { Note, NotesFile } from "@tetorial/types";
import { replayLimitViolation } from "./note-limit.js";
import type { LoadedNotesFile } from "./notes-loading.js";
import type { Storage } from "./storage.js";
import type { GistIndex, WorkerClient } from "./worker-client.js";

/* ── 수집함(메모리 상태) ───────────────────────────────────────── */

/** 노트를 수집함에 넣는다. 같은 id면 교체(재편집·재완성) — 수집 순서는 유지한다. */
export function collectNote(collected: readonly Note[], note: Note): Note[] {
  const idx = collected.findIndex((n) => n.id === note.id);
  if (idx < 0) return [...collected, note];
  const next = [...collected];
  next[idx] = note;
  return next;
}

/** 수집함에서 노트를 뺀다(업로드 전 취소). */
export function removeCollected(collected: readonly Note[], noteId: string): Note[] {
  return collected.filter((n) => n.id !== noteId);
}

/** 미업로드 수집 노트가 있는가 — 페이지 이탈 경고(beforeunload)의 조건(AW-15). */
export function hasUnuploaded(collected: readonly Note[]): boolean {
  return collected.length > 0;
}

/* ── 노트 확정 ─────────────────────────────────────────────────── */

export type FinishNoteResult =
  | { ok: true; note: Note }
  | { ok: false; code: "limit-exceeded"; violations: LimitViolation[] };

/**
 * "노트 완성" — 저작 세션을 노트로 확정한다(업로드하지 않는다 — AW-15).
 * 노트 **단위** 한도 위반(NoteLimitError)은 이 시점에 보고한다. 합산 한도는 업로드 시점(AW-17).
 */
export function finishNote(session: AuthoringSession): FinishNoteResult {
  try {
    return { ok: true, note: session.toNote() };
  } catch (e) {
    if (e instanceof NoteLimitError) return { ok: false, code: "limit-exceeded", violations: e.violations };
    throw e;
  }
}

/* ── 묶음 조립 ─────────────────────────────────────────────────── */

export type AssembleCollectedResult =
  | { ok: true; file: NotesFile }
  | { ok: false; code: "limit-exceeded"; violations: LimitViolation[] };

/**
 * 수집 노트 전부를 자기 클라이언트 파일 하나로 조립한다(AW-16).
 * sim의 assembleNotesFile은 **단건 upsert**이므로 여기서 순차 체이닝한다 — 앞 결과를 다음 호출의
 * current로 넘겨 노트 id 기준 교체/추가가 누적되게 한다. 중간 한도 위반은 즉시 중단·보고.
 */
export function assembleCollectedFile(args: {
  current: NotesFile | null;
  clientId: string;
  authorName?: string;
  notes: readonly Note[];
}): AssembleCollectedResult {
  let current = args.current;
  for (const note of args.notes) {
    const res = assembleNotesFile({
      current,
      clientId: args.clientId,
      ...(args.authorName ? { author: { name: args.authorName } } : {}),
      upsert: note,
    });
    if (!res.ok) return { ok: false, code: "limit-exceeded", violations: res.violations };
    current = res.file;
  }
  if (current === null) {
    // 노트 0개 + 기존 파일 없음 — 호출자(uploadCollectedNotes)가 empty로 사전 차단한다.
    throw new Error("assembleCollectedFile: 조립할 노트가 없습니다");
  }
  return { ok: true, file: current };
}

/* ── 업로드(단일 PUT) ──────────────────────────────────────────── */

export type UploadCollectedResult =
  | { ok: true; index: GistIndex; file: string; uploaded: NotesFile; editKeyCreated: boolean }
  | { ok: false; code: "empty" }
  | { ok: false; code: "limit-exceeded"; violations: LimitViolation[] };

/**
 * 수집 노트를 파일 하나로 조립해 단일 PUT으로 올린다(AW-16).
 * - 파일 단위 한도는 조립이, 리플레이 합산 한도(AW-17)는 replayLimitViolation이 PUT 전에 차단한다.
 * - editKey는 storage에서 조회/생성(created=true면 UI가 1회 고지 — AW-7).
 * - WorkerError(403 등)는 그대로 throw해 호출자가 errors.toDisplayError로 매핑한다(AW-14).
 */
export async function uploadCollectedNotes(params: {
  worker: WorkerClient;
  storage: Storage;
  gistId: string;
  clientId: string;
  notes: readonly Note[];
  /** 현재 열린 리플레이의 모든 노트 파일 — 자기 파일(재편집 base)과 합산 한도 검사에 쓴다. */
  files: readonly LoadedNotesFile[];
  authorName?: string;
}): Promise<UploadCollectedResult> {
  if (params.notes.length === 0) return { ok: false, code: "empty" };

  const mine = params.files.find((f) => f.clientId === params.clientId);
  const authorName = params.authorName ?? mine?.authorName;
  const assembled = assembleCollectedFile({
    current: mine?.file ?? null,
    clientId: params.clientId,
    ...(authorName ? { authorName } : {}),
    notes: params.notes,
  });
  if (!assembled.ok) return assembled;

  // 합산 한도 사전 검사(AW-17) — Worker의 교차 검사(M2E)와 같은 기준으로 PUT 전에 차단한다.
  const violation = replayLimitViolation(params.files, params.clientId, assembled.file.notes.length);
  if (violation) return { ok: false, code: "limit-exceeded", violations: [violation] };

  const { editKey, created } = params.storage.getOrCreateEditKey(params.gistId);
  const res = await params.worker.putNotes(params.gistId, {
    clientId: params.clientId,
    editKey,
    file: assembled.file,
  });
  return {
    ok: true,
    index: res.index,
    file: res.file,
    uploaded: assembled.file,
    editKeyCreated: created,
  };
}
