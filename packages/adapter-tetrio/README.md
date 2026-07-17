# @tetorial/adapter-tetrio

리플레이 재생 중 시뮬레이터 진입 시점에 **triangle(@haelp/teto) 엔진 상태를 notes 스키마의
`Snapshot`으로 변환**하는 단방향 어댑터. 산출물은 순수 데이터이며 `@tetorial/engine`에
의존하지 않는다.

- 실측 근거: [2026-07-10-triangle-spike.md](../../docs/research/2026-07-10-triangle-spike.md) (@haelp/teto v4.2.7 기준)
- 의존성: `@tetorial/types`(workspace) + `@haelp/teto`(**peerDependency** — 호출자 replay-tetrio가 공급)

## 공개 API

| export               | 종류 | 설명                                                                          |
| -------------------- | ---- | ----------------------------------------------------------------------------- |
| `captureSnapshot`    | 함수 | triangle 엔진 + 라운드 options → `CaptureResult` (명세 §2)                    |
| `CaptureResult`      | 타입 | `{ ok: true, snapshot, warnings, pendingGarbage }` \| `{ ok: false, reason }` |
| `CaptureWarning`     | 타입 | `spin-mode-substituted` \| `pending-garbage-dropped`                          |
| `TriangleEngine`     | 타입 | `@haelp/teto/engine`의 `Engine` 별칭                                          |
| `TetrioRoundOptions` | 타입 | 라운드 항목 `replay.options` 중 어댑터가 소비하는 부분 (구조적 타이핑)        |

## 사용 예시 (replay-tetrio에서)

```ts
import { captureSnapshot } from "@tetorial/adapter-tetrio";

// engine: 프레임 f까지 tick을 마친 @haelp/teto Engine (프레임 경계 상태)
// entry.replay.options: 파싱한 ttrm/ttr 라운드 항목의 옵션 객체를 그대로 전달
const result = captureSnapshot(engine, entry.replay.options);

if (!result.ok) {
  // "unsupported-kickset" | "unsupported-board" → 차단 + 사유 안내 (D-10)
  // "topped-out"          → 탑아웃 직전 프레임까지만 분기 가능 (§5-4)
  showBlockedNotice(result.reason);
} else {
  if (result.pendingGarbage > 0) {
    // §5-3: "대기 중이던 쓰레기 n줄은 반영되지 않음. 필요 시 셀 그리기로 표현하세요"
    notifyPendingGarbageDropped(result.pendingGarbage);
  }
  for (const warning of result.warnings) {
    // spin-mode-substituted → "스핀 판정이 원본 방 설정과 다를 수 있음" 배지 (§5-2)
  }
  // origin(round/player/frame)은 호출자가 노트 생성 시 함께 기록한다 (§2)
  createNote({ origin, snapshot: result.snapshot });
}
```

## 동작 요약 (명세 §3~§5)

- **프레임 경계에서만 캡처** — `engine.tick()` 완료 직후 상태만 유효. 조작 중(공중) 미노는
  타입만 승계되고 좌표·회전은 버려진다(시뮬레이터가 스폰 위치에서 재시작).
- **큐**: `engine.queue.minLength`를 200으로 올려(시드 bag 자동 리필) 앞 200개를 파생한다
  (D-8). 이 부작용으로 엔진 큐가 길어지지만 앞부분 내용은 불변이라 이후 재생에 무해하다.
- **카운터**: b2b/combo는 tetr.io 원값 규약(-1 = 없음) 그대로 (D-9). 정규화하지 않는다.
- **대기 쓰레기**: 보드에 반영하지 않고 `pendingGarbage`로 줄 수만 보고 + 경고 (§5-3).
- **미지원 룰 비대칭 처리 (D-10)**: 킥셋·보드 크기(조작 가능성이 달라짐)는 `ok:false` 차단,
  스핀 모드(표시만 달라짐)는 `"all-mini+"` 대체 + 경고.
- 차단 사유가 겹치면 `unsupported-kickset` → `unsupported-board` → `topped-out` 순으로
  보고한다 (§2 유니언 선언 순서, QUESTIONS.md #2).
- 미지의 보드 셀 심볼은 `"G"`로 강등하고 콘솔 경고를 남긴다 (전방 호환, §4).

## 테스트

- 수용 기준 A-1~A-7 전부 테스트 이름에 ID 명시 (`src/capture.test.ts`, `src/golden.test.ts`).
- 골든 테스트는 `fixtures/replay_sample.ttrm`(공개 커밋 미결 — gitignore) **부재 시 skip**
  (kickoff §1-4). 로컬에 fixture를 두면 실물 검증까지 수행된다.
- `src/testing/harness.ts`는 triangle 공식 재생 청사진(`test/engine/replay.ts` —
  `docs/research/2026-07-10-triangle-spike.md` §3)의 TS 포팅본 — 테스트 전용이며 공개 API가 아니다.
