import { Engine } from "@haelp/teto/engine";
import fs from "node:fs";
// run_replay.mjs의 convert 재사용
const { convert, splitFrames } = await import("./harness_lib.mjs");
const ttrm = JSON.parse(fs.readFileSync("/mnt/user-data/uploads/replay_sample.ttrm"));
const round = ttrm.replay.rounds[0];
const loser = round.find(e => !e.alive);
const opp = round.filter(r => r !== loser).map(r => r.replay.options.gameid);
const frames = splitFrames(loser.replay.events);
const engine = new Engine(convert(loser.replay.options, opp));
while (engine.frame < frames.length) { engine.tick(frames[engine.frame]); if (engine.toppedOut) break; }
const symbols = new Set();
for (const row of engine.board.state) for (const c of row ?? []) if (c) symbols.add(typeof c === "string" ? c : JSON.stringify(Object.keys(c)) + ":" + (c.mino ?? c));
console.log("보드에 등장한 셀 값 종류:", [...symbols].slice(0, 12));
console.log("held:", engine.held, "| holdLocked:", engine.holdLocked, "| b2b:", engine.stats.b2b, "| combo:", engine.stats.combo);
