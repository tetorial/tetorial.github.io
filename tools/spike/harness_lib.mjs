import { Engine } from "@haelp/teto/engine";
const convert = (o, opponents) => ({
  board: { width: o.boardheight ?? 10, height: o.boardwidth ?? 20, buffer: 20 },
  kickTable: o.kickset ?? "SRS+",
  options: { comboTable: o.combotable ?? "multiplier", garbageBlocking: o.garbageblocking ?? "combo blocking",
    clutch: o.clutch ?? true, garbageTargetBonus: o.garbagetargetbonus ?? "none",
    spinBonuses: o.spinbonuses ?? "all-mini+", stock: 0 },
  queue: { minLength: 10, seed: o.seed, type: o.bagtype ?? "7-bag" },
  garbage: { bombs: o.usebombs, cap: { absolute: o.garbageabsolutecap ?? 0, increase: o.garbagecapincrease ?? 0,
      max: o.garbagecapmax ?? 40, value: o.garbagecap ?? 8, marginTime: o.garbagecapmargin ?? 0 },
    boardWidth: o.boardwidth ?? 10, garbage: { speed: o.garbagespeed ?? 20, holeSize: o.garbageholesize ?? 1 },
    messiness: { change: o.messiness_change ?? 1, nosame: o.messiness_nosame ?? false, timeout: o.messiness_timeout ?? 0,
      within: o.messiness_inner ?? 0, center: o.messiness_center ?? false },
    multiplier: { value: o.garbagemultiplier ?? 1, increase: o.garbageincrease ?? 0.008, marginTime: o.garbagemargin ?? 10800 },
    specialBonus: o.garbagespecialbonus ?? false, openerPhase: o.openerphase ?? 0, seed: o.seed, rounding: o.roundmode ?? "down" },
  gravity: { value: o.g ?? 0.02, increase: o.gincrease ?? 0, marginTime: o.gmargin ?? 0 },
  handling: { arr: o.handling?.arr ?? 0, das: o.handling?.das ?? 6, dcd: o.handling?.dcd ?? 0, sdf: o.handling?.sdf ?? 41,
    safelock: o.handling?.safelock ?? false, cancel: o.handling?.cancel ?? false, may20g: o.handling?.may20g ?? true,
    irs: o.handling?.irs ?? "tap", ihs: o.handling?.ihs ?? "tap" },
  b2b: { chaining: !o.b2bcharging, charging: o.b2bcharging ? { at: o.b2bcharge_at ?? 4, base: o.b2bcharge_base ?? 3 } : false },
  pc: { b2b: o.allclear_b2b ?? 0, garbage: o.allclear_garbage ?? 0 },
  misc: { allowed: { hardDrop: o.allow_harddrop ?? true, spin180: o.allow180 ?? true, hold: o.display_hold ?? true,
      retry: o.can_retry ?? false, undo: o.can_undo ?? false },
    infiniteHold: o.infinite_hold ?? false,
    movement: { infinite: false, lockResets: o.lockresets ?? 15, lockTime: o.locktime ?? 30, may20G: o.gravitymay20g ?? true },
    username: o.username, stride: o.stride ?? false, date: new Date() },
  ...(opponents ? { multiplayer: { opponents, passthrough: o.passthrough ?? "zero" } } : {}),
});

const splitFrames = (raw) => {
  const total = raw.at(-1).frame + 1;
  const buckets = Array.from({ length: total + 1 }, () => []);
  for (const f of raw) buckets[f.frame].push(f);
  return buckets;
};

export { convert, splitFrames };
