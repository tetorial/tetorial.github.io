// @tetorial/renderer 공개 타입 — 명세 §2·§4-3의 표면 정의.
// 렌더러는 "무엇을 그릴지"를 매 호출 인자로만 받는 무상태 그리기 계층이다.
import type { BoardRows, CellPos, PageState, PieceType } from "@tetorial/types";

/** 논리 셀 좌표 — 정의는 @tetorial/types (전 모듈 공통 규약) */
export type { CellPos } from "@tetorial/types";

/**
 * 테마 = 셀 색 맵(행 문자 → 색) + 배경·격자·고스트·하이라이트 색 (명세 §4-3).
 * CSS 변수 비의존 — 캔버스 자립. 다크/라이트 전환은 호출자가 테마 객체 교체로 수행한다.
 */
export type Theme = {
  /** 캔버스 배경(빈 칸 "_"의 바탕). */
  background: string;
  /** 격자선 색 (gridLines 옵션이 true일 때). */
  gridLine: string;
  /**
   * 셀 채움색 맵: 행 문자 → 색. 필수 키 = "G"(쓰레기)·"D"(더미)·7미노("I".."Z").
   * "_"(빈 칸)은 채우지 않으므로 키가 없다. D는 G와 명확히 구분되는 무채색이어야 한다(명세 §4-1).
   */
  cell: Record<string, string>;
  /** D·미지 문자 셀의 외곽선 색 — G와의 시각 구분을 위한 다른 테두리(명세 §4-1). */
  dummyBorder: string;
  /** 고스트 반투명 채움색. */
  ghostFill: string;
  /** 고스트 외곽선 색 (falling과 즉시 구분). */
  ghostStroke: string;
  /**
   * 하이라이트 외곽선 색 — 셀 채움이 아니라 셀 경계 안쪽(inside) 스트로크(RD-8).
   * 인접 하이라이트끼리 맞닿은 변은 생략되어 묶음의 바깥 윤곽만 남는다(오토 타일링, RD-9).
   */
  highlight: string;
};

/** BoardRenderer 옵션. 부분 지정 시 나머지는 기본값(명세 §2). */
export type RendererOptions = {
  /** 셀 한 변의 CSS px 크기. resize와 병용 시 fit 계산은 호출자 책임. */
  cellSize: number;
  /** 가시 영역 높이(행). 기본 20. */
  visibleHeight: number;
  /** 가시 영역 위로 보여줄 버퍼 행 수. 기본 2 (그 위는 클리핑). */
  bufferPeek: number;
  /** 색·격자·고스트·하이라이트 테마. */
  theme: Theme;
  /** 격자선 표시 여부. 기본 true. */
  gridLines: boolean;
};

/** render 1회에 그릴 한 프레임 (명세 §2). */
export type RenderFrame = {
  /** 보드 셀. notes 인코딩 그대로 수용(트림된 상단 = 빈 칸). */
  board: BoardRows;
  /** 조작 중 미노. 재생 실좌표·시뮬레이터 조작 미노 공용. 페이지 뷰에선 생략/null. */
  falling?: { type: PieceType; cells: CellPos[] } | null;
  /** 착지 예상 위치(고스트). */
  ghost?: CellPos[] | null;
  /** PageState.overlays 인코딩 그대로. */
  overlays?: { highlights?: string[] };
  /** 라인 클리어 연출(선택). progress 0~1은 호출자가 공급. */
  effects?: { clearedRows?: number[]; progress?: number };
};

/** renderThumbnail 입력 — 페이지 상태의 표시 부분(falling 없음, D-6). */
export type ThumbnailState = { board: BoardRows; overlays?: PageState["overlays"] };
