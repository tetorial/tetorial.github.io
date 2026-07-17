# @tetorial/web — 총괄 확인 요청

## Q1. eslint ignores에 `apps/web/.wrangler/` 미등재 (M3-B 발견, 보류)

**증상**: 로컬에서 E2E(`pnpm --filter @tetorial/web e2e`)를 한 번 돌리면 `wrangler pages dev`가
`apps/web/.wrangler/tmp/**`에 shim 파일을 만들고, 이후 루트 `pnpm lint`가 그 생성 파일에서
`no-unused-vars` 등으로 실패한다. `.wrangler/`는 `apps/web/.gitignore`에는 있으나
`eslint.config.js`의 ignores 목록에는 없다 — 같은 목록에 `dist/`·`.astro/`·`playwright-report/`·
`test-results/`는 이미 같은 사유(Q3)로 등재돼 있어 누락으로 보인다.

**영향**: CI는 lint → test → E2E 순서라 영향 없음. 로컬에서 E2E 후 lint 시에만 발생하며
`rm -rf apps/web/.wrangler`로 우회된다.

**보류 사유**: `eslint.config.js`는 루트 설정 파일이라 총괄 승인 없이 수정 금지(conventions §5-2).
승인 시 ignores에 `"apps/web/.wrangler/"` 한 줄 추가로 끝난다.
