// @tetorial/input 공개 API — 구명세 input §4.
// 명세에 없는 공개 API 추가 금지 (conventions §5) — 제안은 QUESTIONS.md로.
export { createInput, DEFAULT_HANDLING, DEFAULT_KEYS } from "./core.js";
export { attachDom } from "./dom.js";
export type {
  Action,
  EngineControls,
  HandlingConfig,
  InputCore,
  KeyBindings,
  MetaAction,
} from "./types.js";
