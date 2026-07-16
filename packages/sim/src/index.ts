// @tetorial/sim 공개 API — 시뮬레이터 코어(노트/페이지 상태 머신). 명세 docs/specs/sim.md.
// 명세에 없는 공개 API 추가 금지 (conventions §5) — 제안은 QUESTIONS.md로.

export {
  createAuthoringSession,
  restoreAuthoringSession,
  InvalidNoteIdError,
} from "./authoring.js";
export type {
  AuthoringSession,
  EngineControls,
  PageDraft,
  SerializedDraft,
  Tool,
} from "./authoring.js";

export { createViewerSession } from "./viewer.js";
export type { ViewerSession } from "./viewer.js";

export { deriveSnapshotFromPage } from "./derive.js";

export { assembleNotesFile, NoteLimitError, SERVER_FIELD_SENTINELS } from "./assemble.js";
export type { AssembleResult, LimitViolation } from "./assemble.js";

export type { WorkView, FallingPieceView } from "./work.js";
