# QUESTIONS — W0 (infra + types) — **전 항목 처리 완료 (2026-07-11, 총괄)**

> conventions §5-3에 따른 기록. 보류한 작업은 없었고, 아래 각 항목에 총괄 답변을 기입했다.
> 답변에 따른 명세 개정: notes-schema §4·§7-1·결정 로그 7 / meta-schema §2·§5-1·§8(신설)·결정 로그 4 /
> gist-proxy §4(저장 본문 규범) / conventions §1(트리 주석). 코드 반영: 서브 스키마·한도 상수 export, ttr refine.

## 채택한 해석 (확인 요청)

1. **해시(hex)는 소문자만 허용** — `editKeyHash`·`replay.sha256`을 `^[0-9a-f]{64}$`로 검증.
   > **총괄: 승인.** notes §4·meta §2에 "(소문자)" 명시함.
2. **meta의 `title`·`description` 길이도 코드포인트 기준으로 통일**.
   > **총괄: 승인.** meta §2에 "(유니코드 코드포인트 기준)" 명시함.
3. **meta 명세에는 전체 예시 JSON이 없다** — 대표 예시로 대체했다.
   > **총괄: 명세 개정으로 해소.** 그 대표 예시를 meta §8 공식 예시로 승격(문구 1곳 정정: "7라운드 중").
   > 테스트는 §8 자구 그대로를 사용하도록 교체 완료.
4. **`format:"ttr"` ⇒ `rounds.totalInOriginal === 1` 교차 검증은 넣지 않았다**.
   > **총괄: 검증 규칙으로 승격 (재론 가능).** 위반은 클라이언트 버그이므로 조기 거부가 낫다.
   > meta §5-1에 규칙 추가, refine + 테스트 반영 완료.
5. **id 유일성은 검증기에 포함** — 구조 검증의 일부로 refine 강제.
   > **총괄: 승인.** notes §7-1에 명시 보강함.
6. **검증기는 strip 모드** — 미지 필드는 파싱 결과에서 제거.
   > **총괄: 승인.** Worker가 zod 파싱 결과를 직렬화해 저장하는 것을 gist-proxy §4 규범으로 명시
   > (strip = 정화 계층. 원문 JSON 그대로 중계 금지). strict 전환 없음.
7. **자체 수용 기준 ID 부여** (W0a-1·W0a-2·W0b-1~4).
   > **총괄: 승인.** 이후 웨이브는 명세의 공식 ID를 사용하므로 특례로 종결.

## 치환 작업(W0-a 특례)에서 제외한 것 (고지)

8. kickoff §1 매핑표의 좌변 구 파일명 유지.
   > **총괄: 타당.** 기록으로서의 의미 보존이 맞다.
9. triangle-data.json 내 `note` 필드 문자열 유지 (값 무수정 원칙·E-3 동일성).
   > **총괄: 타당.** 데이터 파일 무수정 원칙이 우선한다.
10. conventions §1 트리 주석 `spec-*.md` 불일치.
    > **총괄: 정리 완료.** `(모듈명.md — engine.md, sim.md 등)`으로 개정함.

## 제안 (명세에 없는 공개 API)

11. **서브 스키마 export** (`snapshotSchema` 등).
    > **총괄: 승인.** `originSchema`·`snapshotSchema`·`pageSchema`·`pageStateSchema` 4종 공개.
    > 소비처: adapter-tetrio A-7 산출물 검증, sim 페이지 상태 검증. index.ts·README 반영 완료.
12. **한도 상수 export**.
    > **총괄: 승인.** `NOTES_LIMITS`·`META_LIMITS` 공개. "직렬화 800KB 검사는 Worker 몫" 해석도 승인 —
    > 상수는 Worker(gist-proxy)와 클라이언트(업로드 전 표시)가 단일 출처로 공유한다.

## 인프라 메모 (W0-a)

- vitest 3 고정(로컬 Node 22.11.0, vitest 4는 Node ≥ 22.12 요구) — **총괄: 확인.** Node 승급 시 vitest 4 승격은 백로그.
- typescript 6.0.x·eslint 9.x 피어 범위 고정 — **총괄: 확인.**
- `@tetorial/*` paths 선언(tsconfig.base.json) — **총괄: 확인.**
