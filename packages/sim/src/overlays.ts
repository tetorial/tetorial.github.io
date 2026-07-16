// 오버레이 버퍼 — 엔진 밖 표시 레이어(하이라이트). 물리 무관, sim이 관리(명세 §3-2).
// v1 작성 UI는 미구현이나 데이터 경로(그리기·캡처·직렬화·복원)는 완성한다(S-8).
// 인코딩: PageState.overlays.highlights — rows[0]=최하단, 각 행 width 길이 "_"/"H".

const OVERLAY_HEIGHT = 40; // 엔진 전체 높이(가시 20 + 버퍼 20, engine 명세 §4)
const OVERLAY_WIDTH = 10;

function emptyGrid(): boolean[][] {
  return Array.from({ length: OVERLAY_HEIGHT }, () =>
    new Array<boolean>(OVERLAY_WIDTH).fill(false),
  );
}

/** 하이라이트 오버레이 버퍼 (y: 0=최하단, x: 0=왼쪽) */
export class OverlayBuffer {
  #grid: boolean[][];

  private constructor(grid: boolean[][]) {
    this.#grid = grid;
  }

  static empty(): OverlayBuffer {
    return new OverlayBuffer(emptyGrid());
  }

  /** PageState.overlays.highlights 인코딩에서 복원 */
  static fromHighlights(rows: readonly string[] | undefined): OverlayBuffer {
    const grid = emptyGrid();
    if (rows) {
      for (let y = 0; y < rows.length && y < OVERLAY_HEIGHT; y++) {
        const row = rows[y];
        const target = grid[y];
        if (!row || !target) continue;
        for (let x = 0; x < row.length && x < OVERLAY_WIDTH; x++) {
          if (row[x] === "H") target[x] = true;
        }
      }
    }
    return new OverlayBuffer(grid);
  }

  /** 셀 하이라이트 설정. 범위 밖이거나 값 변화 없으면 false */
  set(x: number, y: number, on: boolean): boolean {
    if (x < 0 || x >= OVERLAY_WIDTH || y < 0 || y >= OVERLAY_HEIGHT) return false;
    const row = this.#grid[y];
    if (!row || row[x] === on) return false;
    row[x] = on;
    return true;
  }

  /** 최하단부터 하이라이트가 존재하는 최상단 행까지 인코딩. 전부 비면 빈 배열 */
  serialize(): string[] {
    let top = -1;
    for (let y = OVERLAY_HEIGHT - 1; y >= 0; y--) {
      if (this.#grid[y]?.some((c) => c)) {
        top = y;
        break;
      }
    }
    const rows: string[] = [];
    for (let y = 0; y <= top; y++) {
      rows.push((this.#grid[y] ?? []).map((c) => (c ? "H" : "_")).join(""));
    }
    return rows;
  }

  clone(): OverlayBuffer {
    return new OverlayBuffer(this.#grid.map((r) => [...r]));
  }
}
