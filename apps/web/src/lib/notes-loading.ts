// 노트 파일 로딩·사이드바 평탄화·딥링크 후보 해석 (apps-web §3-D·§3-E, AW-4·AW-10).
// gist index의 notes-*.json을 rawUrl로 병렬 fetch·검증하고, 노트 단위로 평탄화한다.
import { notesFileSchema } from "@tetorial/types";
import type { NotesFile, Note, Origin } from "@tetorial/types";
import type { GistIndex } from "./worker-client.js";

/** 한 노트 파일 참조(markers.NoteFileRef와 호환 형태 + 원본 파일 보관). */
export interface LoadedNotesFile {
  clientId: string;
  authorName?: string;
  notes: Note[];
  file: NotesFile; // 재편집·업로드 조립 시 current로 사용
}

const NOTES_FILENAME_RE = /^notes-([A-Za-z0-9_-]{12})\.json$/;

/** notes 파일 텍스트를 검증 파싱한다. 유효하지 않으면 null(손상 파일은 조용히 건너뛴다). */
export function parseNotesFile(text: string): NotesFile | null {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const parsed = notesFileSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

/**
 * gist index에서 notes-<clientId>.json 파일을 모두 rawUrl로 병렬 fetch·검증한다.
 * rawUrl은 응답 값을 그대로 사용한다(손조립 금지 — gist-proxy §3).
 */
export async function loadNotesFiles(
  index: GistIndex,
  fetchRaw: (rawUrl: string) => Promise<string>,
): Promise<LoadedNotesFile[]> {
  const targets = index.files.filter((f) => NOTES_FILENAME_RE.test(f.name));
  const loaded = await Promise.all(
    targets.map(async (f): Promise<LoadedNotesFile | null> => {
      const text = await fetchRaw(f.rawUrl);
      const file = parseNotesFile(text);
      if (!file) return null;
      return {
        clientId: file.clientId,
        authorName: file.author?.name,
        notes: file.notes,
        file,
      };
    }),
  );
  return loaded.filter((x): x is LoadedNotesFile => x !== null);
}

/** 사이드바 항목(노트 단위 평탄화 — §3-D). */
export interface SidebarEntry {
  clientId: string;
  noteId: string;
  authorName?: string;
  pageCount: number;
  firstComment?: string;
  origin: Origin;
  isMine: boolean; // tetorial:clientId 대조 → "내 것" 배지 + "이어서 편집"
}

/** 노트 파일 목록을 노트 단위 사이드바 항목으로 평탄화한다(내 노트 배지 포함). */
export function flattenSidebar(
  files: readonly LoadedNotesFile[],
  myClientId: string | null,
): SidebarEntry[] {
  const entries: SidebarEntry[] = [];
  for (const file of files) {
    for (const note of file.notes) {
      entries.push({
        clientId: file.clientId,
        noteId: note.id,
        authorName: file.authorName,
        pageCount: note.pages.length,
        firstComment: note.pages[0]?.comment,
        origin: note.origin,
        isMine: myClientId !== null && file.clientId === myClientId,
      });
    }
  }
  return entries;
}

/** 딥링크 후보(noteId가 파일 간 충돌 시 후보 목록 — §3-E, notes §9). */
export interface NoteCandidate {
  clientId: string;
  note: Note;
}

/**
 * noteId(+선택적 clientId 한정자)로 노트 후보를 해석한다.
 * - clientId가 주어지면 해당 파일만 대상.
 * - 후보가 1개면 그 노트를 바로 열고, 2개 이상이면 충돌 → 후보 목록 표시(AW-10).
 */
export function resolveNoteCandidates(
  files: readonly LoadedNotesFile[],
  noteId: string,
  clientId?: string | null,
): NoteCandidate[] {
  const candidates: NoteCandidate[] = [];
  for (const file of files) {
    if (clientId && file.clientId !== clientId) continue;
    for (const note of file.notes) {
      if (note.id === noteId) candidates.push({ clientId: file.clientId, note });
    }
  }
  return candidates;
}
