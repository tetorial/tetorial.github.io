// 업로드 조립 + 한도 사전 검증 (순수 함수 — HTTP는 apps/web). 명세 §4·S-6.
import type { Note, NotesFile } from "@tetorial/types";
import { NOTES_LIMITS } from "@tetorial/types";
import { codePointLength } from "./shared.js";

/**
 * 서버가 항상 덮어쓰는 필드의 sentinel(명세 §4, gist-proxy §4-3).
 * sim은 실제 값을 채우지 않되(S-6), 스키마(zod)는 통과해야 하므로(S-7) 형태만 맞춘 placeholder를 넣는다.
 */
export const SERVER_FIELD_SENTINELS = {
  editKeyHash: "0".repeat(64), // sha256 hex 형태(소문자) — Worker가 SHA-256(editKey)로 덮어씀
  timestamp: "1970-01-01T00:00:00.000Z", // ISO UTC 형태 — Worker가 서버 시각으로 덮어씀
} as const;

/** 한도 위반 1건 (사용자 보고용 — 어떤 항목이 초과인지) */
export interface LimitViolation {
  path: string;
  limit: number;
  actual: number;
  message: string;
}

export type AssembleResult =
  | { ok: true; file: NotesFile }
  | { ok: false; code: "limit-exceeded"; violations: LimitViolation[] };

/** toNote()가 한도 위반 시 throw (명세 §3 "초과 시 오류 반환" — QUESTIONS.md Q4) */
export class NoteLimitError extends Error {
  readonly violations: LimitViolation[];
  constructor(violations: LimitViolation[]) {
    super("노트 한도 초과: " + violations.map((v) => v.message).join("; "));
    this.name = "NoteLimitError";
    this.violations = violations;
  }
}

/** 노트 1개의 한도 검증 (pages·comment·queueUsed·board·queue) — notes 스키마 §6 */
export function checkNoteLimits(note: Note, indexLabel = ""): LimitViolation[] {
  const v: LimitViolation[] = [];
  const at = indexLabel ? `${indexLabel}.` : "";
  if (note.pages.length < 1) {
    v.push({ path: `${at}pages`, limit: 1, actual: 0, message: "노트에 페이지가 최소 1개 필요" });
  }
  if (note.pages.length > NOTES_LIMITS.maxPages) {
    v.push({
      path: `${at}pages`,
      limit: NOTES_LIMITS.maxPages,
      actual: note.pages.length,
      message: `노트당 페이지 ${NOTES_LIMITS.maxPages}개 초과 (${note.pages.length})`,
    });
  }
  if (note.snapshot.queue.length > NOTES_LIMITS.maxQueueLength) {
    v.push({
      path: `${at}snapshot.queue`,
      limit: NOTES_LIMITS.maxQueueLength,
      actual: note.snapshot.queue.length,
      message: `queue 길이 ${NOTES_LIMITS.maxQueueLength} 초과 (${note.snapshot.queue.length})`,
    });
  }
  note.pages.forEach((p, i) => {
    if (p.comment !== undefined) {
      const len = codePointLength(p.comment);
      if (len > NOTES_LIMITS.maxCommentCodePoints) {
        v.push({
          path: `${at}pages[${i}].comment`,
          limit: NOTES_LIMITS.maxCommentCodePoints,
          actual: len,
          message: `주석 ${NOTES_LIMITS.maxCommentCodePoints}자 초과 (${len})`,
        });
      }
    }
    if (p.state.board.rows.length > NOTES_LIMITS.maxBoardRows) {
      v.push({
        path: `${at}pages[${i}].state.board.rows`,
        limit: NOTES_LIMITS.maxBoardRows,
        actual: p.state.board.rows.length,
        message: `보드 행 ${NOTES_LIMITS.maxBoardRows} 초과 (${p.state.board.rows.length})`,
      });
    }
    if (p.state.queueUsed > note.snapshot.queue.length) {
      v.push({
        path: `${at}pages[${i}].state.queueUsed`,
        limit: note.snapshot.queue.length,
        actual: p.state.queueUsed,
        message: `queueUsed(${p.state.queueUsed})가 queue 길이(${note.snapshot.queue.length}) 초과`,
      });
    }
  });
  return v;
}

/** 파일 전체 한도 검증 (notes 개수 + 각 노트) */
export function checkFileLimits(file: NotesFile): LimitViolation[] {
  const v: LimitViolation[] = [];
  if (file.notes.length > NOTES_LIMITS.maxNotes) {
    v.push({
      path: "notes",
      limit: NOTES_LIMITS.maxNotes,
      actual: file.notes.length,
      message: `파일당 노트 ${NOTES_LIMITS.maxNotes}개 초과 (${file.notes.length})`,
    });
  }
  file.notes.forEach((n, i) => v.push(...checkNoteLimits(n, `notes[${i}]`)));
  return v;
}

/**
 * 기존 파일(없으면 null) + upsert 노트 → NotesFile 조립.
 * note.id 기준 교체(있으면) 또는 추가(없으면). 한도 초과 시 업로드 전 차단(limit-exceeded).
 * editKeyHash·createdAt·updatedAt 등 서버 우선 필드는 sentinel만(명세 §4).
 */
export function assembleNotesFile(args: {
  current: NotesFile | null;
  clientId: string;
  author?: { name?: string };
  upsert: Note;
}): AssembleResult {
  const notes = args.current ? [...args.current.notes] : [];
  const idx = notes.findIndex((n) => n.id === args.upsert.id);
  if (idx >= 0) notes[idx] = args.upsert;
  else notes.push(args.upsert);

  const author = args.author ?? args.current?.author;
  const file: NotesFile = {
    schema: "tetorial.notes/1",
    clientId: args.clientId,
    editKeyHash: SERVER_FIELD_SENTINELS.editKeyHash,
    ...(author !== undefined ? { author } : {}),
    createdAt: SERVER_FIELD_SENTINELS.timestamp,
    updatedAt: SERVER_FIELD_SENTINELS.timestamp,
    notes,
  };

  const violations = checkFileLimits(file);
  if (violations.length > 0) return { ok: false, code: "limit-exceeded", violations };
  return { ok: true, file };
}
