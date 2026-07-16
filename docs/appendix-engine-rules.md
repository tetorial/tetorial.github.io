# Tetorial 엔진 부록: 형상·킥·스핀·카운터 규범 (`docs/specs/appendix-engine-rules.md`) — v1

> 상태: v1 확정 · 대상: engine 에이전트 (명세 §5·§8의 "부록"이 이 문서)
> 원천: @haelp/teto v4.2.7 (halp1/triangle, MIT) 소스 원문. **이 문서는 해석이 아니라 전사(轉寫)다** — 수식·알고리즘을 원문 그대로 옮겼고, 모호하면 원문(파일·행 표기)을 직접 확인한다. 최종 심판은 골든 테스트(E-3·E-4·E-5): 이 문서와 triangle 실행 결과가 다르면 **triangle이 이긴다.**

동봉 데이터: `packages/engine/src/data/triangle-data.json` — `kicks`(SRS·SRS+ 전체), `cornerTable`, `spinbonusRules`(T-spins·all-mini+), `tetrominoes`(7미노). 값 무수정 원본 복제. 엔진 소스에 그대로 임포트하고 **손으로 옮겨 적지 않는다.**

---

## 1. 형상과 좌표 규약

- `tetrominoes[piece].matrix`: `{ w: number, data: BlockList[4] }` — `data[rotation]` = 해당 회전 상태의 블록 목록 `[bx, by][]`. **by는 아래 방향 양수** (형상 내부 좌표).
- 보드 좌표는 y 위 방향 양수(우리 규약과 동일). 미노의 절대 셀 산출 (원문: `utils/kicks/index.ts` performKick):

```
baseX = pieceX - ao[0]
baseY = floor(pieceY) - ao[1]
absoluteCell[i] = [ baseX + block[i][0], baseY - block[i][1] ]
```

`ao`는 킥테이블의 `additional_offsets`(피스별 보정, 대부분 [0,0])이다. **우리 엔진은 pieceY를 항상 정수로 유지**한다(무중력 턴제) — 원문의 소수 y는 중력 전용이며, `floor` 통과 후 동일 결과가 되도록 정수 y로 구현한다.

## 2. 스폰 (원문: `utils/tetromino/index.ts` constructor)

```
location = [ floor(boardWidth/2 − matrix.w/2), boardHeight + 2.04 ]   // 우리 구현: y = boardHeight + 2
rotation = kickTable.spawn_rotation[piece] ?? 0                        // SRS·SRS+는 빈 객체 → 항상 0
```

`boardHeight`는 가시 높이(20). 스폰 셀이 이미 점유면 탑아웃(엔진 명세 E-6).

## 3. 회전과 킥 적용 (원문: performKick — 규범 알고리즘)

1. 목표 회전 상태의 블록으로 **제자리**가 합법이면 킥 없이 성공. (이 경우 킥 정보 없음 → §5의 TST/fin 승격 불가)
2. 아니면 킥셋 선택: 테이블에 `` `${piece}_kicks` `` 키가 있으면 그것(예: SRS·SRS+의 `i_kicks`), 없으면 공용 `kicks`. 시도 목록 키 = `` `${from}${to}` `` (회전 상태 0~3, 예: `"01"`, `"23"`).
3. 각 후보 `[dx, dy]`를 순서대로: `newY = pieceY − dy` (**테이블의 dy 양수 = 아래 방향**), `newX = pieceX + dx`. 전 블록 합법이면 채택, 결과 킥 보고값은 `[dx, −dy]` (표준 표기, +y 위).
   - 부호 검증 예: SRS `"01"` = `[[-1,0],[-1,-1],[0,2],[-1,2]]` ↔ 표준 SRS 표기 `(-1,0), (-1,+1), (0,-2), (-1,-2)` — 일치.
4. 전부 실패 → 회전 실패(false).

`allow180 = false`면 `"02"`류 시도 자체를 하지 않는다.

## 4. 스핀 상태의 수명 (원문: engine/index.ts 727·1143~1155·864행 부근)

- **회전 성공 직후** 스핀을 판정해 `lastSpin`에 기록한다 (§5).
- **위치를 바꾸는 다른 조작(좌우 이동·하강)이 성공하면 `lastSpin = null`.** 실패한 조작(벽에 막힌 이동 등)은 초기화하지 않는다.
- **홀드는 `lastSpin`을 초기화하지 않는다** — triangle v4.2.7 실동작 준거(원문 `hold()`가 lastSpin을 건드리지 않음). 골든 시나리오(E-4의 S8)로 고정. (2026-07-11 추가 — W1 QUESTIONS 처리)
- 락 시점의 `lastSpin`이 그 배치의 스핀이다. → 엔진 명세 §8 "마지막으로 성공한 조작이 rotate일 때만"의 정밀한 형태.

## 5. 스핀 판정 (원문: #detectSpin · #detectSpinFromCorners · #isTSpinKick · isAllSpinPosition)

### 5-1. 모드 분기 (v1 지원 2종)

```
"T-spins":   피스가 t일 때만 코너 판정(§5-2) 실행 → 결과 또는 "none"
"all-mini+": maxSpin( t의 코너 판정 결과,  immobility(§5-4)이면 "mini" 아니면 "none" )
             (maxSpin 서열: "normal" > "mini" > "none")
```

### 5-2. 코너 판정 (T스핀)

```
1. 현재 위치에서 한 칸 아래(absolute[i] = [x + b0, y − 1 − b1])가 합법이면 → "none" (접지 아님)
2. cornerTable[piece][rotation]의 4항목에 대해:
     점유(x + table[i][0] + 1, y − table[i][1] − 1) 이면 corners++
     그리고 rotation ∈ { table[i][2], table[i][3] } 이면 frontCorners++
3. corners < 3 → "none"
4. 기본 "normal". 피스가 spinbonusRules[mode].types_mini에 포함(t)되고 frontCorners ≠ 2 → "mini"
5. 직전 회전이 TST/fin 킥(§5-3)이었다면 → "normal"로 승격
```

### 5-3. TST/fin 킥 조건 (#isTSpinKick — 원문 그대로)

킥이 실제로 발생한 경우(§3-1의 제자리 성공 제외)에 한해:

```
(id ∈ {"23","03"} && kick == [ 1, −2])   // 보고값 기준 (아래로 2)
|| (id ∈ {"21","01"} && kick == [−1, −2])
```

### 5-4. Immobility (all-spin 계열)

상하좌우 1칸 이동이 **전부** 불법이면 all-spin 위치:

```
!legalAt(x−1, y) && !legalAt(x+1, y) && !legalAt(x, y+1) && !legalAt(x, y−1)
```

## 6. 락 시 카운터 갱신 (원문: engine/index.ts 1425~1446행 — D-9 원값 규약의 출처)

```
lines > 0:
  combo++
  (lastSpin != null && lastSpin != "none") || lines >= 4  →  b2b++
  아니면  →  b2b = −1
lines == 0 (클리어 없는 락):
  combo = −1
```

- 초기값 둘 다 −1 (없음).
- 원문의 퍼펙트 클리어 b2b 보너스(`pc.b2b`)는 리플레이 기본 옵션이 0이므로 **v1 미구현** — 엔진 명세 §10 스코프 아웃에 준함.

## 7. 골든 테스트 연결 (수용 기준 대응)

- **E-3**: `packages/engine/src/data/triangle-data.json`의 kicks가 devDependency `@haelp/teto`의 `engine/utils/kicks/data` export와 deep equal (데이터 부패 방지).
- **E-4**: 대표 시나리오 30+ — 본 문서 §5의 각 분기(코너 3/4, front 2 여부, TST/fin 승격, 제자리 회전 비승격, immobility 각 미노, 이동에 의한 lastSpin 초기화)를 최소 1케이스씩 포함하고, 동일 조작열을 triangle 엔진에 재생해 `LockRes.spin`과 대조.
- **E-5**: `tetrominoes` 형상·§2 스폰 산식을 triangle 인스턴스의 `falling` 상태와 대조.
