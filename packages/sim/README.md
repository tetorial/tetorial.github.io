# @tetorial/sim

시뮬레이터 코어 — **노트 저작·열람의 상태 머신**. UI 프레임워크 무관 순수 로직으로, Preact 아일랜드(apps/web)가 구독해 화면을 그린다. DOM 무접촉.

- 명세: [`docs/specs/sim.md`](../../docs/specs/sim.md) (§1 워크플로우가 규범)
- 의존: `@tetorial/types`, `@tetorial/engine` (그 외 0)
- 결정론 패키지 — `Math.random`·`Date` 미사용(id 생성도 순수 해시, [`QUESTIONS.md`](./QUESTIONS.md) Q1)

## 공개 API

| 심볼                                                   | 역할                                                                |
| ------------------------------------------------------ | ------------------------------------------------------------------- |
| `createAuthoringSession(init)`                         | 저작 세션 생성 (리플레이 프레임 파생 또는 자기 노트 재편집). 신규 노트 시 `init.existingNoteIds`로 대상 파일의 기존 id를 넘기면 동일 진입점 재파생의 id 충돌을 회피한다 (명세 §3) |
| `restoreAuthoringSession(draft)`                       | localStorage 드래프트 복원 (명세의 `AuthoringSession.restore` 대응) |
| `createViewerSession(note)`                            | 열람 세션 (페이지 순차 열람·딥링크, 수정 불가)                      |
| `deriveSnapshotFromPage(note, pageId, sourceClientId)` | "이 페이지에서 시뮬레이션" 파생 진입                                |
| `assembleNotesFile(args)`                              | 업로드용 NotesFile 조립 (교체/추가 + 한도 사전 검증)                |
| `SERVER_FIELD_SENTINELS`                               | 서버가 덮어쓰는 필드의 placeholder 값                               |
| `NoteLimitError`                                       | `toNote()` 한도 위반 시 throw                                       |

## 저작 세션

```typescript
import { createAuthoringSession, assembleNotesFile } from "@tetorial/sim";

const session = createAuthoringSession({
  origin: { type: "replay", round: 1, player: 0, frame: 841 },
  snapshot, // captureBranch()가 만든 자기완결 Snapshot (@tetorial/types)
});

// UI 구독 — 모든 뷰는 불변 스냅샷
const unsubscribe = session.subscribe(() => render(session.work));

// 미노 조작은 controls 경유 (input 레이어가 호출). 락만 언두 1단위.
session.controls.move(1);
session.controls.rotate("cw");
session.controls.hardDrop();

// 그리기: 스트로크 1회 = 언두 1단위. cell/erase는 보드, highlight는 오버레이(v2 UI).
session.beginStroke({ kind: "cell", v: "G" });
session.strokeTo({ x: 0, y: 0 });
session.strokeTo({ x: 1, y: 0 });
session.endStroke();

// 페이지 = 상태 체크포인트. CRUD는 보드 언두 스택과 분리된 이력.
const page = session.addPage("여기서 TSD가 가능했음");
session.loadPageIntoWork(page.id); // 자유 불러오기 (A/B안 공존)
session.reorderPages([page.id /* ... */]); // 저자의 프레젠테이션 순서

session.undo(); // 보드 언두 (페이지 목록 불변)

// 업로드 조립 (HTTP는 apps/web)
const result = assembleNotesFile({
  current: existingFileOrNull,
  clientId,
  author: { name: "corun" },
  upsert: session.toNote(), // 한도 초과 시 NoteLimitError throw
});
if (result.ok) sendToWorker(result.file);
else reportLimits(result.violations); // limit-exceeded 사전 차단
```

## 드래프트 보존

```typescript
// 저장 (apps/web이 tetorial:draft:<gistId>에 기록)
localStorage.setItem(key, JSON.stringify(session.serialize()));
// 복원 — 작업 상태(페이지로 안 만든 보드)·언두 이력까지 무손실
const restored = restoreAuthoringSession(JSON.parse(localStorage.getItem(key)!));
```

## 열람 · 파생 진입

```typescript
import { createViewerSession, deriveSnapshotFromPage } from "@tetorial/sim";

const viewer = createViewerSession(note);
viewer.selectById(deepLinkPageId); // 딥링크 page 파라미터
render(viewer.view); // WorkView (falling·ghost·next·hold·counters·overlays)

// "이 페이지에서 시뮬레이션" → 새 저작 세션의 입력 (자기/타인 노트 동일 경로)
const derived = deriveSnapshotFromPage(note, pageId, sourceClientId);
if ("error" in derived) alert("큐 소진 페이지 — 진입 불가");
else createAuthoringSession(derived);
```

## 설계 노트

- **비정규화 자립성**: 파생·열람 세션은 입력을 깊은 복제하므로 원본 노트를 변형·삭제해도 무영향(S-5).
- **언두 이중 이력**: 보드 언두 스택(락/스트로크/불러오기, 깊이 50) ↔ 페이지 CRUD(별도, 단순 역연산). 보드 언두가 페이지 목록을 되돌리지 않는다.
- **서버 우선 필드**: `editKeyHash`·`createdAt`·`updatedAt`은 sentinel만 채우고 Worker가 덮어쓴다(명세 §4).
- 미해결 명세 질의는 [`QUESTIONS.md`](./QUESTIONS.md) 참조.

## 수용 기준 (S-1 ~ S-8)

테스트 이름에 기준 ID를 명시한다 (`src/*.test.ts`): S-1 캡처 정합 · S-2 불러오기 규범(3경로) · S-3 언두 매트릭스 · S-4 드래프트 왕복 · S-5 파생 진입 · S-6 조립·병합 · S-7 A/B 통합 · S-8 오버레이 경로.
