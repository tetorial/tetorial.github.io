// 테스트 전용 재생 하네스 — 런타임 소스가 아니다.
// tools/spike/harness_lib.mjs(triangle 공식 청사진 test/engine/replay.ts 포팅본)의 TS판.
// conventions §4: @haelp/teto는 이 패키지의 peer/devDependency로 테스트에서 직접 사용 가능.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Engine } from "@haelp/teto/engine";
import type { EngineInitializeParams } from "@haelp/teto/engine";
import type { CaptureResult } from "../capture.js";

type Init = EngineInitializeParams;
export type Frame = Parameters<Engine["tick"]>[0][number];

/** ttrm/ttr 라운드 항목 replay.options 중 하네스가 소비하는 필드 (실물 샘플은 다수 생략 → 폴백 필수, 스파이크 R-5) */
export interface ReplayOptions {
  seed: number;
  gameid?: number;
  boardwidth?: number;
  boardheight?: number;
  kickset?: string;
  spinbonuses?: string;
  bagtype?: string;
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
  username?: string;
  stride?: boolean;
  passthrough?: string;
}

/** options → EngineInitializeParams (청사진 convert() 1:1 포팅 — board 교차 대입 포함, 스파이크 R-1) */
export function convert(o: ReplayOptions, opponents?: number[]): Init {
  return {
    board: { width: o.boardheight ?? 10, height: o.boardwidth ?? 20, buffer: 20 },
    kickTable: (o.kickset ?? "SRS+") as Init["kickTable"],
    options: {
      comboTable: (o.combotable ?? "multiplier") as Init["options"]["comboTable"],
      garbageBlocking: (o.garbageblocking ??
        "combo blocking") as Init["options"]["garbageBlocking"],
      clutch: o.clutch ?? true,
      garbageTargetBonus: o.garbagetargetbonus ?? "none",
      spinBonuses: (o.spinbonuses ?? "all-mini+") as Init["options"]["spinBonuses"],
      stock: 0,
    },
    queue: { minLength: 10, seed: o.seed, type: (o.bagtype ?? "7-bag") as Init["queue"]["type"] },
    garbage: {
      bombs: o.usebombs ?? false,
      cap: {
        absolute: o.garbageabsolutecap ?? 0,
        increase: o.garbagecapincrease ?? 0,
        max: o.garbagecapmax ?? 40,
        value: o.garbagecap ?? 8,
        marginTime: o.garbagecapmargin ?? 0,
      },
      boardWidth: o.boardwidth ?? 10,
      garbage: { speed: o.garbagespeed ?? 20, holeSize: o.garbageholesize ?? 1 },
      messiness: {
        change: o.messiness_change ?? 1,
        nosame: o.messiness_nosame ?? false,
        timeout: o.messiness_timeout ?? 0,
        within: o.messiness_inner ?? 0,
        center: o.messiness_center ?? false,
      },
      multiplier: {
        value: o.garbagemultiplier ?? 1,
        increase: o.garbageincrease ?? 0.008,
        marginTime: o.garbagemargin ?? 10800,
      },
      specialBonus: o.garbagespecialbonus ?? false,
      openerPhase: o.openerphase ?? 0,
      seed: o.seed,
      rounding: (o.roundmode ?? "down") as Init["garbage"]["rounding"],
    },
    gravity: { value: o.g ?? 0.02, increase: o.gincrease ?? 0, marginTime: o.gmargin ?? 0 },
    handling: {
      arr: o.handling?.arr ?? 0,
      das: o.handling?.das ?? 6,
      dcd: o.handling?.dcd ?? 0,
      sdf: o.handling?.sdf ?? 41,
      safelock: o.handling?.safelock ?? false,
      cancel: o.handling?.cancel ?? false,
      may20g: o.handling?.may20g ?? true,
      irs: (o.handling?.irs ?? "tap") as Init["handling"]["irs"],
      ihs: (o.handling?.ihs ?? "tap") as Init["handling"]["ihs"],
    },
    b2b: {
      chaining: !o.b2bcharging,
      charging: o.b2bcharging ? { at: o.b2bcharge_at ?? 4, base: o.b2bcharge_base ?? 3 } : false,
    },
    pc: { b2b: o.allclear_b2b ?? 0, garbage: o.allclear_garbage ?? 0 },
    misc: {
      allowed: {
        hardDrop: o.allow_harddrop ?? true,
        spin180: o.allow180 ?? true,
        hold: o.display_hold ?? true,
        retry: o.can_retry ?? false,
        undo: o.can_undo ?? false,
      },
      infiniteHold: o.infinite_hold ?? false,
      movement: {
        infinite: false,
        lockResets: o.lockresets ?? 15,
        lockTime: o.locktime ?? 30,
        may20G: o.gravitymay20g ?? true,
      },
      username: o.username,
      stride: o.stride ?? false,
      date: new Date("2026-01-01T00:00:00Z"), // 고정 시각 — 테스트 결정론
    },
    ...(opponents && opponents.length > 0
      ? {
          multiplayer: {
            opponents,
            passthrough: (o.passthrough ?? "zero") as NonNullable<
              Init["multiplayer"]
            >["passthrough"],
          },
        }
      : {}),
  };
}

/** 이벤트를 프레임 번호별 버킷으로 분할 (청사진 splitFrames — engine.frame과 동기화 필수) */
export function splitFrames(raw: readonly Frame[]): Frame[][] {
  const last = raw.at(-1);
  const total = (last?.frame ?? 0) + 1;
  const buckets: Frame[][] = Array.from({ length: total + 1 }, () => []);
  for (const f of raw) buckets[f.frame]?.push(f);
  return buckets;
}

/** 단위 테스트용 최소 엔진 (기본 옵션 + 시드) */
export function makeEngine(options: Partial<ReplayOptions> = {}): Engine {
  return new Engine(convert({ seed: 42, ...options }));
}

// ---------------------------------------------------------------------------
// fixture 로딩 — 공개 커밋 미결(decisions 미결 항목)이라 부재 시 skip (kickoff §1-4)
// ---------------------------------------------------------------------------

const FIXTURES_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../fixtures",
);
export const TTRM_PATH = path.join(FIXTURES_DIR, "replay_sample.ttrm");
export const hasTtrm = existsSync(TTRM_PATH);

export type RoundEntry = {
  username?: string;
  alive?: boolean;
  replay: { options: ReplayOptions; events: Frame[] };
};
export type Ttrm = { replay: { rounds: RoundEntry[][] } };

export function loadTtrm(): Ttrm {
  return JSON.parse(readFileSync(TTRM_PATH, "utf8")) as Ttrm;
}

/** 라운드 내 다른 플레이어들의 gameid (multiplayer/ige 재생에 필요) */
export function opponentsOf(round: readonly RoundEntry[], entry: RoundEntry): number[] {
  return round
    .filter((r) => r !== entry)
    .map((r) => r.replay.options.gameid)
    .filter((id): id is number => id !== undefined);
}

/** 프레임 경계 단위 재생기. runTo(n) 후 engine.frame === n (tick n회 완료 직후 상태) */
export class Playback {
  readonly engine: Engine;
  readonly frames: Frame[][];

  constructor(entry: RoundEntry, opponents?: number[]) {
    this.engine = new Engine(convert(entry.replay.options, opponents));
    this.frames = splitFrames(entry.replay.events);
  }

  hasMore(): boolean {
    return this.engine.frame < this.frames.length && !this.engine.toppedOut;
  }

  /** 1프레임 진행. 진행했으면 true */
  tickOnce(): boolean {
    if (!this.hasMore()) return false;
    this.engine.tick(this.frames[this.engine.frame] ?? []);
    return true;
  }

  runTo(frame: number): void {
    while (this.engine.frame < frame && this.tickOnce()) {
      /* empty */
    }
  }

  runToEnd(): void {
    while (this.tickOnce()) {
      /* empty */
    }
  }
}

/** 큐 소비 관측: queue.shift를 패치해 이후 큐에서 꺼내(=스폰돼) 나가는 미노 열을 기록한다.
    홀드 재투입 스폰은 큐를 거치지 않으므로 자연히 제외된다 (A-1의 대조 대상과 일치) */
export function recordQueueConsumption(engine: Engine): string[] {
  const consumed: string[] = [];
  const original = engine.queue.shift.bind(engine.queue);
  engine.queue.shift = () => {
    const mino = original();
    if (mino !== undefined) consumed.push(String(mino).toUpperCase());
    return mino;
  };
  return consumed;
}

/** ok:true 내로우잉 헬퍼 — 실패 사유를 테스트 메시지로 남긴다 */
export function expectOk(result: CaptureResult): Extract<CaptureResult, { ok: true }> {
  if (!result.ok) throw new Error(`captureSnapshot 실패: ${result.reason}`);
  return result;
}
