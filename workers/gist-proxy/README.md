# @tetorial/gist-proxy

Cloudflare Worker. **GIST_PAT를 보유한 유일한 지점**으로서 Gist 생성·노트 쓰기·목록 조회를
검증 후 프록시한다 (D-3). 게임 로직은 모른다 — 인증·구조·크기·무결성만 검증한다 (D-4).

- 명세(SSOT): [docs/specs/gist-proxy.md](../../docs/specs/gist-proxy.md)
- 런타임 의존성: `@tetorial/types`(zod 검증기)만. Web 표준 API만 사용(Node 전용 API 금지).

## 엔드포인트

| 메서드·경로            | 역할                                    | GitHub API 소비                              |
| ---------------------- | --------------------------------------- | -------------------------------------------- |
| `POST /g`              | 리플레이 Gist 생성 (meta + replay 본문) | `POST /gists` ×1                             |
| `PUT /g/:gistId/notes` | 노트 파일 생성/수정                     | `GET /gists/:id` ×1 + `PATCH /gists/:id` ×1  |
| `GET /g/:gistId`       | 파일 목록·raw URL 조회 (본문 없음)      | `GET /gists/:id` ×1 (엣지 캐시 60초 미스 시) |
| `GET /healthz`         | 상태 확인                               | 0                                            |

이외 경로·메서드는 404/405. 응답은 항상 JSON.

## 요청·응답 예시

### 리플레이 Gist 생성

```http
POST /g
Content-Type: application/json
Origin: https://<허용 origin>

{ "meta": <MetaFile>, "replayBody": "<gzip+base64 문자열>", "turnstileToken": "<선택>" }
```

```jsonc
// 201
{
  "gistId": "abc123",
  "index": {
    "gistId": "abc123",
    "files": [/* {name,size,rawUrl,truncated} */],
    "fetchedAt": "...",
  },
}
```

- `meta`는 `@tetorial/types`의 `metaFileSchema`로 검증되고, **저장 본문은 파싱 결과를 직렬화**한다
  (스키마에 없는 필드는 strip 정화 — §4 저장 본문 규범).
- `meta.replay.sha256`·`bytes`는 **base64 디코드 → gunzip 후 원문**과 대조한다(불일치 시 422).
- `meta.createdAt`은 서버 시각으로 덮어쓴다. Gist description은 `[tetorial] <title> · <format> · rounds <map>`.

### 노트 파일 생성/수정

```http
PUT /g/:gistId/notes
Content-Type: application/json
Origin: https://<허용 origin>

{ "clientId": "<12자>", "editKey": "<클라이언트 시크릿>", "file": <NotesFile>, "turnstileToken": "<선택>" }
```

```jsonc
// 200
{
  "gistId": "abc123",
  "file": "notes-<clientId>.json",
  "index": {/* GistIndex — 저장 직후 화면 갱신용 */},
}
```

- **신규 파일**: `editKeyHash := SHA-256(editKey)`를 서버가 계산해 기록(클라이언트가 보낸 해시는 무시).
- **기존 파일**: `SHA-256(editKey)`가 기존 `editKeyHash`와 일치해야 수정 가능(불일치 403). 일치 시에도
  `editKeyHash`·`clientId`·`createdAt`은 기존 값을 강제 유지, `updatedAt`은 매번 서버 시각.
- PATCH 페이로드에는 **오직 `notes-<clientId>.json` 하나만** 포함 — replay·meta·타인 노트 격리 (§4-2).

### 목록 조회

```http
GET /g/:gistId
```

`{ gistId, files: [{ name, size, rawUrl, truncated }], fetchedAt }`. **본문은 포함하지 않는다** —
클라이언트가 `rawUrl`(리비전 고정 URL)을 직접 병렬 fetch한다. 60초 엣지 캐시.

### 오류 응답

`{ code, message, detail? }` (message는 한국어). 코드·상태 대응은 명세 §6 표.
시크릿(`GIST_PAT`·`editKey`)과 업스트림 본문은 어떤 응답·로그에도 포함되지 않는다.

## 설정 (conventions §7)

| 종류   | 이름               | 설명                                                                |
| ------ | ------------------ | ------------------------------------------------------------------- |
| secret | `GIST_PAT`         | 부계정 fine-grained PAT (gist 스코프). `wrangler secret put`으로만. |
| secret | `TURNSTILE_SECRET` | 선택. 설정 시에만 Turnstile 검증 활성.                              |
| var    | `GIST_OWNER`       | 부계정 사용자명 (로그·관리용).                                      |
| var    | `ALLOWED_ORIGINS`  | CORS 허용 origin 목록 (쉼표 구분).                                  |
| var    | `WRITE_ENABLED`    | `"false"`면 전체 쓰기 차단(비상 스위치). 미설정/그 외 = 활성.       |

로컬 개발은 `.dev.vars`(gitignore, `.dev.vars.example` 참조). **Rate limiting은 Worker 코드가 아니라
Cloudflare 대시보드 rule**로 쓰기 경로에 IP당 분당 상한을 건다(권고 초기값 10/min) — 코드만 보고
방어 부재로 오판하지 말 것 (명세 §5-3).

## 개발·테스트

```sh
pnpm --filter @tetorial/gist-proxy typecheck
pnpm vitest run --project gist-proxy      # 또는 루트 pnpm test
wrangler dev                               # 로컬 실행 (.dev.vars 필요)
```

테스트는 `@cloudflare/vitest-pool-workers`로 실제 workerd 런타임에서 돈다. GitHub API는
`fetchMock`(cloudflare:test)으로 대체하며 **실 호출은 하지 않는다**. 수용 기준 W-1~W-7을
`describe/it` 이름의 ID로 추적한다.

> 구현 메모: 기존 노트 파일 대조는 `GET /gists` 응답의 **인라인 `content`**(≤1MB, notes는 항상 해당)를
> 사용해 추가 네트워크 호출 없이 처리한다(§4-2의 "raw_url로 읽어" 의도를 쿼터 0으로 충족). truncated인
> 경우에만 `raw_url` fetch로 폴백한다 — 어느 쪽도 GitHub API 쿼터를 쓰지 않는다(W-7).

## 배포 (소유자 수동 — 명세 §9)

1. 부계정에서 fine-grained PAT 발급 (gist 스코프, 만료 설정)
2. `wrangler secret put GIST_PAT` (필요 시 `TURNSTILE_SECRET`)
3. `wrangler deploy` → `GET /healthz`로 확인
4. 실물 생성·수정·열람 스모크
5. Cloudflare 대시보드에서 쓰기 경로 rate limiting rule 설정
