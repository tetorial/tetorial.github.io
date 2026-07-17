// Next·Hold 프리뷰 표시 계산부 (m3b §5 — AW-18). 그리기 자체는 renderer의 renderPiecePreview(RD-4)가
// 하고, 여기서는 "무엇을 몇 개 넘길지"만 정한다 — 재생 뷰(PlaybackView)와 시뮬레이터 뷰(WorkView)가
// next·hold 형태를 공유하므로 두 화면이 같은 매핑을 쓴다.
import type { PieceType } from "@tetorial/types";

/** 표시할 넥스트 개수 상한(기존 텍스트 표기 2곳과 동일 — 화면 폭 기준). */
export const NEXT_PREVIEW_COUNT = 5;

/** 넥스트 큐 → 표시 슬라이스. 큐가 짧으면 있는 만큼만(패딩 없음 — 빈 칸을 그리지 않는다). */
export function nextPreviewSlice(
  next: readonly PieceType[],
  count: number = NEXT_PREVIEW_COUNT,
): PieceType[] {
  if (count <= 0) return [];
  return next.slice(0, count);
}

/** 홀드 프리뷰 입력. 비어 있으면 null(그릴 조각 없음 — 자리표시자는 UI 몫). */
export interface HoldPreview {
  piece: PieceType;
  /** 이번 미노에서 홀드를 이미 썼는가 — 흐리게 표시하는 근거. 재생 뷰·작업 뷰 공통 필드. */
  locked: boolean;
}

export function holdPreview(hold: {
  piece: PieceType | null;
  locked: boolean;
}): HoldPreview | null {
  return hold.piece === null ? null : { piece: hold.piece, locked: hold.locked };
}
