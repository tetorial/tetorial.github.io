// 테스트용 호출 기록 mock 2D 컨텍스트 (명세 §7 — 픽셀 스냅샷 대신 호출 기록으로 검증).
// 렌더러가 실제로 쓰는 2D API 부분집합만 구현하고, 각 그리기 호출 시점의 스타일을 스냅샷해 기록한다.

/** 기록되는 그리기 연산. 레이어 순서·좌표·스타일 검증에 쓴다. */
export type DrawOp =
  | { op: "clearRect"; x: number; y: number; w: number; h: number }
  | { op: "fillRect"; x: number; y: number; w: number; h: number; fillStyle: string; globalAlpha: number }
  | { op: "strokeRect"; x: number; y: number; w: number; h: number; strokeStyle: string; lineWidth: number }
  | { op: "setTransform"; a: number; b: number; c: number; d: number; e: number; f: number }
  | { op: "beginPath" }
  | { op: "moveTo"; x: number; y: number }
  | { op: "lineTo"; x: number; y: number }
  | { op: "stroke"; strokeStyle: string; lineWidth: number };

/** 렌더러가 사용하는 2D 컨텍스트 부분집합의 기록 구현. */
export class MockCtx {
  fillStyle = "";
  strokeStyle = "";
  lineWidth = 1;
  globalAlpha = 1;
  readonly ops: DrawOp[] = [];

  clearRect(x: number, y: number, w: number, h: number): void {
    this.ops.push({ op: "clearRect", x, y, w, h });
  }
  fillRect(x: number, y: number, w: number, h: number): void {
    this.ops.push({ op: "fillRect", x, y, w, h, fillStyle: String(this.fillStyle), globalAlpha: this.globalAlpha });
  }
  strokeRect(x: number, y: number, w: number, h: number): void {
    this.ops.push({ op: "strokeRect", x, y, w, h, strokeStyle: String(this.strokeStyle), lineWidth: this.lineWidth });
  }
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.ops.push({ op: "setTransform", a, b, c, d, e, f });
  }
  beginPath(): void {
    this.ops.push({ op: "beginPath" });
  }
  moveTo(x: number, y: number): void {
    this.ops.push({ op: "moveTo", x, y });
  }
  lineTo(x: number, y: number): void {
    this.ops.push({ op: "lineTo", x, y });
  }
  stroke(): void {
    this.ops.push({ op: "stroke", strokeStyle: String(this.strokeStyle), lineWidth: this.lineWidth });
  }

  /** 편의: fillRect 연산만 추출. */
  fillRects(): Extract<DrawOp, { op: "fillRect" }>[] {
    return this.ops.filter((o): o is Extract<DrawOp, { op: "fillRect" }> => o.op === "fillRect");
  }
}

/** getContext가 MockCtx를 반환하는 mock 캔버스. */
export class MockCanvas {
  width: number;
  height: number;
  readonly ctx = new MockCtx();
  constructor(width = 0, height = 0) {
    this.width = width;
    this.height = height;
  }
  getContext(kind: "2d"): MockCtx {
    if (kind !== "2d") throw new Error(`지원하지 않는 컨텍스트: ${kind}`);
    return this.ctx;
  }
}

/** MockCanvas를 렌더러가 요구하는 캔버스 타입으로 넘기기 위한 단일 캐스트 지점 (테스트 전용, 구조 호환). */
export function asCanvas(mock: MockCanvas): HTMLCanvasElement {
  return mock as unknown as HTMLCanvasElement;
}

/**
 * renderThumbnail이 내부에서 생성하는 OffscreenCanvas를 mock으로 가로챈다.
 * 반환된 instances로 그려진 ctx를 검사하고, restore()로 원복한다.
 */
export function installOffscreenStub(): { instances: MockCanvas[]; restore: () => void } {
  const g = globalThis as { OffscreenCanvas?: unknown };
  const original = g.OffscreenCanvas;
  const instances: MockCanvas[] = [];
  class StubOffscreen extends MockCanvas {
    constructor(w = 0, h = 0) {
      super(w, h);
      instances.push(this);
    }
  }
  g.OffscreenCanvas = StubOffscreen;
  return {
    instances,
    restore: () => {
      g.OffscreenCanvas = original;
    },
  };
}
