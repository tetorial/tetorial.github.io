// Next·Hold 미노 아이콘 (m3b §5 — AW-18). @tetorial/renderer의 renderPiecePreview(RD-4)를 마운트한다.
// 표시할 조각을 고르는 계산부는 lib/piece-preview.ts — 여기는 캔버스 배선만.
import { useEffect, useRef } from "preact/hooks";
import { renderPiecePreview } from "@tetorial/renderer";
import type { PieceType } from "@tetorial/types";

interface Props {
  piece: PieceType;
  /** 아이콘 한 변의 CSS 크기(px). 넥스트·홀드가 서로 다른 크기를 쓴다. */
  size?: number;
  /** 홀드를 이미 쓴 상태 — 흐리게 표시(WorkView.hold.locked). */
  dimmed?: boolean;
  label?: string;
}

// renderPiecePreview의 형상 표는 4열×2행 격자다(renderer §4-2) — 캔버스를 그 비율로 잡아야
// 조각이 잘리지 않고 중앙에 온다. 렌더러가 캔버스 크기에서 셀 크기를 산출한다.
const PREVIEW_COLS = 4;
const PREVIEW_ROWS = 2;

export default function PiecePreview({ piece, size = 22, dimmed = false, label }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // 캔버스 CSS 크기는 DOM 책임(BoardCanvas와 같은 규약) — 내부 픽셀은 dpr배로 잡아 고DPI에서 선명하게.
  const cssWidth = size * PREVIEW_COLS;
  const cssHeight = size * PREVIEW_ROWS;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    // renderPiecePreview는 캔버스 좌표계(내부 px)에 그리고 cellSize를 캔버스 크기에서 산출한다 —
    // 내부 크기를 dpr배로 잡아 뒀으므로 dpr 스케일이 그대로 반영된다.
    renderPiecePreview(piece, canvas);
  }, [piece, cssWidth, cssHeight]);

  return (
    <canvas
      ref={canvasRef}
      class={`piece-preview${dimmed ? " dimmed" : ""}`}
      data-testid="piece-preview"
      data-piece={piece}
      role="img"
      aria-label={label ?? `${piece} 미노`}
    />
  );
}
