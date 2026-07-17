// 노트 생성 한도 차단 (apps-web-m1d §4 — M1d-6).
// 기준값은 @tetorial/types의 NOTES_LIMITS.maxNotesPerReplay가 유일 출처(하드코딩 금지).
// 합산은 현재 열린 리플레이의 **모든** notes-*.json 노트 수 합 — 자기 파일만이 아니다.
// 차단 지점은 신규 노트 생성 진입(분기 → 시뮬레이터 진입 버튼)이다.
// 재편집(existing)은 노트 수가 늘지 않으므로 차단하지 않는다 — 재편집 UI(#37)가 생겨도
// 이 규칙은 유지할 것(M2가 M1d 명세를 계승하지 않으므로 여기 주석으로 남긴다).
import { NOTES_LIMITS } from "@tetorial/types";
import type { LimitViolation } from "@tetorial/sim";

/** 리플레이(=Gist) 전체 노트 수 합산 — 모든 노트 파일 대상. */
export function countReplayNotes(files: readonly { notes: readonly unknown[] }[]): number {
  return files.reduce((sum, f) => sum + f.notes.length, 0);
}

/**
 * 한도 도달 시 신규 노트 생성 진입을 차단하는 사유 문구(한도값 포함 — 상수에서 읽음).
 * 미달이면 null(정상 진입).
 */
export function noteLimitReason(files: readonly { notes: readonly unknown[] }[]): string | null {
  if (countReplayNotes(files) < NOTES_LIMITS.maxNotesPerReplay) return null;
  return `이 리플레이의 노트가 한도(${NOTES_LIMITS.maxNotesPerReplay}개)에 도달해 새 노트를 만들 수 없습니다.`;
}

/**
 * 업로드 대상 파일을 요청본으로 **교체**했을 때의 리플레이 합산 노트 수.
 * Worker의 교차 검사(gist-proxy assertReplayNotesLimit — M2E-1)와 같은 기준이다:
 * 대상 파일의 기존 노트는 세지 않고 incomingCount로 대체한 뒤 나머지 파일을 더한다.
 */
export function projectedReplayNoteCount(
  files: readonly { clientId: string; notes: readonly unknown[] }[],
  clientId: string,
  incomingCount: number,
): number {
  const others = files.filter((f) => f.clientId !== clientId);
  return incomingCount + countReplayNotes(others);
}

/**
 * 묶음 업로드의 합산 한도 사전 검사(m3b AW-17). 위반이면 LimitViolation, 통과면 null.
 * 노트 수가 늘지 않는 수정은 이미 한도에 도달한 리플레이에서도 통과한다(Worker와 동일 — 초과 "생성"만 거부).
 */
export function replayLimitViolation(
  files: readonly { clientId: string; notes: readonly unknown[] }[],
  clientId: string,
  incomingCount: number,
): LimitViolation | null {
  const total = projectedReplayNoteCount(files, clientId, incomingCount);
  if (total <= NOTES_LIMITS.maxNotesPerReplay) return null;
  return {
    path: "notes",
    limit: NOTES_LIMITS.maxNotesPerReplay,
    actual: total,
    message: `리플레이당 노트 한도(${NOTES_LIMITS.maxNotesPerReplay}개)를 초과합니다 (${total}개).`,
  };
}
