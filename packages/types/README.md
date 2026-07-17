# @tetorial/types

notes(`notes-<clientId>.json`)·meta(`meta.json`) 스키마의 **TS 타입 + zod 검증기**.
Worker(gist-proxy)와 클라이언트가 공유한다. 런타임 의존성은 `zod` 단독 — Workers 런타임 호환.

- 공개 타입 변경 = 스키마 변경이다. 반드시 명세 개정 + 총괄 승인 하에 수행 (conventions §2).

## 공개 API

| export                                                                            | 종류 | 설명                                                 |
| --------------------------------------------------------------------------------- | ---- | ---------------------------------------------------- |
| `NotesFile` `Note` `Origin` `Snapshot` `Page` `PageState` `BoardRows` `PieceType` | 타입 | notes 스키마 §4 자구 그대로                          |
| `notesFileSchema`                                                                 | zod  | `NotesFile` 검증기 (한도 §6 + 산술 경계 refine 포함) |
| `originSchema` `snapshotSchema` `pageSchema` `pageStateSchema`                    | zod  | 서브 스키마 단독 검증기 (adapter A-7·sim 소비용 — W0 게이트 승인) |
| `NOTES_LIMITS`                                                                    | 상수 | notes 한도 수치 (M1a 개정 반영). `maxFileBytes`(직렬화 800KB)와 `maxNotesPerReplay`(리플레이 합산)는 Worker가 강제 |
| `NOTE_ID_PATTERN`                                                                 | 상수 | note id 형식 `[A-Za-z0-9_-]{8}`의 유일 출처 (M1c 승격). page.id도 동일 형식 공유 |
| `MetaFile`                                                                        | 타입 | meta 스키마 §2 자구 그대로                           |
| `metaFileSchema`                                                                  | zod  | `MetaFile` 검증기 (§3 규약 + §5-1 한도·ttr 교차 검증 포함) |
| `META_LIMITS`                                                                     | 상수 | meta §5 한도 수치 (title·description·replayBody)     |
| `CellPos`                                                                         | 타입 | 보드 논리 셀 좌표 `{ x, y }` — 전 모듈 공통 규약 (x 0=왼쪽, y 0=최하단). engine·renderer·replay-tetrio 3중 정의 승격 (#12) |

## 사용 예시

### 신뢰할 수 없는 입력 검증 (Worker 쓰기 경로 — notes 명세 §7-1)

```ts
import { notesFileSchema, type NotesFile } from "@tetorial/types";

const result = notesFileSchema.safeParse(await request.json());
if (!result.success) {
  return new Response(JSON.stringify({ error: result.error.issues }), { status: 422 });
}
const file: NotesFile = result.data; // 구조·한도·산술 경계(queueUsed ≤ queue 길이) 통과
```

### 열람 클라이언트에서 meta.json 파싱

```ts
import { metaFileSchema } from "@tetorial/types";

const meta = metaFileSchema.parse(await (await fetch(rawUrl)).json());
// meta.rounds.map: 파일 내부 인덱스 → 원본 라운드 번호 (오름차순·중복 없음·범위 검증 완료)
const originalRound = meta.rounds.map[fileIndex];
```

### 서브 스키마·한도 상수 (adapter·sim·gist-proxy)

```ts
import { snapshotSchema, NOTES_LIMITS } from "@tetorial/types";

// adapter-tetrio A-7: 변환 산출물이 스키마에 부합하는지 단독 검증
const snapshot = snapshotSchema.parse(convertTriangleState(state));

// gist-proxy: 직렬화 크기 검사 (types는 파싱된 객체만 보므로 크기 강제는 Worker 몫)
if (new TextEncoder().encode(JSON.stringify(file)).length > NOTES_LIMITS.maxFileBytes) {
  return errorResponse(413, "payload-too-large");
}

// gist-proxy #35: 리플레이(=Gist) 전체 합산 노트 한도 — 값의 유일 출처는 이 상수
const total = allFiles.reduce((n, f) => n + f.notes.length, 0);
if (total > NOTES_LIMITS.maxNotesPerReplay) {
  return errorResponse(422, "limit-exceeded");
}
```

### note id 형식 검사 (sim 입구 방어·M1d 딥링크)

```ts
import { NOTE_ID_PATTERN } from "@tetorial/types";

// 주입받은 id의 형식 대조 — 형식의 유일 출처는 이 상수 (M1c)
if (!NOTE_ID_PATTERN.test(noteId)) throw new Error("noteId 형식 위반");
```

### 타입만 사용 (renderer 등 타입 결합 소비자)

```ts
import type { BoardRows, PageState, PieceType } from "@tetorial/types";

function rowAt(board: BoardRows, y: number): string {
  return board.rows[y] ?? "_".repeat(board.width); // 상단 트림된 행은 빈 행
}
```

## 검증 규칙 요약

- **한도(M1a 개정)**: notes ≤ 10(파일당 — 리플레이 합산 한도 `maxNotesPerReplay: 10`의 따름 상한) ·
  pages 1~100 · comment ≤ 500자(유니코드 **코드포인트** 기준) ·
  queue ≤ 1000 · board ≤ 40행(각 행 = width 10 길이) · title ≤ 100자 · description ≤ 1000자
- **산술 경계(refine)**: `page.state.queueUsed ≤ snapshot.queue.length` ·
  `rounds.map` 오름차순·중복 없음·값 ∈ `[0, totalInOriginal)` ·
  `roundWinners.length == rounds.map.length` · id 유일성(파일 내 note.id, 노트 내 page.id)
- **v1 예약 요소 포함**: `"D"` 더미 셀, `overlays.highlights` (notes 결정 로그 5 — 전방 호환)
- **규약**: counters는 tetr.io 원값(-1 = 없음, D-9) · 일시는 ISO 8601 UTC(Z)
  (단 `displayCache.playedAt`은 오프셋 표기 허용) · 해시는 소문자 hex 64자
- **Origin은 리플레이 단일형(M1c)**: `{ type: "replay", round, player, frame }`만 유효.
  구형 `{ type: "note", … }` 입력은 거부된다 (D-8 — 진입점은 불변 대상만, fork는 복사)

검증기는 게임 규칙상 정합성(보드 내용의 의미)은 판정하지 않는다 — notes 명세 §3-4
"Worker는 게임 로직을 모른다"에 따라 구조·한도·산술 경계까지만 책임진다.
