# @tetorial/input

키보드 이벤트를 실시간(DAS/ARR/SDF)으로 해석해 **엔진의 원자 조작을 반복 호출**하는 얇은
입력 레이어. 엔진 명세 §2의 "결정론 코어 + 시간 셸" 분리에서 **시간 셸**에 해당한다.

- 코어(`createInput`)는 **주입식 시각의 순수 상태 머신** — `press`/`release`/`tick`에 시각 `t`(ms)를
  받는다. DOM 이벤트 수신은 소형 어댑터(`attachDom`)로 분리 (§1).
- 런타임 의존성 **0**. 엔진과는 구조적 계약(`EngineControls`)으로만 결합 —
  `@tetorial/engine`의 `SimEngine`이 이 인터페이스를 그대로 만족한다(딥 임포트·런타임 의존 없음).
- 완전 결정론: 같은 `(press/release/tick, t)` 열 → 같은 엔진 호출 열 (I-6).

## 공개 API

| export                                               | 종류 | 설명                                                |
| ---------------------------------------------------- | ---- | --------------------------------------------------- |
| `createInput(target, config?, keys?)`                | 함수 | 입력 코어 생성 (`InputCore` 반환)                   |
| `attachDom(core, el)`                                | 함수 | keydown/keyup/blur 배선 + 해제 함수 반환            |
| `InputCore`                                          | 타입 | 코어 인터페이스 (press/release/tick/…)              |
| `EngineControls`                                     | 타입 | 입력 레이어가 호출하는 엔진 원자 조작의 구조적 계약 |
| `HandlingConfig` `KeyBindings` `Action` `MetaAction` | 타입 | 설정·바인딩 구성 타입                               |
| `DEFAULT_HANDLING` `DEFAULT_KEYS`                    | 상수 | 기본 핸들링·바인딩 (apps/web 설정 UI의 표시/초기화용 — W2 게이트 승인) |

모디파이어 인코딩(명세 §2): `attachDom`은 Ctrl/Meta가 눌린 비수식키를 `"Ctrl+KeyZ"` 형식으로
인코딩해 코어에 전달한다 (Alt·Shift는 게임 키로 쓰이므로 접두하지 않음). 메타 액션 기본
바인딩은 비어 있다 — apps/web이 `rebind({ undo: ["Ctrl+KeyZ"] })` 형식으로 주입한다.

## 사용 예시

### 엔진에 배선 (sim/apps-web의 기본 흐름)

```ts
import { createInput, attachDom } from "@tetorial/input";
import { SimEngine } from "@tetorial/engine";

const engine = SimEngine.fromSnapshot(snapshot); // SimEngine이 EngineControls를 만족
const input = createInput(engine, { das: 167, arr: 33, sdf: Infinity });

// 브라우저: 실시각(performance.now)을 어댑터가 공급. rAF로 tick을 돌린다.
const detach = attachDom(input, window);
const loop = (t: number) => {
  input.tick(t);
  requestAnimationFrame(loop);
};
requestAnimationFrame(loop);

// 정리
detach();
```

### 순수 코어 구동 (테스트/헤드리스 — 가짜 시각)

```ts
const input = createInput(engine, { das: 100, arr: 10 });
input.press("ArrowLeft", 0); //  keydown 즉시 move(-1) 1회
input.tick(100); //              das 경과 → ARR 반복 시작
input.tick(130); //              arr(10) 간격으로 100,110,120,130 반복
input.release("ArrowLeft", 130); // 즉시 중단
```

### 동작 규칙 요약 (명세 §3)

- **좌우(DAS/ARR)**: keydown 즉시 1회 → `das` 후 `arr` 간격 반복. `arr === 0`이면 `das`
  시점에 `moveToWall`. 반대키는 **last-input 우선**, 남은 키로 복귀 시 **DAS 재충전**.
- **회전·홀드·하드드롭**: keydown 1회당 1호출 (OS 키 반복은 `event.repeat` 필터 + 코어 dedup).
  하드드롭은 큐 소진(`currentPiece === null`) 시 **사전 차단**한다 — 엔진 `lock()/hardDrop()`은
  락 불가 상태에서 throw하므로(engine §7).
- **소프트드롭(SDF)**: `Infinity`(또는 `sdfMs ≤ 0`인 floor mode)면 `softDropToFloor()`.
  유한값이면 `sdfMs = round(500 / sdf)` 간격으로 `moveDown()` 반복.
- **재밀착 불변식 (M3-A, I-7~I-10)**: `arr === 0`이고 DAS 충전 완료 상태로 방향을 유지 중이면
  미노는 항상 그 방향 벽에 밀착해 있어야 하고, SDF ∞(floor mode) 홀드 중이면 항상 바닥에
  밀착해 있어야 한다 — **1회성 이벤트가 아니라 유지 상태의 불변식**이다. 엔진 상태를 변이시킬
  수 있는 디스패치(회전 3종·홀드·하드드롭 후 새 미노) 직후 재적용하며, 순서는 수평
  (`moveToWall`) → 수직(`softDropToFloor`)이고 한쪽의 재적용이 다른 쪽을 다시 가능하게 하면
  둘 다 실패할 때까지 반복한다(고정점). `currentPiece === null`이거나 DAS 미충전이면 수평
  재적용은 없다. `arr > 0`·SDF 유한 반복 경로는 이 불변식의 영향을 받지 않고 기존 동작대로
  다음 ARR/SDF 틱에 이동한다.
- **정지·복원**: `suspend()` 중 게임 조작 전면 무호출(메타 중 `addPage`만 유지), `resume()` 후
  신규 입력만 유효(정지 전 홀드 비복원). `blur` 시 `reset()`으로 전체 키 상태 해제.

### 설정·바인딩·메타

```ts
input.configure({ arr: 0 }); //          핸들링 병합 갱신 (하한 없음, 0 허용 — D-10)
input.rebind({ moveLeft: ["KeyA", "KeyH"] }); // Action당 복수 키, 제공된 Action만 교체
const off = input.onMeta((a) => sim.dispatch(a)); //  "undo"|"redo"|"addPage" → sim/UI
```

## 테스트

```sh
pnpm vitest run --project '*input*'   # 루트에서
```

수용 기준 대응: I-1~I-10 `core.test.ts` (I-7~I-10은 M3-A 재밀착 불변식) · 어댑터(I-2
repeat·I-3 blur) `dom.test.ts` · `EngineControls` 구조적 호환 `engine-compat.test.ts`.
