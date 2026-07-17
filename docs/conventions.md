# Tetorial 공통 규약: 모노레포 구조 · 개발 규칙 · 에이전트 워크플로우 (`docs/conventions.md`)

> 모든 에이전트가 작업 전에 읽는 문서. `docs/DECISIONS.md`(프로젝트 결정 로그)와 함께 SSOT를 구성한다.
> 우선순위: 모듈 명세(specs) > 이 문서 > 코드 주석. 충돌 시 상위 문서가 이긴다.

---

## 1. 저장소 구조 (pnpm workspaces)

```
tetorial/
├── apps/
│   └── web/                    # Astro 앱 (Cloudflare Pages 배포 대상 — D-19)
│       └── src/
│           ├── pages/          # 라우트
│           ├── components/     # Preact 아일랜드·하위 컴포넌트 (인터랙티브 UI)
│           └── ...
├── workers/
│   └── gist-proxy/             # Cloudflare Worker (검증 + Gist API 프록시)
├── packages/
│   ├── types/                  # @tetorial/types    — notes/meta 스키마 타입 + 런타임 검증기
│   ├── engine/                 # @tetorial/engine   — 자체 엔진 (의존성 0)
│   ├── input/                  # @tetorial/input    — DAS/ARR/SDF 입력 레이어
│   ├── renderer/               # @tetorial/renderer — 캔버스 보드 렌더러 (프레임워크 비종속)
│   ├── replay-tetrio/          # @tetorial/replay-tetrio — ttrm/ttr 파서 + 재생 컨트롤러 (triangle 래퍼)
│   ├── adapter-tetrio/         # @tetorial/adapter-tetrio — triangle 상태 → notes Snapshot
│   └── sim/                    # @tetorial/sim      — 시뮬레이터 코어 (노트/페이지 상태 머신, UI 무관)
├── docs/
│   ├── DECISIONS.md            # 프로젝트 결정 로그
│   └── conventions.md          # 이 문서 (명세는 main에 두지 않는다 — WORKFLOW §4)
├── fixtures/                   # 골든 테스트용 리플레이 샘플 (§4 주의사항)
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── eslint.config.js  /  .prettierrc
└── .github/workflows/          # CI/CD (§6)
```

**의존 방향 (위반 금지):**

```
apps/web → 모든 packages
workers/gist-proxy → types
sim → types, engine
replay-tetrio → types, adapter-tetrio, @haelp/teto
adapter-tetrio → types, @haelp/teto(peer)
input → engine
renderer → types (engine·sim의 상태를 그리지만 타입으로만 결합)
engine → types만. 그 외 의존성 0 (엔진 명세 §3)
types → 의존성 0 (검증기 포함 자급자족)
```

- 역방향·순환 의존 금지. 특히 **engine/sim/types에서 triangle(@haelp/teto) 임포트 금지** (D-11).

## 2. 패키지 규약

- **internal-packages 패턴 (빌드 없음)**: 각 패키지는 `"main": "./src/index.ts"`로 TS 소스를 직접 export한다. 번들·트랜스파일은 소비자(Astro/Vite, Vitest, wrangler)가 수행한다. 에이전트는 패키지에 빌드 스크립트·dist를 만들지 않는다. (배포용 라이브러리가 아니라 앱 내부 모듈이므로)
- 모든 패키지 ESM only (`"type": "module"`), `"sideEffects": false`.
- 공개 API는 `src/index.ts`에서만 export. 소비자는 딥 임포트(`@tetorial/engine/src/...`) 금지.
- 런타임 의존성 추가는 **총괄 사전 승인 필수.** 현재 승인 목록: `@haelp/teto`(replay-tetrio·adapter-tetrio만), `preact`(apps/web만), `astro` 계열(apps/web), `pako`(gzip — apps/web·workers), 런타임 검증기 `zod`(types + apps/web의 Worker 응답 검증 — apps-web 명세 §4, 2026-07-12 목록 정합). devDependencies는 자유(단 lint/test 공통 설정과 충돌 금지).
- `@tetorial/types`의 공개 타입 변경 = 스키마 변경이다. 반드시 명세 문서 개정과 함께, 총괄 승인 하에 수행한다.

## 3. 코드 규칙

- **TypeScript strict** (`tsconfig.base.json`에서 `strict: true`, `noUncheckedIndexedAccess: true`). `any`·`@ts-ignore`·`as unknown as` 금지 (불가피하면 사유 주석 + 총괄 보고).
- Node 22 LTS · pnpm 고정 (`packageManager` 필드 + corepack). 버전은 `.nvmrc`와 일치시킨다.
- 포맷팅은 Prettier가 전담, 스타일 논쟁 금지. ESLint는 논리 오류·의존 방향 검사(`import/no-restricted-paths`로 §1 의존 방향 강제).
- 네이밍: 파일 kebab-case, 타입 PascalCase, 값 camelCase. 스키마 필드명은 명세 문서와 철자까지 일치.
- 주석·문서 언어: 한국어 기본. 단 스키마 필드명·API 식별자는 영문.
- 런타임 검증기: `@tetorial/types`에 **zod**를 채택해 notes/meta 스키마의 파서·검증기를 타입과 함께 제공한다 (Worker와 클라이언트가 공유). zod는 types의 유일한 승인 의존성.

## 4. 테스트 규약

- 러너: **Vitest** (workspace 모드, 루트에서 `pnpm test`로 전체 실행).
- 위치: 각 패키지 `src/**/*.test.ts` (colocate).
- **수용 기준 추적성**: 명세의 수용 기준 ID를 테스트 이름에 명시한다. 예: `describe("E-1 결정론", ...)`, `it("A-3 counters -1 규약", ...)`. 리뷰어(총괄)는 이 ID로 완료를 대조한다.
- 골든 테스트 fixture: `fixtures/`에 배치, 테스트에서 상대 경로로 로드. 커밋된 fixture는 **익명화본**이다(D-6 — `tools/anonymize-replay.mjs`로 유저명·ID 치환, 게임 데이터 무수정). 새 fixture 추가는 소유자 제공·승인 + 익명화 도구 경유 필수. 에이전트가 임의의 타인 리플레이나 원본(미익명화) 리플레이를 커밋하는 것을 금지한다. fixture 의존 테스트는 부재 시 skip 패턴 유지(fixture 없는 환경 대비).
- triangle 대조 테스트(E-3, E-4, A-1 등)는 `@haelp/teto`를 devDependency로 쓸 수 있다 — 단 대조 대상 패키지(engine)의 런타임 의존이 아닌 테스트 전용임을 유지.

## 5. 에이전트 워크플로우

1. **착수 전 필독**: `docs/DECISIONS.md` → `docs/conventions.md`(이 문서) → 담당 모듈 명세 → 명세의 "참고자료" 목록.
2. **작업 경계**: 담당 패키지 디렉터리 안에서만 수정한다. 다음은 총괄 승인 없이 수정 금지: `packages/types`, `docs/`, 루트 설정 파일, 타 패키지.
3. **모호성 처리**: 명세가 모호하거나 명세 간 충돌을 발견하면 **임의로 결정하지 말고**, 담당 패키지에 `QUESTIONS.md`를 만들어 질문을 남기고 해당 부분을 보류한 채 나머지를 진행한다. 총괄이 명세를 개정한 뒤 재개한다.
4. **완료 정의 (DoD)**: ① 명세의 수용 기준 테스트 전부 통과 ② `pnpm lint` · `pnpm typecheck` · `pnpm test` 루트 통과 ③ 패키지 README에 공개 API 사용 예시 갱신 ④ QUESTIONS.md 잔여 항목 없음(또는 보류 사유 명시).
5. **커밋/PR**: Conventional Commits (`feat(engine): ...`, `fix(sim): ...`). PR 1개 = 수용 기준의 응집된 묶음 1개. PR 본문에 충족한 수용 기준 ID를 나열한다. **현 운영**: 원격 PR 대신 총괄 로컬 게이트 리뷰 → main 직push. 커밋 메시지·묶음 규칙은 동일하게 적용하고, PR 절차는 원격 협업 도입 시 재론.
6. **병렬 세션 격리 (WORKFLOW §7 참조)**: 같은 웨이브의 병렬 작업은 세션마다 `git worktree`로 체크아웃을 분리해 자기 브랜치에서 작업한다. worktree는 bare 저장소 구조로 작업 디렉터리 밖에 둔다(WORKFLOW §7) — 총괄이 생성·정리한다. (`.gitignore` 등의 `.worktrees/` 등재는 과거 리포 내부 방식의 잔재로, 무해하여 유지.) 부득이 한 체크아웃을 공유하면 커밋·브랜치 조작을 직렬화한다(먼저 끝난 세션이 대기). 유일한 공유 파일인 `pnpm-lock.yaml`의 충돌은 총괄이 병합 시 해소한다.
7. **금지사항 요약**: 명세에 없는 공개 API 추가(제안은 QUESTIONS.md로) / 승인 없는 런타임 의존성 / 의존 방향 위반 / `Math.random`·`Date`의 결정론 패키지(engine, sim) 내 사용 / 시크릿·토큰의 코드·로그 노출 / localStorage 직접 접근(apps/web의 storage 유틸 경유).

## 6. CI/CD (GitHub Actions)

- **PR 워크플로우** (`ci.yml`): checkout → pnpm 캐시 → `pnpm install --frozen-lockfile` → `pnpm lint && pnpm typecheck && pnpm test`. 필수 통과(브랜치 보호).
- **웹 배포** (`deploy-web.yml`): main push 시 `apps/web` 빌드 → **Cloudflare Pages 직접 업로드**(`wrangler pages deploy`, D-19). 필요 시크릿: `CLOUDFLARE_API_TOKEN`(Pages Edit 권한)·`CLOUDFLARE_ACCOUNT_ID`.
  - **base path 규약 (D-19)**: 사이트는 `https://tetorial.pages.dev` 루트 서빙. `astro.config.mjs`에 `site: "https://tetorial.pages.dev"` + `base: "/"`(기본값). 내부 링크·에셋의 `import.meta.env.BASE_URL` 헬퍼 경유는 **계속 의무**(향후 하위 경로 이전 대비) — 루트 절대 경로 하드코딩은 여전히 금지.
- **Worker 배포**: 자동화 워크플로 없음. 수동 `pnpm --filter @tetorial/gist-proxy deploy`(wrangler)로 배포한다. 자동화는 #20(I-1)에서 검토 중. 시크릿은 §7.
- 동적 라우트: 경로형 딥링크(`/replays/{id}`)는 `apps/web/public/_redirects`의 200 리라이트로 서빙한다(D-19 — 404 트릭 불필요). 경로 기반 동적 라우트를 새로 만들 때는 정적 생성 가능 여부를 먼저 검토하고, 불가하면 `_redirects`에 등재한다. **주의**: 프록시(200) 규칙이 활성이면 Pages 기본 슬래시 정규화가 전역에서 꺼진다 — 슬래시 없는 페이지 경로는 `_redirects`에 명시 리다이렉트로 등재해야 한다 (2026-07-17 실측).

## 7. 시크릿·환경 관리

- **GIST_PAT** (부계정 fine-grained PAT, gist 스코프): Cloudflare Worker secret으로만 존재 (`wrangler secret put GIST_PAT`). 리포·로그·에러 메시지에 절대 노출 금지. 로컬 개발은 `workers/gist-proxy/.dev.vars` (gitignore 대상).
- GitHub Actions 시크릿은 Cloudflare 배포용 2종만: `CLOUDFLARE_API_TOKEN`(Pages Edit 권한)·`CLOUDFLARE_ACCOUNT_ID`. GIST_PAT는 Actions에 두지 않는다(배포 파이프라인이 알 필요 없음).
- 웹 앱이 바라보는 Worker URL은 `PUBLIC_WORKER_URL` 환경변수로 주입 (dev: `wrangler dev` 로컬 주소 / prod: workers.dev 또는 커스텀 라우트).
- 클라이언트 localStorage 키 네임스페이스: `tetorial:` 접두사 (예: `tetorial:editKey:<gistId>`, `tetorial:clientId`).

## 8. 모듈별 명세 현황 (위임 준비 상태)

| 패키지 | 선행 |
|---|---|
| types | — |
| engine | — |
| adapter-tetrio | — |
| input | engine |
| replay-tetrio | adapter-tetrio |
| sim | engine |
| renderer | — |
| gist-proxy | — |
| apps/web | 전 패키지 |

착수 순서·병렬 트랙은 `docs/WORKFLOW.md` 웨이브 구성을 따른다.
