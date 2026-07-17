# Tetorial — CLAUDE.md

모던 테트리스 실력 향상 가이드 서비스 → [docs/PRODUCT.md](docs/PRODUCT.md)
현재 구현: TETR.IO 리플레이 재생·분석 도구.
pnpm workspaces 모노레포 (Node ≥22, pnpm 10.13.1).

## 명령어

로컬 셸에서 pnpm은 PATH 프리픽스가 필요하다 → [docs/dev-env.md](docs/dev-env.md) 참조.

```sh
pnpm install                          # 의존성 설치
pnpm lint                             # ESLint (루트 일괄)
pnpm typecheck                        # 전 패키지 tsc --noEmit (pnpm -r)
pnpm test                             # Vitest 전체 실행
pnpm format / pnpm format:check       # Prettier
pnpm --filter @tetorial/web dev       # 웹 앱 개발 서버 (Astro)
pnpm --filter @tetorial/web build     # 웹 앱 빌드
pnpm --filter @tetorial/web e2e       # Playwright E2E
pnpm --filter @tetorial/gist-proxy deploy   # Worker 배포 (wrangler)
```

CI(`.github/workflows/ci.yml`): lint · typecheck · test + `node tools/check-acceptance.mjs`(수용 기준 ID ↔ 테스트 대조) + 웹 E2E. 배포(`deploy-web.yml`): main push 시 apps/web 빌드 → Cloudflare Pages 직접 업로드(`https://tetorial.pages.dev`, D-19). 워커 배포 워크플로는 없음(수동 deploy 스크립트, 자동화는 #20).

## 패키지 구조

```
apps/web            @tetorial/web            — Astro + Preact 아일랜드 웹 앱 (Pages 배포 대상)
workers/gist-proxy  @tetorial/gist-proxy     — Cloudflare Worker (검증 + Gist API 프록시)
packages/types      @tetorial/types          — notes/meta 스키마 타입 + zod 런타임 검증기
packages/engine     @tetorial/engine         — 자체 테트리스 엔진 (런타임 의존성 0). 룰 근거는 appendix-engine-rules.md
packages/input      @tetorial/input          — DAS/ARR/SDF 입력 레이어
packages/renderer   @tetorial/renderer       — 캔버스 보드 렌더러 (프레임워크 비종속)
packages/replay-tetrio @tetorial/replay-tetrio — ttrm/ttr 파서 + 재생 컨트롤러 (@haelp/teto 래퍼)
packages/adapter-tetrio @tetorial/adapter-tetrio — triangle 상태 → notes Snapshot 변환
packages/sim        @tetorial/sim            — 시뮬레이터 코어 (노트/페이지 상태 머신, UI 무관)
fixtures/           골든 테스트용 리플레이 (익명화본만 커밋)
```

빌드 없는 internal-packages 패턴: 각 패키지는 `src/index.ts`를 직접 export하고, 번들은 소비자(Astro/Vitest/wrangler)가 수행한다.

## 금지사항 (요약 — 전체 규칙은 conventions)

- 의존 방향 위반 금지 — 특히 engine/sim/types에서 `@haelp/teto` 임포트 금지 (허용 그래프: conventions §1).
- `packages/engine`·`packages/sim`에 `Math.random`·`Date` 금지 (결정론).
- 승인 없는 런타임 의존성 추가 금지 (승인 목록: conventions §2). 딥 임포트(`@tetorial/*/src/...`) 금지.
- 시크릿(GIST_PAT, editKey)을 코드·로그·에러 메시지에 노출 금지.
- 웹 내부 링크·에셋은 base path 헬퍼 경유 — 루트 절대 경로 하드코딩 금지. localStorage 직접 접근 금지(storage 유틸 경유).
- 미익명화 리플레이 fixture 커밋 금지 (`tools/anonymize-replay.mjs` 경유).

## 문서

- Tetr.io 룰 원문 (킥·스핀·카운터) — 규범: [docs/appendix-engine-rules.md](docs/appendix-engine-rules.md)
- 코드·테스트·패키지 규칙: [docs/conventions.md](docs/conventions.md)
- 로컬 환경 제약 (pnpm PATH, 버전 고정): [docs/dev-env.md](docs/dev-env.md)
- 작업 방식: [docs/WORKFLOW.md](docs/WORKFLOW.md)
- 결정 근거: [docs/DECISIONS.md](docs/DECISIONS.md)
