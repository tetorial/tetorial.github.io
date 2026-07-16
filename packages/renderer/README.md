# @tetorial/renderer

프레임워크 비종속 **Canvas 2D 보드 렌더러**. 순수 TS 클래스로, Preact 아일랜드가 마운트해 쓴다(D-12).
상태를 갖지 않는 그리기 계층 — "무엇을 그릴지"는 매 `render` 호출의 인자가 전부다.

- 의존성: `@tetorial/types`만 (Canvas 2D API 사용, WebGL·preact·astro 비의존).

## 공개 API

```ts
import {
  BoardRenderer,
  renderThumbnail,
  renderPiecePreview,
  DEFAULT_THEME,
  type RenderFrame,
  type RendererOptions,
  type Theme,
  type CellPos,
  type ThumbnailState,
} from "@tetorial/renderer";
```

### BoardRenderer — 보드 그리기 + 히트테스트

```ts
const canvas = document.querySelector("canvas")!;
const renderer = new BoardRenderer(canvas, {
  cellSize: 28, // CSS px (기본 24)
  visibleHeight: 20, // 가시 행 (기본 20)
  bufferPeek: 2, // 가시 영역 위로 보일 버퍼 행 (기본 2, 그 위는 클리핑)
  gridLines: true, // 격자선 (기본 true)
  theme: { highlight: "rgba(0,200,255,0.35)" }, // 부분 오버라이드 — 나머지는 기본 테마
});

// 매 프레임 전체 다시 그리기 (더티 추적 없음 — 타이밍은 호출자가 rAF로 구동)
renderer.render({
  board: snapshot.board, // notes BoardRows 인코딩 그대로 (rows[0] = 최하단, 트림 허용)
  falling: { type: "T", cells: [{ x: 4, y: 1 }, { x: 3, y: 0 }, { x: 4, y: 0 }, { x: 5, y: 0 }] },
  ghost: [{ x: 3, y: 0 }, { x: 4, y: 0 }, { x: 5, y: 0 }, { x: 4, y: 1 }],
  overlays: { highlights: pageState.overlays?.highlights }, // "_"=없음, "H"=하이라이트
  effects: { clearedRows: [0], progress: 0.4 }, // 라인 클리어 연출(선택)
});

// 포인터 좌표(CSS px, 예: PointerEvent.offsetX/Y) → 논리 셀. 보드 밖이면 null.
const cell = renderer.hitTest(ev.offsetX, ev.offsetY); // { x, y } | null

// 고DPI·레이아웃 변화 시 호출자(ResizeObserver 등)가 구동. dpr 생략 시 devicePixelRatio.
renderer.resize(cssWidth, cssHeight);

// 옵션 부분 갱신 (theme는 현재 테마 위에 부분 병합)
renderer.setOptions({ gridLines: false });
```

**좌표 규약 (명세 §3, 규범):** 논리 좌표는 `x` 0(좌)→9(우), `y` 0(최하단)→위.
셀 `(x, y)`의 캔버스 좌상단은 `px = x·cellSize`, `py = (visibleHeight + bufferPeek − 1 − y)·cellSize` (CSS px).
`render`가 칠한 사각형과 `hitTest`의 역변환은 항상 왕복 일치한다.

### renderThumbnail — 필름스트립용 페이지 썸네일

```ts
// 페이지는 락 결과 상태(D-6)이므로 falling 없음. 오버레이 포함, 기본 테마.
const surface = renderThumbnail(
  { board: page.state.board, overlays: page.state.overlays },
  { cellSize: 8 }, // 기본 8
); // → OffscreenCanvas | HTMLCanvasElement
```

### renderPiecePreview — 넥스트/홀드 아이콘

```ts
// 표시 전용 자체 형상 표(§4-2) 사용 — 물리 진실이 아니다(물리 형상은 render의 falling.cells로 전달).
renderPiecePreview("I", nextCanvas, { cellSize: 16 }); // cellSize 생략 시 캔버스 크기에 맞춰 산출
```

### 테마

`Theme` = 셀 색 맵(행 문자 → 색) + 배경·격자·고스트·하이라이트 색. CSS 변수 비의존(캔버스 자립).
다크/라이트 전환은 호출자가 `setOptions({ theme })` 또는 생성 시 부분 오버라이드로 수행한다.
`D`(더미 셀)는 `G`(쓰레기)와 명확히 구분되는 무채색 + 다른 테두리로 표시된다(D-6 전방 호환).

```ts
import { DEFAULT_THEME } from "@tetorial/renderer";
const dark = { ...DEFAULT_THEME, background: "#0b0e13" };
```

## 참고: 옵션 입력 타입

생성자·`setOptions`는 `RendererOptions`의 부분 지정을 받되, `theme`은 **부분 오버라이드**를 허용한다
(명세 §4-3 — 미지정 색은 기본 테마로 폴백). `RendererOptions`·`Theme`은 해석된(완전한) 형태의 타입이다.

## 테스트

호출 기록 mock 2D 컨텍스트(`src/testing/mock-canvas.ts`)로 검증한다(픽셀 스냅샷 아님, 명세 §7).
`describe`에 수용 기준 ID(RD-1 ~ RD-7)를 명시한다.
