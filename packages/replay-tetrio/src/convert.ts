// 엔진 초기화(convert) + 프레임 버킷팅 — 명세 §4.
//
// triangle 청사진 `test/engine/replay.ts`의 convert()를 TS로 포팅한다.
// 시작점은 스파이크 JS 포팅본(`tools/spike/run_replay.mjs`)이며, 폴백 표는
// convert-defaults.ts 한 곳에 모았다(명세 §4). RT-2가 이 포팅의 정확성을 회귀 고정한다.
import type { Engine, EngineInitializeParams } from "@haelp/teto/engine";
import { CONVERT_DEFAULTS as D, ENGINE_INIT_DATE } from "./convert-defaults.js";

type Init = EngineInitializeParams;

/** triangle `engine.tick()`이 받는 한 프레임 이벤트 (start/keydown/keyup/ige …). */
export type TetrioFrame = Parameters<Engine["tick"]>[0][number];

/**
 * ttrm/ttr 라운드 항목 `replay.options`의 **규범 타입**(전체 옵션).
 *
 * 어댑터 명세 §2의 `TetrioRoundOptions`는 어댑터가 소비하는 5필드만의 최소 구조적
 * 타입이고, ttrm 옵션 전체의 규범 타입 정의는 replay-tetrio 소관이다(총괄 지시).
 * 이 타입은 그 최소 타입의 상위 집합이므로 어댑터 `captureSnapshot`에 그대로 넘길 수 있다.
 *
 * 실물 리플레이는 대부분의 필드를 생략하므로 `seed` 외에는 전부 선택이다(convert가 폴백).
 * 여기 없는 표시·연출용 필드(countdown·mission·slot_* 등)는 파싱 시 `raw`에 보존된다(§2).
 */
export interface TetrioRoundOptions {
  seed: number;
  version?: number; // 리플레이 포맷 버전 (실측 샘플 = 19). displayCache·supportReport용
  gameid?: number; // 멀티플레이 상대 식별(ige 재생). 라운드 항목별 고유
  username?: string;
  boardwidth?: number;
  boardheight?: number;
  kickset?: string;
  spinbonuses?: string;
  bagtype?: string;
  no_szo?: boolean; // true면 게임 첫 조각이 S/Z/O가 될 수 없다(tetr.io 규칙, 주로 솔로). playback이 적용 — 버그2
  combotable?: string;
  garbageblocking?: string;
  clutch?: boolean;
  garbagetargetbonus?: string;
  usebombs?: boolean;
  garbageabsolutecap?: number;
  garbagecapincrease?: number;
  garbagecapmax?: number;
  garbagecap?: number;
  garbagecapmargin?: number;
  garbagespeed?: number;
  garbageholesize?: number;
  messiness_change?: number;
  messiness_nosame?: boolean;
  messiness_timeout?: number;
  messiness_inner?: number;
  messiness_center?: boolean;
  garbagemultiplier?: number;
  garbageincrease?: number;
  garbagemargin?: number;
  garbagespecialbonus?: boolean;
  openerphase?: number;
  roundmode?: string;
  g?: number;
  gincrease?: number;
  gmargin?: number;
  handling?: {
    arr?: number;
    das?: number;
    dcd?: number;
    sdf?: number;
    safelock?: boolean;
    cancel?: boolean;
    may20g?: boolean;
    irs?: string;
    ihs?: string;
  };
  b2bcharging?: boolean;
  b2bcharge_at?: number;
  b2bcharge_base?: number;
  allclear_b2b?: number;
  allclear_garbage?: number;
  allow_harddrop?: boolean;
  allow180?: boolean;
  display_hold?: boolean;
  can_retry?: boolean;
  can_undo?: boolean;
  infinite_hold?: boolean;
  lockresets?: number;
  locktime?: number;
  gravitymay20g?: boolean;
  stride?: boolean;
  passthrough?: string;
}

/**
 * 라운드 옵션 → `EngineInitializeParams`. 청사진 convert() 1:1 포팅.
 * board 옵션 교차 대입(width ← boardheight)은 청사진 그대로 유지한다(§4, 스파이크 R-1) —
 * §7 지원성 검사가 비표준 보드를 사전 차단하므로 기본 보드에서만 실행된다.
 *
 * JSON 원문의 문자열 옵션은 triangle의 리터럴 유니온으로 좁혀 주입한다(`as`) —
 * 값 자체는 폴백 표(convert-defaults) 또는 리플레이 원값이며, 미지원 값은 §7에서 걸러진다.
 */
export function convert(o: TetrioRoundOptions, opponents?: readonly number[]): Init {
  return {
    board: {
      width: o.boardheight ?? D.boardWidthFromHeight,
      height: o.boardwidth ?? D.boardHeightFromWidth,
      buffer: D.boardBuffer,
    },
    kickTable: (o.kickset ?? D.kickset) as Init["kickTable"],
    options: {
      comboTable: (o.combotable ?? D.comboTable) as Init["options"]["comboTable"],
      garbageBlocking: (o.garbageblocking ??
        D.garbageBlocking) as Init["options"]["garbageBlocking"],
      clutch: o.clutch ?? D.clutch,
      garbageTargetBonus: o.garbagetargetbonus ?? D.garbageTargetBonus,
      spinBonuses: (o.spinbonuses ?? D.spinBonuses) as Init["options"]["spinBonuses"],
      stock: 0,
    },
    queue: {
      minLength: D.queueMinLength,
      seed: o.seed,
      type: (o.bagtype ?? D.bagtype) as Init["queue"]["type"],
    },
    garbage: {
      bombs: o.usebombs ?? D.usebombs,
      cap: {
        absolute: o.garbageabsolutecap ?? D.garbageAbsoluteCap,
        increase: o.garbagecapincrease ?? D.garbageCapIncrease,
        max: o.garbagecapmax ?? D.garbageCapMax,
        value: o.garbagecap ?? D.garbageCap,
        marginTime: o.garbagecapmargin ?? D.garbageCapMargin,
      },
      boardWidth: o.boardwidth ?? D.garbageBoardWidth,
      garbage: {
        speed: o.garbagespeed ?? D.garbageSpeed,
        holeSize: o.garbageholesize ?? D.garbageHoleSize,
      },
      messiness: {
        change: o.messiness_change ?? D.messinessChange,
        nosame: o.messiness_nosame ?? D.messinessNosame,
        timeout: o.messiness_timeout ?? D.messinessTimeout,
        within: o.messiness_inner ?? D.messinessInner,
        center: o.messiness_center ?? D.messinessCenter,
      },
      multiplier: {
        value: o.garbagemultiplier ?? D.garbageMultiplier,
        increase: o.garbageincrease ?? D.garbageIncrease,
        marginTime: o.garbagemargin ?? D.garbageMargin,
      },
      specialBonus: o.garbagespecialbonus ?? D.garbageSpecialBonus,
      openerPhase: o.openerphase ?? D.openerPhase,
      seed: o.seed,
      rounding: (o.roundmode ?? D.roundmode) as Init["garbage"]["rounding"],
    },
    gravity: {
      value: o.g ?? D.g,
      increase: o.gincrease ?? D.gIncrease,
      marginTime: o.gmargin ?? D.gMargin,
    },
    handling: {
      arr: o.handling?.arr ?? D.arr,
      das: o.handling?.das ?? D.das,
      dcd: o.handling?.dcd ?? D.dcd,
      sdf: o.handling?.sdf ?? D.sdf,
      safelock: o.handling?.safelock ?? D.safelock,
      cancel: o.handling?.cancel ?? D.cancel,
      may20g: o.handling?.may20g ?? D.may20g,
      irs: (o.handling?.irs ?? D.irs) as Init["handling"]["irs"],
      ihs: (o.handling?.ihs ?? D.ihs) as Init["handling"]["ihs"],
    },
    b2b: {
      chaining: !o.b2bcharging,
      charging: o.b2bcharging
        ? { at: o.b2bcharge_at ?? D.b2bChargeAt, base: o.b2bcharge_base ?? D.b2bChargeBase }
        : false,
    },
    pc: { b2b: o.allclear_b2b ?? D.allclearB2b, garbage: o.allclear_garbage ?? D.allclearGarbage },
    misc: {
      allowed: {
        hardDrop: o.allow_harddrop ?? D.allowHardDrop,
        spin180: o.allow180 ?? D.allow180,
        hold: o.display_hold ?? D.displayHold,
        retry: o.can_retry ?? D.canRetry,
        undo: o.can_undo ?? D.canUndo,
      },
      infiniteHold: o.infinite_hold ?? D.infiniteHold,
      movement: {
        infinite: false,
        lockResets: o.lockresets ?? D.lockResets,
        lockTime: o.locktime ?? D.lockTime,
        may20G: o.gravitymay20g ?? D.gravityMay20g,
      },
      username: o.username,
      stride: o.stride ?? D.stride,
      date: ENGINE_INIT_DATE,
    },
    ...(opponents && opponents.length > 0
      ? {
          multiplayer: {
            opponents: [...opponents],
            passthrough: (o.passthrough ?? D.passthrough) as NonNullable<
              Init["multiplayer"]
            >["passthrough"],
          },
        }
      : {}),
  };
}

/**
 * 이벤트를 프레임 번호별 버킷으로 분할한다(청사진 splitFrames).
 * `engine.frame`과의 동기화 전제이므로 반드시 이 형태로 나눠 tick에 공급한다(§5, 스파이크 §3).
 */
export function splitFrames(raw: readonly TetrioFrame[]): TetrioFrame[][] {
  const last = raw.at(-1);
  const total = (last?.frame ?? 0) + 1;
  const buckets: TetrioFrame[][] = Array.from({ length: total + 1 }, () => []);
  for (const f of raw) buckets[f.frame]?.push(f);
  return buckets;
}
