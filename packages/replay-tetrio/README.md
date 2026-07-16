# @tetorial/replay-tetrio

**.ttrm/.ttr 파싱 · 라운드 발췌 · triangle(@haelp/teto) 엔진 기반 결정론적 재생 · 분기
(시뮬레이터 진입) 지점 제공.** 모든 구조·수치는 실물 리플레이(FT3 ttrm + 40L ttr)로 실증됐다.

- 실측 근거: [2026-07-10-triangle-spike.md](../../docs/research/2026-07-10-triangle-spike.md) §3(재생 청사진)·§5(실물 구조)
- 의존성: `@tetorial/types` · `@tetorial/adapter-tetrio` · `@haelp/teto`(재생 엔진, 런타임)

## 공개 API

| export                                                                                                                                                                                                       | 종류   | 설명                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ---------------------------------------------------------------- |
| `parseReplay(text)`                                                                                                                                                                                          | 함수   | .ttrm/.ttr JSON 파싱·정규화 → `ParseResult<ReplayDoc>` (§2)      |
| `excerptRounds(doc, originalRounds)`                                                                                                                                                                         | 함수   | 라운드 발췌본 재조립 → `ExcerptResult` (§3)                      |
| `roundSizes(doc)`                                                                                                                                                                                            | 함수   | 라운드별 직렬화 바이트(업로드 UI 용량 표시) (§3)                 |
| `createPlayback(doc, target)`                                                                                                                                                                                | 함수   | 결정론 재생 컨트롤러 생성 → `PlaybackController` (§5)            |
| `PlaybackClock`                                                                                                                                                                                              | 클래스 | 재생 시계(실시간 셸) — 주입식 타이머로 `step()` 구동 (§6)        |
| `supportReport(entry)`                                                                                                                                                                                       | 함수   | 분기 지원성 사전 보고(kickset/board/spin) → `SupportReport` (§7) |
| `extractDisplayCache(doc)`                                                                                                                                                                                   | 함수   | meta.json용 표시 캐시 추출 (§8)                                  |
| `convert` · `splitFrames`                                                                                                                                                                                    | 함수   | 옵션 → `EngineInitializeParams` · 프레임 버킷팅 (§4)             |
| `ReplayDoc` `RoundEntry` `TetrioRoundOptions` `TetrioFrame` `ParseResult` `ParseError` `ExcerptResult` `PlaybackController` `PlaybackView` `PlaybackEffect` `CellPos` `PlaybackClockOptions` `SupportReport` | 타입   | API 시그니처 구성 타입                                           |

> `TetrioRoundOptions`는 ttrm 옵션 **전체의 규범 타입**이다(어댑터 §2의 최소 소비 타입의 상위
> 집합 — 그대로 `captureSnapshot`에 넘길 수 있다).

## 사용 예시

```ts
import {
  parseReplay,
  createPlayback,
  PlaybackClock,
  extractDisplayCache,
} from "@tetorial/replay-tetrio";

const parsed = parseReplay(fileText);
if (!parsed.ok) return showError(parsed.error.code); // invalid-json | unknown-structure | empty-rounds
const doc = parsed.value;

// round는 doc 내부 인덱스 — 원본 라운드 번호 변환(roundMap)은 호출자(apps/web) 책임
const pb = createPlayback(doc, { round: 0, player: 0 });

// 결정론 코어: 시간 없이 프레임 단위로 탐색
pb.step(10); // 앞으로 10프레임
pb.seek(1200); // 임의 프레임으로 (뒤로 가기 = 키프레임 복원 후 전진, 등가성 보장)
renderer.render({ board: pb.view.board, falling: pb.view.falling }); // BoardRows·실좌표 그대로 소비

// 분기(시뮬레이터 진입) — 항상 프레임 경계에서 캡처
const branch = pb.captureBranch(); // adapter.captureSnapshot 위임 → CaptureResult
if (branch.ok)
  createNote({
    origin: { type: "replay", round: 0, player: 0, frame: pb.frame },
    snapshot: branch.snapshot,
  });

// 실시간 재생은 시계 셸로 (apps/web이 rAF·performance.now 주입, 배속·일시정지)
const clock = new PlaybackClock(pb, {
  now: () => performance.now(),
  schedule: requestAnimationFrame,
  cancel: cancelAnimationFrame,
});
clock.play();
clock.setSpeed(2); // 0.25×~4×

// meta.json 조립 보조
const displayCache = extractDisplayCache(doc);
```

## 동작 요약

- **파싱은 관용적** — 모르는 필드는 `raw`에 보존하고 필요한 필드 부재 시에만 오류(§2). ttr은
  1라운드 × 1플레이어로 정규화(`alive = null`)해 ttrm과 동일 파이프라인에 태운다.
- **convert 폴백 표는 청사진과 자구까지 동일** — 한 곳(`convert-defaults.ts`)에 상수로 모았다(§4).
  board 옵션 교차 대입(width ← boardheight)도 청사진 그대로 유지(§7이 비표준 보드를 사전 차단).
- **결정론 코어 + 시간 셸** — 컨트롤러(§5)는 무시간(Date 미참조)이고, 실시간은 `PlaybackClock`(§6)로
  분리한다. 일시정지는 항상 프레임 경계에 정렬돼 `captureBranch`의 프레임 경계 전제를 자동 충족.
- **seek 등가성(RT-4)** — 어떤 경로(직진 / 키프레임 복원 / 엔진 재생성)로 프레임 f에 도달하든
  `engine.snapshot()`이 동일하다. 매 300프레임 키프레임 캐시(상한 120, 초과 시 간격 2배 확장).
- **round 인덱스는 doc 내부 기준** — 원본 라운드 번호(roundMap)와의 변환은 호출자 몫이다(§5).

## 테스트

- 수용 기준 RT-1~RT-8 전부 테스트 이름에 ID 명시 (`src/*.test.ts`).
- fixture 골든(RT-2 실측 앵커 등)은 `fixtures/`의 **익명화본**(D-16)에 의존하며 **부재 시 skip**한다.
  로컬에 fixture가 있으면 실물 재생까지 실행된다.
- `src/testing/fixtures.ts`는 테스트 전용 로더 — 공개 API가 아니다.
