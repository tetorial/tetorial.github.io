# Tetorial 스파이크 보고서: triangle (@haelp/teto) 검증 — 2026-07-10

> 목적: 노트/메타 스키마 명세의 §8-1 검증 항목 해소, replay-tetrio·adapter 모듈 명세의 기술 근거 확보
> 방법: npm 패키지 v4.2.7 설치, dist 정적 분석, 리포 클론, Node.js 실행 검증

## 1. 요약 (결론)

| 검증 항목 | 결과 |
|---|---|
| 라이선스 | **MIT** ✅ |
| 엔진 단독 사용 | `@haelp/teto/engine` 서브패스로 분리 임포트 가능. README에 "Engine은 누구나 사용 가능" 명시 (Client/API만 봇 계정 제약) ✅ |
| 브라우저 호환 | 엔진 dist에 Node 빌트인(`fs`, `net`, `node:*` 등) 임포트 **없음**. ESM(.mjs) 제공 ✅ |
| 런타임 크기 | 엔진 .mjs 합계 약 380KB (비압축·비최소화). 번들 최적화 후 훨씬 작아질 것 ✅ |
| 시드 → 큐 파생 | `Queue({ seed, type, minLength })` 단독 인스턴스화 가능. minLength만큼 자동 채움. 엔진 내부 큐와 결과 일치, 결정론 확인 ✅ |
| 스냅샷/복원 | `engine.snapshot()` / `engine.fromSnapshot()` 공식 API. 홀드·큐 포함 왕복 무손실 확인 ✅ |
| 킥테이블 | `SRS`, `SRS+`, `SRS-X` 데이터가 `engine/utils/kicks/data`에 내장. 180 회전 동작 확인 ✅ |
| 스핀 판정 | `SpinType = "none" | "mini" | "normal"`. `press("hardDrop")`의 반환값 `LockRes.spin`으로 획득. 판정 모드는 옵션 `spinBonuses`(리플레이 기본 `"all-mini+"`)가 결정 ✅ |
| 리플레이 → 엔진 | **공식 청사진 존재**: 리포의 `test/engine/replay.ts` (§3) ✅ |
| 라운드 발췌 안전성 | ttrm의 각 라운드는 **자체 options(시드 포함)와 events를 갖는 자기완결 구조.** 상대 공격도 본인 이벤트 스트림의 `ige` 프레임에 내장 → 단일 보드·단일 라운드 재생이 독립적 ✅ |
| tetr.io 버전 추종 | "TETR.IO Beta **1.7.8** 기준 동작" 명시. tetr.io 업데이트 시 신규 리플레이가 깨질 수 있음 → 지원 버전 명시 UI 필요 ⚠️ |

## 2. 실행 검증 로그 (Node 22, v4.2.7)

```
1) 동일 시드 엔진 2개 큐 일치: PASS | otiljszijzlosti  (seed=42, 7-bag)
2) Queue 단독 파생 200개: PASS | 엔진 큐와 일치: PASS
3) 180 회전(press("rotate180")): PASS
4) 홀드 후 snapshot/fromSnapshot 왕복: hold=o, 큐 일치 PASS
5) EngineSnapshot 키: __meta, board, falling, frame, subframe, hold, holdLocked,
   lastSpin, lastWasClear, queue, _queue, garbage, input, targets, stats, glock,
   stock, ige, state, spike, time, resCache, practice
```

→ **어댑터 설계 확정 근거**: 분기 시점에 `engine.queue.minLength = 200`으로 올린 뒤 `falling.symbol`(current), `hold`, `holdLocked`, `board.state`, `queue`, 스탯(b2b/combo)을 읽어 notes Snapshot으로 변환하면 된다. 별도 RNG 재구현 불필요.

## 3. 리플레이 → 엔진 청사진: `test/engine/replay.ts`

replay-tetrio 모듈 에이전트는 이 파일을 1차 참고자료로 삼는다. 핵심 구조:

```
replay.rounds: Round[][]        // 바깥 배열 = 라운드, 안쪽 배열 = 플레이어별 항목
Round 항목: { id(유저), active, replay: { options, events } }
  options: seed, bagtype, kickset(기본 "SRS+"), spinbonuses(기본 "all-mini+"),
           boardwidth/boardheight, handling, garbage 계열 다수, allow180, ...
  events:  Frame[]              // keydown/keyup/ige. ige = 상대 공격 수신 이벤트
```

재생 루프 (원문 요지):

```typescript
const init = convert(round);            // options → EngineInitializeParams (전체 매핑은 원문 참조)
const frames = splitFrames(round.replay.events);  // 프레임 번호별 버킷팅
const engine = new Engine(init);
while (engine.frame < frames.length) engine.tick(frames[engine.frame]);
```

주의점:
- `convert()`에서 `board.width ← options.boardheight`, `height ← options.boardwidth`로 **교차 대입**되어 있음. tetr.io 옵션 명명의 특이점인지 하네스 버그인지 실물 리플레이로 확인 필요 (검증 항목 R-1).
- 테스트 데이터는 `.ttrmx`(theorypack 패킹) 형식이며 `pack.unpack()`으로 해제. **실제 tetr.io에서 받은 .ttrm/.ttr의 파싱 경로(JSON 직접 파싱 vs theorypack)는 실물 파일로 확인 필요** (검증 항목 R-2, 우선순위 최상).
- 프레임 재생은 반드시 `splitFrames`처럼 프레임 단위 버킷으로 나눠 `engine.frame`과 동기화할 것.

## 4. 우리 설계에 미치는 영향 (스키마 반영 사항)

1. **SpinType 명칭 정렬**: `"full"` → triangle과 동일한 `"normal"`. (반영 완료. 후기: 이후 페이지 모델 개정으로 spin은 파일에 저장되지 않으며, 엔진 `LockInfo`의 라이브 표시 전용 값이 됨 — notes 결정 로그 1)
2. **spinBonuses는 룰셋의 일부**: tetr.io 방 설정에 따라 스핀 판정 모드가 다름(T-spin only, all-mini+, all-spin 등). notes `Snapshot.ruleset`에 `spinBonuses` 필드 추가. (반영 완료)
3. **큐 파생 권장 절차 확정**: 노트 생성 시 `queue.minLength = 200` 설정 후 큐를 읽는다. §2 참조.
4. **버전 리스크 관리**: meta.json `displayCache`에 리플레이의 클라이언트 버전 기록 검토. 서비스 UI에 "지원: TETR.IO ≤ 1.7.8 (triangle v4.2.7 기준)" 노출.

## 5. 실물 리플레이 검증 결과 (2026-07-10, FT3 커스텀 ttrm + 40L ttr)

- **R-1 (board 옵션 교차 대입)**: 샘플에는 `boardwidth`/`boardheight`가 아예 없음(기본 보드) → 기본값 경로에서는 무해함을 확인. 커스텀 보드 크기 방은 에지 케이스 워치 항목으로 유지 (replay-tetrio 명세에 "비표준 보드 크기 방은 미지원 안내" 옵션 검토).
- **R-2 (파일 형식)**: 실물 .ttrm/.ttr 모두 **평문 JSON** 확정. theorypack은 triangle 테스트 아카이브(.ttrmx) 전용. 파서는 `JSON.parse`로 충분.
- **R-3 (라운드 발췌)**: `replay.rounds` 배열에서 라운드를 골라 재조립한 ttrm이 **원본과 프레임·배치 수까지 동일하게 재생됨을 실증**. 전체 재생도 3라운드 × 2플레이어 전부 성공 (승자 생존, 패자 toppedOut — `alive` 플래그와 일치).
- **R-4 (크기)**: FT3 기준 라운드당 raw 75~209KB → **gzip 6~15KB (약 13배 압축)**. ttrm 전체 gzip 26KB, ttr 3KB. base64 오버헤드(×1.33)를 감안해도 800KB 한도는 매우 여유. 장기 커스텀 매치도 문제없을 전망.
- **R-5 (displayCache 소스)**: 최상위 `users[].username`(플레이어), `ts`(경기 시각), `id`(tetr.io 리플레이 ID, 로컬 저장본은 null 가능), `gamemode`, 라운드 항목의 `alive`(승자 판별), `options.version`(리플레이 포맷 버전, 샘플=19) 확인. 라운드 항목에 `stats`(pps/apm 등)도 존재 — displayCache 후보 추가 검토.

### 파서 구현 참고 (실물 구조 확정본)

```
.ttrm: { id, gamemode, ts, users[], version, replay: { leaderboard, rounds: Round[][] } }
  Round 항목: { id(유저), username, active, alive, lifetime, stats, replay: { options, events } }
  옵션 다수는 생략 가능 → 청사진 convert()의 기본값 폴백 필수 (샘플에서 bagtype/kickset 등 부재 확인)
.ttr:  { id, gamemode, ts, users[1], version, replay: { frames, events, options, results } }
  → 라운드 래핑 없는 단판. 파서는 이를 "1라운드·1플레이어"로 정규화해 동일 파이프라인에 태운다
```
