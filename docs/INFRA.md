# 인프라 사실 (`docs/INFRA.md`)

> 저장소 밖(GitHub 설정·Cloudflare 대시보드)에 존재해 코드로 추적되지 않는 사실의 유일한 기록.
> 여기 적힌 것이 실제 설정과 다르면 이 문서를 고치는 것이 아니라 어느 쪽이 옳은지 소유자가 판정한다.

## GitHub 저장소 설정

- **변수** `PUBLIC_WORKER_URL` — 웹 빌드가 Worker 엔드포인트로 사용 (`deploy-web.yml`·CI E2E).
- **시크릿** `CLOUDFLARE_API_TOKEN` · `CLOUDFLARE_ACCOUNT_ID` — Pages 직접 업로드용 (`deploy-web.yml`, D-19).

## Cloudflare

- **Pages**: main push 시 `apps/web` 빌드 산출물 직접 업로드 → `https://tetorial.pages.dev` (D-19).
- **Worker**(gist-proxy): 수동 배포 (`pnpm --filter @tetorial/gist-proxy deploy`, 자동화는 #20).
  `/healthz` 헬스 체크. 허용 오리진은 Worker 환경 변수 `ALLOWED_ORIGINS`.
- **Rate limit rule** (대시보드 설정 — git 밖, 위치 재검토는 #18):
  `starts_with(path,"/g") and method in {POST,PUT}` → **2회/10초**.
