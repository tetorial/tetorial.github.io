# @tetorial/sim

시뮬레이터 코어 — **노트 저작·열람의 상태 머신**. UI 프레임워크 무관 순수 로직으로, Preact 아일랜드(apps/web)가 구독해 화면을 그린다. DOM 무접촉.

- 의존: `@tetorial/types`, `@tetorial/engine` (그 외 0)
- 결정론 패키지 — `Math.random`·`Date`·CSPRNG 미접촉. 노트 id는 호출자가 값으로 주입하고(M1b), 페이지 id만 순수 해시로 파생한다

## 공개 API

| 심볼                                   | 역할                                                                                                                                                                                                                                                                                                        |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createAuthoringSession(init)`         | 저작 세션 생성 — 판별 유니온. 신규 `{ origin, snapshot, noteId, existingNoteIds? }`: 호출자가 id를 값으로 주입, 형식(`[A-Za-z0-9_-]{8}`) 불일치·`existingNoteIds` 충돌 시 `InvalidNoteIdError` throw. 재편집 `{ existing: Note }`: id·origin·snapshot 전부 existing에서, 어떤 대조·검증도 없음 (sim-m1b §3) |
| `createViewerSession(note)`            | 열람 세션 (페이지 순차 열람·딥링크, 수정 불가)                                                                                                                                                                                                                                                              |
| `deriveSnapshotFromPage(note, pageId)` | "이 페이지에서 시뮬레이션" 파생 진입. 반환 `origin`은 원본 노트 origin의 깊은 복사 (D-8)                                                                                                                                                                                                                    |
| `assembleNotesFile(args)`              | 업로드용 NotesFile 조립 (교체/추가 + 한도 사전 검증)                                                                                                                                                                                                                                                        |
| `SERVER_FIELD_SENTINELS`               | 서버가 덮어쓰는 필드의 placeholder 값                                                                                                                                                                                                                                                                       |
| `NoteLimitError`                       | `toNote()` 한도 위반 시 throw                                                                                                                                                                                                                                                                               |
| `InvalidNoteIdError`                   | 신규 경로 id 거부 시 throw. `reason: "shape" \| "collision"`                                                                                                                                                                                                                                                |

## 저작 세션

```typescript
import { createAuthoringSession, assembleNotesFile, InvalidNoteIdError } from "@tetorial/sim";

// 신규: id는 호출자(웹)가 CSPRNG로 생성해 값으로 주입 — sim은 받기만 한다 (결정론)
let session;
try {
  session = createAuthoringSession({
    origin: { type: "replay", round: 1, player: 0, frame: 841 },
    snapshot, // captureBranch()가 만든 자기완결 Snapshot (@tetorial/types)
    noteId, // [A-Za-z0-9_-]{8} — apps/web은 crypto.getRandomValues 기반 생성
    existingNoteIds: myFile?.notes.map((n) => n.id), // 충돌 1회 대조용 (선택)
  });
} catch (e) {
  if (e instanceof InvalidNoteIdError)
    reportBadId(e.reason); // "shape" | "collision"
  else throw e;
}

// 재편집: existing만 전달 — id·origin·snapshot 전부 노트에서, 대조·검증 없음
const reedit = createAuthoringSession({ existing: myNote });

// UI 구독 — 모든 뷰는 불변 스냅샷
const unsubscribe = session.subscribe(() => render(session.work));

// 미노 조작은 controls 경유 (input 레이어가 호출). 락만 언두 1단위.
session.controls.move(1);
session.controls.rotate("cw");
session.controls.hardDrop();

// 그리기: 스트로크 1회 = 언두 1단위. cell/erase는 보드, highlight는 오버레이.
session.beginStroke({ kind: "cell", v: "G" });
session.strokeTo({ x: 0, y: 0 });
session.strokeTo({ x: 1, y: 0 });
session.endStroke();

// highlight는 토글: 첫 유효 셀의 현재 상태 반전을 스트로크 전체의 모드로 확정한다.
// 같은 셀 2회 스트로크 = 켜짐→꺼짐. 드래그 중 셀별로 뒤집히지 않는다(지그재그 무깜빡임).
session.beginStroke({ kind: "highlight" });
session.strokeTo({ x: 2, y: 0 }); // 꺼진 셀에서 시작 → 이 스트로크는 "켜기"
session.strokeTo({ x: 3, y: 0 });
session.endStroke();

// force는 강제 모드 — "off"는 끄기만(우클릭 지우기용, W5-2b), "on"은 켜기만.
// 무변경 스트로크(전부 이미 그 상태·범위 밖)는 언두 단위를 만들지 않는다.
session.beginStroke({ kind: "highlight", force: "off" });
session.strokeTo({ x: 2, y: 0 });
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

## 열람 · 파생 진입

```typescript
import { createViewerSession, deriveSnapshotFromPage } from "@tetorial/sim";

const viewer = createViewerSession(note);
viewer.selectById(deepLinkPageId); // 딥링크 page 파라미터
render(viewer.view); // WorkView (falling·ghost·next·hold·counters·overlays)

// "이 페이지에서 시뮬레이션" → 새 저작 세션의 입력 (자기/타인 노트 동일 경로)
// 파생 origin은 원본 노트 origin의 깊은 복사 — fork는 참조가 아니라 복사 (D-8)
const derived = deriveSnapshotFromPage(note, pageId);
if ("error" in derived) alert("큐 소진 페이지 — 진입 불가");
else createAuthoringSession({ ...derived, noteId: freshNoteId });
```

## 설계 노트

- **비정규화 자립성**: 파생·열람 세션은 입력을 깊은 복제하므로 원본 노트를 변형·삭제해도 무영향(S-5).
- **언두 이중 이력**: 보드 언두 스택(락/스트로크/불러오기, 깊이 50) ↔ 페이지 CRUD(별도, 단순 역연산). 보드 언두가 페이지 목록을 되돌리지 않는다.
- **서버 우선 필드**: `editKeyHash`·`createdAt`·`updatedAt`은 sentinel만 채우고 Worker가 덮어쓴다(명세 §4).
- **id 규격의 유일 출처**: `@tetorial/types` notes 스키마(`idSchema`, `[A-Za-z0-9_-]{8}`). 미공개 심볼이라 sim에 리터럴을 두었고, M1c에서 공개 상수 승격을 검토한다.

## 수용 기준

테스트 이름에 기준 ID를 명시한다 (`src/*.test.ts`): S-1 캡처 정합 · S-2 불러오기 규범(3경로) · S-3 언두 매트릭스 · S-5 파생 진입 · S-6 조립·병합 · S-7 A/B 통합 · S-8 오버레이 경로 · S-9 드래프트 API 소멸 · S-10 하이라이트 토글 · M1b-1/2 파생 origin 복사 · M1b-3 id 값 주입 · M1b-4 입구 방어 (M1b-5 웹 배선은 `apps/web`).
