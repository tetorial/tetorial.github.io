// 저수준 그리기 계층 — 그리기 순서(명세 §4-1): 배경·격자 → 보드 셀 → 고스트 → falling → 하이라이트 → 이펙트.
// 무상태·동기·부수효과 없음(캔버스 제외). 미지 문자 경고 중복 억제용 Set은 호출자가 소유(RD-6 전역 상태 없음).
import type { PieceType } from "@tetorial/types";
import { BOARD_WIDTH, cellRect, isVisibleCell, totalRows, type Geometry } from "./geometry.js";
import type { CellPos, Theme } from "./types.js";
import { DEFAULT_THEME } from "./theme.js";

/** HTMLCanvas·OffscreenCanvas 양쪽 2D 컨텍스트 공통 부분집합. */
export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** 셀 간 1px 간격 렌더(명세 §4-1 — 연결 텍스처는 v2, v1은 셀 단위 간격). */
const CELL_GAP = 1;

/** 물리적으로 알려진 셀 문자 집합 (7미노 + 쓰레기 G + 더미 D). 그 외는 미지 문자로 D 처리. */
const KNOWN_CELL_CHARS = new Set(["I", "J", "L", "O", "S", "T", "Z", "G", "D"]);

/** 더미/미지 문자의 폴백 채움색 (테마 맵이 비었을 때의 최종 안전값). */
const FALLBACK_FILL = DEFAULT_THEME.cell["D"] as string;

type CellStyle = { fill: string; border: string | null };

/**
 * 행 문자 → 그리기 스타일. 미지 문자는 D와 동일 처리 + 심볼당 최초 1회 console.warn
 * (전방 호환, 어댑터의 미지 mino 강등 정책과 대칭 — 명세 §4-1).
 */
function resolveCellStyle(symbol: string, theme: Theme, warned: Set<string>): CellStyle {
  if (KNOWN_CELL_CHARS.has(symbol)) {
    const fill = theme.cell[symbol] ?? theme.cell["D"] ?? FALLBACK_FILL;
    return { fill, border: symbol === "D" ? theme.dummyBorder : null };
  }
  if (!warned.has(symbol)) {
    warned.add(symbol);
    console.warn(`[@tetorial/renderer] 미지의 행 문자 "${symbol}" → D(더미)로 표시합니다.`);
  }
  const fill = theme.cell["D"] ?? FALLBACK_FILL;
  return { fill, border: theme.dummyBorder };
}

function fillCell(ctx: Ctx2D, geo: Geometry, x: number, y: number, style: CellStyle): void {
  const { px, py, size } = cellRect(geo, x, y);
  ctx.fillStyle = style.fill;
  ctx.fillRect(px, py, size - CELL_GAP, size - CELL_GAP);
  if (style.border) {
    ctx.strokeStyle = style.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, size - CELL_GAP - 1, size - CELL_GAP - 1);
  }
}

/** 배경 채움 + 캔버스 클리어 (CSS px 좌표계 — DPR은 transform에서 처리). */
export function drawBackground(ctx: Ctx2D, cssWidth: number, cssHeight: number, theme: Theme): void {
  ctx.clearRect(0, 0, cssWidth, cssHeight);
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, cssWidth, cssHeight);
}

/** 격자선 — 보드 영역(width × totalRows) 전체에 셀 경계선. */
export function drawGrid(ctx: Ctx2D, geo: Geometry, theme: Theme): void {
  const rows = totalRows(geo);
  const w = BOARD_WIDTH * geo.cellSize;
  const h = rows * geo.cellSize;
  ctx.strokeStyle = theme.gridLine;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let c = 0; c <= BOARD_WIDTH; c++) {
    const px = c * geo.cellSize + 0.5;
    ctx.moveTo(px, 0);
    ctx.lineTo(px, h);
  }
  for (let r = 0; r <= rows; r++) {
    const py = r * geo.cellSize + 0.5;
    ctx.moveTo(0, py);
    ctx.lineTo(w, py);
  }
  ctx.stroke();
}

/** 보드 셀. rows[0] = 최하단(y=0). 가시 범위 밖(버퍼 peek 위)은 클리핑(미렌더). */
export function drawBoardCells(
  ctx: Ctx2D,
  geo: Geometry,
  rows: readonly string[],
  theme: Theme,
  warned: Set<string>,
): void {
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    if (!row) continue;
    for (let x = 0; x < BOARD_WIDTH; x++) {
      const ch = row[x];
      if (!ch || ch === "_") continue;
      if (!isVisibleCell(geo, x, y)) continue; // 버퍼 peek 위 클리핑
      fillCell(ctx, geo, x, y, resolveCellStyle(ch, theme, warned));
    }
  }
}

/** 고스트 — 반투명 채움 + 외곽선 (falling과 즉시 구분). 가시 범위 밖 클리핑. */
export function drawGhost(ctx: Ctx2D, geo: Geometry, cells: readonly CellPos[], theme: Theme): void {
  for (const { x, y } of cells) {
    if (!isVisibleCell(geo, x, y)) continue;
    const { px, py, size } = cellRect(geo, x, y);
    ctx.fillStyle = theme.ghostFill;
    ctx.fillRect(px, py, size - CELL_GAP, size - CELL_GAP);
    ctx.strokeStyle = theme.ghostStroke;
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, size - CELL_GAP - 1, size - CELL_GAP - 1);
  }
}

/** 조작 중 미노 — 미노 색 솔리드 채움(고스트 위). 가시 범위 밖 클리핑. */
export function drawFalling(
  ctx: Ctx2D,
  geo: Geometry,
  type: PieceType,
  cells: readonly CellPos[],
  theme: Theme,
): void {
  const fill = theme.cell[type] ?? FALLBACK_FILL;
  for (const { x, y } of cells) {
    if (!isVisibleCell(geo, x, y)) continue;
    const { px, py, size } = cellRect(geo, x, y);
    ctx.fillStyle = fill;
    ctx.fillRect(px, py, size - CELL_GAP, size - CELL_GAP);
  }
}

/**
 * highlights 인코딩 기준 (x, y)의 하이라이트 여부 — 행 부재·문자 부재 = 비하이라이트.
 * 가시 클리핑(isVisibleCell)과 무관한 데이터 판정이다(RD-9 — 가시 경계 밖 이웃도 이웃).
 */
function isHighlightAt(highlights: readonly string[], x: number, y: number): boolean {
  return y >= 0 && highlights[y]?.[x] === "H";
}

/**
 * 하이라이트 오버레이 — 셀을 채우지 않고 theme.highlight 색의 inside 외곽선을 그린다(RD-8).
 * 선 두께는 cellSize 비례 max(1, round(cellSize/8)), 셀 경계 안쪽 — 셀 밖으로 나가지 않는다.
 * 오토 타일링(RD-9): 4-이웃이 하이라이트인 변은 스트로크를 생략해 인접 묶음의 바깥 윤곽만 남긴다.
 * 이웃 판정은 highlights 데이터 기준(가시 클리핑과 분리), 대각 이웃은 무시.
 * highlights[0] = 최하단 행. board와 동일 행 인코딩("_"=없음, "H"=하이라이트).
 */
export function drawHighlights(
  ctx: Ctx2D,
  geo: Geometry,
  highlights: readonly string[],
  theme: Theme,
): void {
  const t = Math.max(1, Math.round(geo.cellSize / 8));
  const half = t / 2;
  let begun = false;
  for (let y = 0; y < highlights.length; y++) {
    const row = highlights[y];
    if (!row) continue;
    for (let x = 0; x < BOARD_WIDTH; x++) {
      if (row[x] !== "H") continue;
      if (!isVisibleCell(geo, x, y)) continue;
      // 캔버스 상변 = 보드 y+1 쪽, 하변 = y-1 쪽 (논리 y는 아래→위 증가).
      const top = !isHighlightAt(highlights, x, y + 1);
      const bottom = !isHighlightAt(highlights, x, y - 1);
      const left = !isHighlightAt(highlights, x - 1, y);
      const right = !isHighlightAt(highlights, x + 1, y);
      if (!top && !bottom && !left && !right) continue;
      if (!begun) {
        ctx.strokeStyle = theme.highlight;
        ctx.lineWidth = t;
        ctx.beginPath();
        begun = true;
      }
      const { px, py, size } = cellRect(geo, x, y);
      // 선분은 셀 변 전체 길이 — 코너가 자연히 이어진다. 중심선을 half만큼 안쪽으로 넣어 inside 유지.
      if (top) {
        ctx.moveTo(px, py + half);
        ctx.lineTo(px + size, py + half);
      }
      if (bottom) {
        ctx.moveTo(px, py + size - half);
        ctx.lineTo(px + size, py + size - half);
      }
      if (left) {
        ctx.moveTo(px + half, py);
        ctx.lineTo(px + half, py + size);
      }
      if (right) {
        ctx.moveTo(px + size - half, py);
        ctx.lineTo(px + size - half, py + size);
      }
    }
  }
  if (begun) ctx.stroke();
}

/**
 * 라인 클리어 연출(선택). progress 0~1은 호출자 공급 — 0=막 지워짐, 1=연출 끝.
 * 지워지는 행 위로 흰색 플래시를 progress에 따라 페이드아웃한다. 상태 없음.
 */
export function drawEffects(
  ctx: Ctx2D,
  geo: Geometry,
  clearedRows: readonly number[],
  progress: number,
): void {
  const alpha = (1 - Math.min(1, Math.max(0, progress))) * 0.6;
  if (alpha <= 0) return;
  const prevAlpha = ctx.globalAlpha;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#ffffff";
  for (const y of clearedRows) {
    if (y < 0 || y >= totalRows(geo)) continue;
    const { px, py, size } = cellRect(geo, 0, y);
    ctx.fillRect(px, py, BOARD_WIDTH * geo.cellSize, size);
  }
  ctx.globalAlpha = prevAlpha;
}
