// 노트 파일(notes-<clientId>.json) 스키마 — docs/specs/notes-schema.md §4(타입)·§6(한도) 자구 전사
import { z } from "zod";
import { codePointLength, isoUtcSchema, sha256HexSchema } from "./shared.js";

// ---------------------------------------------------------------------------
// TS 타입 (명세 §4 표기 그대로 — zod 스키마와의 일치는 테스트에서 타입 레벨로 검증)
// ---------------------------------------------------------------------------

/** 파일 루트 */
export type NotesFile = {
  schema: "tetorial.notes/1"; // 스키마 식별자 + 버전. 마이그레이션 기준
  clientId: string; // 파일명의 <clientId>와 반드시 일치. [A-Za-z0-9_-]{12}
  editKeyHash: string; // SHA-256(editKey) hex 64자. Worker가 기록, 이후 불변
  author?: { name?: string }; // 표시용 닉네임(선택). 인증 아님 — 사칭 방지 기능 없음
  createdAt: string; // ISO 8601 UTC
  updatedAt: string; // ISO 8601 UTC. Worker가 수정 시 갱신
  notes: Note[];
};

export type Note = {
  id: string; // 파일 내 유일. [A-Za-z0-9_-]{8}
  origin: Origin; // 진입점 (provenance)
  snapshot: Snapshot; // 진입 시점 전체 상태 + 큐 원본
  pages: Page[]; // 순서 보장(생성순). 최소 1개
  createdAt: string;
  updatedAt: string;
};

/** 진입점: 리플레이의 한 프레임 또는 다른 노트의 한 페이지 */
export type Origin =
  | { type: "replay"; round: number; player: number; frame: number }
  | { type: "note"; clientId: string; noteId: string; pageId: string };

export type Snapshot = {
  ruleset: {
    preset: "srs" | "srs+"; // 킥테이블·180회전 등은 프리셋이 결정 (엔진 명세 참조)
    spinBonuses?: string; // 스핀 판정 모드. tetr.io 값 그대로 (예: "all-mini+", "T-spins")
    allow180?: boolean; // 방 설정이 프리셋 기본과 다를 때만 기록 (어댑터가 채움)
  };
  board: BoardRows;
  current: PieceType; // 조작 중인 미노
  hold: PieceType | null;
  holdLocked: boolean; // 직전에 홀드를 사용해 이번 수에 홀드 불가인 상태
  queue: string; // 확정된 넥스트 시퀀스. 예: "IJLOSTZ..." (current 미포함)
  counters: { b2b: number; combo: number }; // tetr.io 원값 규약: -1 = 없음. 0부터 유효
};

/** 페이지: 상태 체크포인트 */
export type Page = {
  id: string; // 노트 내 유일. [A-Za-z0-9_-]{8}. 딥링크 대상
  state: PageState;
  comment?: string; // 주석. ≤ 500자 (유니코드 코드포인트 기준)
};

export type PageState = {
  board: BoardRows; // 미노 배치·라인 클리어·셀 그리기가 모두 반영된 결과
  current: PieceType | null; // null = 큐 소진으로 다음 미노 없음
  hold: PieceType | null;
  holdLocked: boolean;
  queueUsed: number; // snapshot.queue에서 소비된 미노 개수
  counters: { b2b: number; combo: number }; // tetr.io 원값 규약 (-1 = 없음)
  overlays?: {
    // v1 예약 (작성 UI는 v2). 보드 위 표시용 레이어 — 물리 무관
    highlights?: string[]; // board.rows와 동일 행 인코딩. "_"=없음, "H"=하이라이트
  };
};

export type BoardRows = {
  width: 10;
  rows: string[]; // rows[0] = 최하단. 각 행은 width 길이 문자열. 상단 전부-빈 행 트림 가능. 최대 40행
};

export type PieceType = "I" | "J" | "L" | "O" | "S" | "T" | "Z";
// 행 문자: "_"=빈 칸, "G"=쓰레기 블록, "D"=더미 블록(물리는 G와 동일, 무채색 구분 표기),
//          미노 문자=해당 색 블록

// ---------------------------------------------------------------------------
// zod 검증기 (한도는 §6 표, 산술 경계는 refine)
// ---------------------------------------------------------------------------

/** notes 스키마 한도 (§6 표). maxFileBytes(직렬화 크기)는 이 패키지가 강제하지 않는다
    — 파싱된 객체만 받으므로 Worker의 요청 크기 검사 몫 (gist-proxy §4-2) */
export const NOTES_LIMITS = {
  maxFileBytes: 800_000,
  maxNotes: 50,
  maxPages: 100,
  maxCommentCodePoints: 500,
  maxQueueLength: 1000,
  maxBoardRows: 40,
  boardWidth: 10,
} as const;

const clientIdSchema = z.string().regex(/^[A-Za-z0-9_-]{12}$/, "clientId는 [A-Za-z0-9_-]{12}");
const idSchema = z.string().regex(/^[A-Za-z0-9_-]{8}$/, "id는 [A-Za-z0-9_-]{8}");
const pieceTypeSchema = z.enum(["I", "J", "L", "O", "S", "T", "Z"]);
const countersSchema = z.object({
  b2b: z.number().int().min(-1), // D-9: -1 = 없음, 0부터 유효
  combo: z.number().int().min(-1),
});

const boardRowsSchema = z.object({
  width: z.literal(NOTES_LIMITS.boardWidth),
  rows: z
    .array(z.string().regex(/^[_GDIJLOSTZ]{10}$/, "행은 width(10) 길이의 [_GDIJLOSTZ] 문자열"))
    .max(NOTES_LIMITS.maxBoardRows), // 전체 높이(가시 20 + 버퍼 20)
});

/** Origin 단독 검증기 (W0 게이트 승인으로 공개 — adapter·sim의 부분 검증용) */
export const originSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("replay"),
    round: z.number().int().nonnegative(), // 원본 리플레이 기준 라운드 번호(0-base)
    player: z.number().int().nonnegative(), // 보드 인덱스(0-base). 솔로는 0 고정
    frame: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal("note"),
    clientId: clientIdSchema,
    noteId: idSchema,
    pageId: idSchema,
  }),
]);

/** Snapshot 단독 검증기 (adapter-tetrio A-7 산출물 검증용) */
export const snapshotSchema = z.object({
  ruleset: z.object({
    preset: z.enum(["srs", "srs+"]),
    spinBonuses: z.string().optional(),
    allow180: z.boolean().optional(),
  }),
  board: boardRowsSchema,
  current: pieceTypeSchema,
  hold: pieceTypeSchema.nullable(),
  holdLocked: z.boolean(),
  queue: z
    .string()
    .regex(/^[IJLOSTZ]*$/, "queue는 미노 문자만")
    .max(NOTES_LIMITS.maxQueueLength), // §6: queue ≤ 1000
  counters: countersSchema,
});

/** PageState 단독 검증기 (sim의 페이지 상태 검증용) */
export const pageStateSchema = z.object({
  board: boardRowsSchema,
  current: pieceTypeSchema.nullable(),
  hold: pieceTypeSchema.nullable(),
  holdLocked: z.boolean(),
  queueUsed: z.number().int().nonnegative(),
  counters: countersSchema,
  overlays: z
    .object({
      highlights: z
        .array(z.string().regex(/^[_H]{10}$/, "highlights 행은 board.rows와 동일 인코딩(_/H)"))
        .max(NOTES_LIMITS.maxBoardRows)
        .optional(),
    })
    .optional(),
});

/** Page 단독 검증기 (sim의 페이지 검증용) */
export const pageSchema = z.object({
  id: idSchema,
  state: pageStateSchema,
  comment: z
    .string()
    .refine(
      (s) => codePointLength(s) <= NOTES_LIMITS.maxCommentCodePoints,
      "comment는 500자 이하(유니코드 코드포인트 기준)",
    )
    .optional(),
});

const noteSchema = z
  .object({
    id: idSchema,
    origin: originSchema,
    snapshot: snapshotSchema,
    pages: z.array(pageSchema).min(1).max(NOTES_LIMITS.maxPages), // §4: 최소 1개 · §6: ≤ 100
    createdAt: isoUtcSchema,
    updatedAt: isoUtcSchema,
  })
  // 산술 경계: 페이지의 남은 큐 = snapshot.queue.slice(queueUsed) 가 성립해야 한다
  .refine((note) => note.pages.every((p) => p.state.queueUsed <= note.snapshot.queue.length), {
    message: "queueUsed는 snapshot.queue 길이를 넘을 수 없다",
    path: ["pages"],
  })
  // §4: page.id는 노트 내 유일
  .refine((note) => new Set(note.pages.map((p) => p.id)).size === note.pages.length, {
    message: "page.id는 노트 내 유일해야 한다",
    path: ["pages"],
  });

/** notes-<clientId>.json 루트 검증기 */
export const notesFileSchema = z
  .object({
    schema: z.literal("tetorial.notes/1"),
    clientId: clientIdSchema,
    editKeyHash: sha256HexSchema,
    author: z.object({ name: z.string().optional() }).optional(),
    createdAt: isoUtcSchema,
    updatedAt: isoUtcSchema,
    notes: z.array(noteSchema).max(NOTES_LIMITS.maxNotes), // §6: notes ≤ 50
  })
  // §4: note.id는 파일 내 유일
  .refine((file) => new Set(file.notes.map((n) => n.id)).size === file.notes.length, {
    message: "note.id는 파일 내 유일해야 한다",
    path: ["notes"],
  });
