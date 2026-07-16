/// <reference types="astro/client" />

// PUBLIC_WORKER_URL: gist-proxy Worker의 베이스 URL(conventions §7 — dev: wrangler 로컬 주소 /
// prod: workers.dev 또는 커스텀 라우트). PUBLIC_ 접두이므로 클라이언트 번들에 주입된다.
interface ImportMetaEnv {
  readonly PUBLIC_WORKER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
