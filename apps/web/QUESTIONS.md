# QUESTIONS — m4/a-draft-removal (apps/web)

## Q1. README 수용 기준 표의 AW-6 행 잔존 (보류)

- 위치: `apps/web/README.md` "## 수용 기준 (AW-1 ~ AW-10)" 표의 AW-6 행("드래프트 왕복 복구(미페이지 보드 포함) — simulator.test.ts·storage.test.ts")
- 상황: 명세 §2에 따라 `simulator.test.ts`의 드래프트 복원 케이스와 `storage.test.ts`의 draft 케이스를 제거했으므로 이 행은 존재하지 않는 테스트를 가리킨다. 신설된 AW-19는 표에 없다.
- 왜 보류: 명세 §2의 apps/web README 수정 대상은 `restoreSimulator` 언급 문장(:88) 한 곳으로 전량 열거되어 있고, §3이 목록 밖 드래프트 언급의 임의 처리를 금지한다. 수용 기준 표 개정은 목록 밖이라 총괄 판단을 기다린다.
- 제안: AW-6 행을 제거(또는 "제거됨 — m4a" 표기)하고 AW-19 행("드래프트 잔재 소멸 — simulator.test.ts·storage.test.ts")을 추가.
