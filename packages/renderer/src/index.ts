// @tetorial/renderer 공개 API — 명세 §2의 표면만 export (그 외 추가 금지).
// 프레임워크 비종속 Canvas 2D 보드 렌더러. 무상태 그리기 계층 — 의존성은 @tetorial/types뿐.
export { BoardRenderer, renderThumbnail, renderPiecePreview } from "./board-renderer.js";
export { DEFAULT_THEME } from "./theme.js";
export type {
  CellPos,
  RenderFrame,
  RendererOptions,
  Theme,
  ThumbnailState,
} from "./types.js";
