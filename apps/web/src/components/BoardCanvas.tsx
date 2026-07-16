// 보드 캔버스 — @tetorial/renderer(BoardRenderer)를 마운트해 매 프레임 그린다(무상태 렌더러).
import { useEffect, useRef } from "preact/hooks";
import { BoardRenderer, DEFAULT_THEME } from "@tetorial/renderer";
import type { RenderFrame, Theme } from "@tetorial/renderer";

interface Props {
  frame: RenderFrame;
  cellSize?: number;
  theme?: Partial<Theme>;
  /** 포인터 그리기용 셀 히트테스트 콜백(시뮬레이터 캔버스). */
  onCellPointer?: (cell: { x: number; y: number }, phase: "down" | "move" | "up") => void;
}

export default function BoardCanvas({ frame, cellSize = 26, theme, onCellPointer }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<BoardRenderer | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new BoardRenderer(canvas, {
      cellSize,
      theme: { ...DEFAULT_THEME, ...(theme ?? {}) },
    });
    rendererRef.current = renderer;
    // 렌더러는 내부 픽셀 해상도(canvas.width/height = CSS px × dpr)만 설정한다. 표시(CSS) 크기는
    // DOM의 책임 — 고DPI에서 CSS 크기를 명시하지 않으면 intrinsic(=device px)로 늘어나 히트테스트
    // 좌표(offsetX/Y = CSS px)가 dpr배 왜곡된다(그리기 오프셋 결함). CSS 크기 = 내부 픽셀 ÷ dpr.
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = `${canvas.width / dpr}px`;
    canvas.style.height = `${canvas.height / dpr}px`;
    return () => {
      rendererRef.current = null;
    };
    // cellSize·theme 변경 시 재생성
  }, [cellSize, theme]);

  useEffect(() => {
    rendererRef.current?.render(frame);
  }, [frame]);

  const hit = (e: PointerEvent, phase: "down" | "move" | "up"): void => {
    if (!onCellPointer) return;
    const cell = rendererRef.current?.hitTest(e.offsetX, e.offsetY);
    if (cell) onCellPointer(cell, phase);
  };

  return (
    <canvas
      ref={canvasRef}
      class="board-canvas"
      data-testid="board-canvas"
      onPointerDown={onCellPointer ? (e) => hit(e as PointerEvent, "down") : undefined}
      onPointerMove={onCellPointer ? (e) => hit(e as PointerEvent, "move") : undefined}
      onPointerUp={onCellPointer ? (e) => hit(e as PointerEvent, "up") : undefined}
      style={{ touchAction: "none" }}
    />
  );
}
