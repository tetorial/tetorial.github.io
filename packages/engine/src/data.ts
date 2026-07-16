// triangle-data.json(@haelp/teto v4.2.7 원본 무수정 복제)의 타입 안전 접근 계층.
// 값의 해석(적용 수식)은 docs/specs/appendix-engine-rules.md가 규범이며, 여기서는
// strict 인덱싱을 위해 모듈 로드 시 1회 정규화만 수행한다 (값 변형 없음).
import raw from "./data/triangle-data.json";

/** triangle 내부 소문자 미노 심볼 */
export type PieceSymbol = "i" | "j" | "l" | "o" | "s" | "t" | "z";

export type Pair = readonly [number, number];

export type KickTableName = "SRS" | "SRS+";

export type KickTable = {
  /** 공용 킥셋: "01" 같은 from-to 키 → 후보 [dx, dy][] (dy 양수 = 아래, 부록 §3) */
  common: ReadonlyMap<string, readonly Pair[]>;
  /** 피스 전용 킥셋 (`i_kicks` 등). 피스 심볼 → from-to 키 → 후보 목록 */
  piece: ReadonlyMap<string, ReadonlyMap<string, readonly Pair[]>>;
  /** additional_offsets — SRS·SRS+는 빈 객체 (부록 §1) */
  additionalOffsets: ReadonlyMap<string, Pair>;
  /** spawn_rotation — SRS·SRS+는 빈 객체 → 항상 0 (부록 §2) */
  spawnRotation: ReadonlyMap<string, number>;
};

/** 코너 판정 테이블 항목 (부록 §5-2). frontRots = 원문 table[i][2..3] */
export type CornerEntry = { dx: number; dy: number; frontRots: readonly number[] };

export type TetrominoDef = {
  w: number;
  /** blocks[rotation] = [bx, by][] — by는 아래 방향 양수 (부록 §1) */
  blocks: readonly (readonly Pair[])[];
};

// ---------------------------------------------------------------------------
// 정규화 (JSON 구조가 기대와 다르면 즉시 throw — 데이터 부패 조기 검출)
// ---------------------------------------------------------------------------

function fail(path: string): never {
  throw new Error(`triangle-data.json 구조 불일치: ${path}`);
}

function toPair(v: unknown, path: string): Pair {
  if (!Array.isArray(v) || typeof v[0] !== "number" || typeof v[1] !== "number") fail(path);
  return [v[0], v[1]];
}

function toPairList(v: unknown, path: string): readonly Pair[] {
  if (!Array.isArray(v)) fail(path);
  return v.map((p, i) => toPair(p, `${path}[${i}]`));
}

function normalizeKickTable(name: KickTableName): KickTable {
  const table: Record<string, unknown> = raw.kicks[name];
  const common = new Map<string, readonly Pair[]>();
  const piece = new Map<string, ReadonlyMap<string, readonly Pair[]>>();
  const additionalOffsets = new Map<string, Pair>();
  const spawnRotation = new Map<string, number>();

  for (const [key, value] of Object.entries(table)) {
    if (key === "kicks") {
      if (typeof value !== "object" || value === null) fail(`${name}.kicks`);
      for (const [id, list] of Object.entries(value)) {
        common.set(id, toPairList(list, `${name}.kicks.${id}`));
      }
    } else if (key.endsWith("_kicks")) {
      if (typeof value !== "object" || value === null) fail(`${name}.${key}`);
      const sym = key.slice(0, -"_kicks".length);
      const sets = new Map<string, readonly Pair[]>();
      for (const [id, list] of Object.entries(value)) {
        sets.set(id, toPairList(list, `${name}.${key}.${id}`));
      }
      piece.set(sym, sets);
    } else if (key === "additional_offsets") {
      if (typeof value !== "object" || value === null) fail(`${name}.additional_offsets`);
      for (const [sym, ao] of Object.entries(value)) {
        additionalOffsets.set(sym, toPair(ao, `${name}.additional_offsets.${sym}`));
      }
    } else if (key === "spawn_rotation") {
      if (typeof value !== "object" || value === null) fail(`${name}.spawn_rotation`);
      for (const [sym, rot] of Object.entries(value)) {
        if (typeof rot !== "number") fail(`${name}.spawn_rotation.${sym}`);
        spawnRotation.set(sym, rot);
      }
    }
    // colorMap·preview_overrides 등 렌더링 전용 키는 엔진이 사용하지 않는다
  }
  return { common, piece, additionalOffsets, spawnRotation };
}

function normalizeTetrominoes(): ReadonlyMap<PieceSymbol, TetrominoDef> {
  const out = new Map<PieceSymbol, TetrominoDef>();
  const entries: Record<string, { matrix: { w: number; data: number[][][] } }> = raw.tetrominoes;
  for (const [sym, def] of Object.entries(entries)) {
    const blocks = def.matrix.data.map((rot, r) =>
      // 블록 항목의 3번째 값(텍스처 연결 비트)은 물리와 무관 — [bx, by]만 취한다
      rot.map((b, i) => toPair(b, `tetrominoes.${sym}.data[${r}][${i}]`)),
    );
    if (blocks.length !== 4) fail(`tetrominoes.${sym}.data 길이`);
    out.set(sym as PieceSymbol, { w: def.matrix.w, blocks });
  }
  return out;
}

function normalizeCornerTable(): ReadonlyMap<string, readonly (readonly CornerEntry[])[]> {
  const out = new Map<string, readonly (readonly CornerEntry[])[]>();
  const entries: Record<string, number[][][]> = raw.cornerTable;
  for (const [sym, rots] of Object.entries(entries)) {
    out.set(
      sym,
      rots.map((rot, r) =>
        rot.map((e, i) => {
          const [dx, dy] = toPair(e, `cornerTable.${sym}[${r}][${i}]`);
          // 원문 table[i][2]·[3]은 z 등 일부 피스에 없다 (undefined 비교 → 항상 false와 동치)
          return { dx, dy, frontRots: e.slice(2) };
        }),
      ),
    );
  }
  return out;
}

export const KICK_TABLES: Record<KickTableName, KickTable> = {
  SRS: normalizeKickTable("SRS"),
  "SRS+": normalizeKickTable("SRS+"),
};

export const TETROMINOES = normalizeTetrominoes();

export const CORNER_TABLE = normalizeCornerTable();

export const SPINBONUS_RULES: Record<
  "T-spins" | "all-mini+",
  { types: readonly string[]; typesMini: readonly string[] }
> = {
  "T-spins": {
    types: raw.spinbonusRules["T-spins"].types,
    typesMini: raw.spinbonusRules["T-spins"].types_mini,
  },
  "all-mini+": {
    types: raw.spinbonusRules["all-mini+"].types,
    typesMini: raw.spinbonusRules["all-mini+"].types_mini,
  },
};

export function tetromino(sym: PieceSymbol): TetrominoDef {
  const def = TETROMINOES.get(sym);
  if (!def) fail(`tetrominoes.${sym} 부재`);
  return def;
}
