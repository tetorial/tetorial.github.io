// BoardRenderer — 프레임워크 비종속 Canvas 2D 보드 렌더러 (명세 §2). 무상태 그리기 계층.
// 내부 rAF 루프·더티 추적 없음 — render 1회 = 전체 재그리기(명세 §6). Preact 아일랜드가 마운트해 쓴다(D-12).
import type { PieceType } from "@tetorial/types";
import {
  BOARD_WIDTH,
  hitTest as hitTestGeo,
  totalRows,
  type Geometry,
} from "./geometry.js";
import {
  drawBackground,
  drawBoardCells,
  drawEffects,
  drawFalling,
  drawGhost,
  drawGrid,
  drawHighlights,
  type Ctx2D,
} from "./draw.js";
import { DEFAULT_THEME, mergeTheme, resolveTheme } from "./theme.js";
import { PREVIEW_COLS, PREVIEW_ROWS, PREVIEW_SHAPES } from "./shapes.js";
import type { CellPos, RenderFrame, RendererOptions, Theme, ThumbnailState } from "./types.js";

/** 옵션 입력 표면 — theme는 부분 오버라이드 허용(명세 §4-3). 공개 export 아님(내부 별칭). */
type OptionsInput = Partial<Omit<RendererOptions, "theme">> & { theme?: Partial<Theme> };

const DEFAULT_CELL_SIZE = 24;
const DEFAULT_VISIBLE_HEIGHT = 20;
const DEFAULT_BUFFER_PEEK = 2;

/** 실행 환경의 기본 DPR (없으면 1). devicePixelRatio는 브라우저에만 존재. */
function readDpr(): number {
  const g = globalThis as { devicePixelRatio?: number };
  return typeof g.devicePixelRatio === "number" && g.devicePixelRatio > 0 ? g.devicePixelRatio : 1;
}

function get2DContext(canvas: HTMLCanvasElement | OffscreenCanvas): Ctx2D {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("[@tetorial/renderer] 2D 컨텍스트를 얻을 수 없습니다");
  return ctx;
}

export class BoardRenderer {
  private readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  private readonly ctx: Ctx2D;
  private cellSize: number;
  private visibleHeight: number;
  private bufferPeek: number;
  private gridLines: boolean;
  private theme: Theme;
  private dpr: number;
  private cssWidth: number;
  private cssHeight: number;
  /** 미지 행 문자 경고 중복 억제 — 인스턴스 소유(전역 상태 없음, RD-6). */
  private readonly warned = new Set<string>();

  constructor(canvas: HTMLCanvasElement | OffscreenCanvas, opts?: OptionsInput) {
    this.canvas = canvas;
    this.ctx = get2DContext(canvas);
    this.cellSize = opts?.cellSize ?? DEFAULT_CELL_SIZE;
    this.visibleHeight = opts?.visibleHeight ?? DEFAULT_VISIBLE_HEIGHT;
    this.bufferPeek = opts?.bufferPeek ?? DEFAULT_BUFFER_PEEK;
    this.gridLines = opts?.gridLines ?? true;
    this.theme = resolveTheme(opts?.theme);
    this.dpr = readDpr();
    // 기본 CSS 크기 = 보드 실측(폭 × 총 행). 호출자가 resize로 재정의 가능.
    this.cssWidth = BOARD_WIDTH * this.cellSize;
    this.cssHeight = totalRows(this.geometry()) * this.cellSize;
    this.applyCanvasSize();
  }

  private geometry(): Geometry {
    return {
      cellSize: this.cellSize,
      visibleHeight: this.visibleHeight,
      bufferPeek: this.bufferPeek,
    };
  }

  /** 내부 픽셀 크기 = CSS 크기 × dpr (고DPI 선명도, 명세 §5). */
  private applyCanvasSize(): void {
    this.canvas.width = Math.round(this.cssWidth * this.dpr);
    this.canvas.height = Math.round(this.cssHeight * this.dpr);
  }

  /** 전체 다시 그리기. 더티 추적 없음(명세 §6). 동일 프레임 2회 → 동일 호출 기록(RD-5). */
  render(frame: RenderFrame): void {
    const geo = this.geometry();
    // DPR 스케일을 transform에 넣어 이하 그리기는 CSS px 좌표계에서 수행.
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    drawBackground(this.ctx, this.cssWidth, this.cssHeight, this.theme);
    if (this.gridLines) drawGrid(this.ctx, geo, this.theme);
    drawBoardCells(this.ctx, geo, frame.board.rows, this.theme, this.warned);
    if (frame.ghost) drawGhost(this.ctx, geo, frame.ghost, this.theme);
    if (frame.falling) drawFalling(this.ctx, geo, frame.falling.type, frame.falling.cells, this.theme);
    if (frame.overlays?.highlights) drawHighlights(this.ctx, geo, frame.overlays.highlights, this.theme);
    if (frame.effects?.clearedRows && frame.effects.clearedRows.length > 0) {
      drawEffects(this.ctx, geo, frame.effects.clearedRows, frame.effects.progress ?? 0);
    }
  }

  /** CSS px 오프셋 → 논리 셀. 보드 밖 null (명세 §3, RD-1 왕복 검증 대상). */
  hitTest(offsetX: number, offsetY: number): CellPos | null {
    return hitTestGeo(this.geometry(), offsetX, offsetY);
  }

  /** 호출자(ResizeObserver 등)가 구동. dpr 생략 시 devicePixelRatio(명세 §5). */
  resize(cssWidth: number, cssHeight: number, dpr?: number): void {
    this.cssWidth = cssWidth;
    this.cssHeight = cssHeight;
    this.dpr = dpr ?? readDpr();
    this.applyCanvasSize();
  }

  /** 옵션 부분 갱신. theme는 현재 테마 위에 부분 병합. cellSize/높이 변경 시 캔버스 크기 재계산 없음(호출자가 resize). */
  setOptions(opts: OptionsInput): void {
    if (opts.cellSize !== undefined) this.cellSize = opts.cellSize;
    if (opts.visibleHeight !== undefined) this.visibleHeight = opts.visibleHeight;
    if (opts.bufferPeek !== undefined) this.bufferPeek = opts.bufferPeek;
    if (opts.gridLines !== undefined) this.gridLines = opts.gridLines;
    if (opts.theme !== undefined) this.theme = mergeTheme(this.theme, opts.theme);
  }
}

/** 실행 환경에 맞는 오프스크린/캔버스 표면 생성 (브라우저: OffscreenCanvas 우선, 없으면 <canvas>). */
function createSurface(pxWidth: number, pxHeight: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(pxWidth, pxHeight);
  if (typeof document !== "undefined") {
    const c = document.createElement("canvas");
    c.width = pxWidth;
    c.height = pxHeight;
    return c;
  }
  throw new Error("[@tetorial/renderer] 캔버스를 생성할 수 있는 환경이 아닙니다 (OffscreenCanvas·document 부재)");
}

const THUMBNAIL_CELL_SIZE = 8;
const THUMBNAIL_VISIBLE_HEIGHT = 20;

/**
 * 필름스트립용 페이지 썸네일 (명세 §2). falling 없음(페이지 = 락 결과 상태, D-6), 오버레이 포함.
 * 기본 테마 사용. 반환 표면 크기 = 폭10 × 가시20 (셀 크기 배). 격자선 없음(작은 크기에서 노이즈).
 */
export function renderThumbnail(
  state: ThumbnailState,
  opts?: { cellSize?: number },
): OffscreenCanvas | HTMLCanvasElement {
  const cellSize = opts?.cellSize ?? THUMBNAIL_CELL_SIZE;
  const geo: Geometry = {
    cellSize,
    visibleHeight: THUMBNAIL_VISIBLE_HEIGHT,
    bufferPeek: 0,
  };
  const dpr = readDpr();
  const cssWidth = BOARD_WIDTH * cellSize;
  const cssHeight = THUMBNAIL_VISIBLE_HEIGHT * cellSize;
  const surface = createSurface(Math.round(cssWidth * dpr), Math.round(cssHeight * dpr));
  const ctx = get2DContext(surface);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawBackground(ctx, cssWidth, cssHeight, DEFAULT_THEME);
  drawBoardCells(ctx, geo, state.board.rows, DEFAULT_THEME, new Set<string>());
  if (state.overlays?.highlights) drawHighlights(ctx, geo, state.overlays.highlights, DEFAULT_THEME);
  return surface;
}

/**
 * 넥스트/홀드 아이콘을 호출자 제공 캔버스에 그린다 (명세 §2·§4-2).
 * 표시 전용 자체 형상 표(PREVIEW_SHAPES) 사용 — 물리 진실 아님. 기본 테마 색.
 * cellSize 미지정 시 캔버스 크기에서 4열×2행에 맞춰 산출. 캔버스 좌표계(자체 px)에 직접 그린다.
 */
export function renderPiecePreview(
  piece: PieceType,
  canvas: HTMLCanvasElement | OffscreenCanvas,
  opts?: { cellSize?: number },
): void {
  const ctx = get2DContext(canvas);
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const cells = PREVIEW_SHAPES[piece];
  const cellSize =
    opts?.cellSize ?? Math.floor(Math.min(w / PREVIEW_COLS, h / PREVIEW_ROWS));
  if (cellSize <= 0) return;

  // 형상 바운딩 박스 → 캔버스 중앙 정렬.
  let minCol = PREVIEW_COLS;
  let maxCol = 0;
  let minRow = PREVIEW_ROWS;
  let maxRow = 0;
  for (const [col, row] of cells) {
    if (col < minCol) minCol = col;
    if (col > maxCol) maxCol = col;
    if (row < minRow) minRow = row;
    if (row > maxRow) maxRow = row;
  }
  const shapeWidth = (maxCol - minCol + 1) * cellSize;
  const shapeHeight = (maxRow - minRow + 1) * cellSize;
  const originX = (w - shapeWidth) / 2 - minCol * cellSize;
  const originY = (h - shapeHeight) / 2 - minRow * cellSize;

  ctx.fillStyle = DEFAULT_THEME.cell[piece] ?? DEFAULT_THEME.cell["D"] ?? "#b6bcc4";
  for (const [col, row] of cells) {
    ctx.fillRect(originX + col * cellSize, originY + row * cellSize, cellSize - 1, cellSize - 1);
  }
}
