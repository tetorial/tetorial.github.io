# QUESTIONS — m4/a-draft-removal (packages/sim)

## Q1. README 수용 기준 목록의 "S-4 드래프트 왕복" 잔존 (보류)

- 위치: `packages/sim/README.md` "## 수용 기준" 절 (테스트 ID 나열 문단)
- 상황: 명세 §2에 따라 `src/draft.test.ts`(S-4 검증체)를 삭제했으므로 목록의 "S-4 드래프트 왕복"은 존재하지 않는 테스트를 가리킨다. 신설된 S-9(`src/api-surface.test.ts`)도 목록에 없다.
- 왜 보류: 명세 §2의 README 수정 대상은 `restoreAuthoringSession` 표 행 + 드래프트 예시 두 곳으로 전량 열거되어 있고, §3이 목록 밖 드래프트 언급의 임의 처리를 금지한다. S-4 삭제 반영·S-9 등재는 목록 밖 갱신이라 총괄 판단을 기다린다.
- 제안: 해당 문단에서 "S-4 드래프트 왕복" 제거 + "S-9 드래프트 API 소멸" 추가.
