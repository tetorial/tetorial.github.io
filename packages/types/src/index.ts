// @tetorial/types 공개 API — notes·meta 스키마의 TS 타입 + zod 검증기 (Worker·클라이언트 공유)
// 공개 타입 변경 = 스키마 변경: 반드시 명세 개정 + 총괄 승인 하에 수행 (conventions §2)
export type {
  NotesFile,
  Note,
  Origin,
  Snapshot,
  Page,
  PageState,
  BoardRows,
  PieceType,
} from "./notes.js";
export {
  notesFileSchema,
  // 서브 스키마·한도 상수 — W0 게이트 승인 (packages/types/QUESTIONS.md 11·12)
  originSchema,
  snapshotSchema,
  pageSchema,
  pageStateSchema,
  NOTES_LIMITS,
  // note id 형식의 유일 출처 — M1c 승격 (types-m1c §3)
  NOTE_ID_PATTERN,
} from "./notes.js";

export type { MetaFile } from "./meta.js";
export { metaFileSchema, META_LIMITS } from "./meta.js";
