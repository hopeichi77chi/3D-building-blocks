import type { AbilityKey, Level, Position } from '../types';

/**
 * XAI-ASRITS 關卡資料庫
 *
 * 設計原則：
 * 1. 共 100 關，分成 10 個能力階段，每階段 10 關。
 * 2. difficulty 採 1～10，與 Adaptive Decision / Knowledge Tracing 相容。
 * 3. 每階段包含兩個基礎結構，每個結構產生五種幾何變體。
 * 4. 所有座標在建立時自動正規化，保證從 0 開始且不超出 gridSize。
 * 5. 關卡結構只做水平旋轉／鏡射，保留垂直層級與積木拓撲關係。
 */

interface LevelTemplate {
  code: string;
  name: string;
  primarySkill: AbilityKey;
  gridSize: number;
  difficulty: number;
  targets: Position[];
}

type HorizontalTransform =
  | 'IDENTITY'
  | 'ROTATE_90'
  | 'ROTATE_180'
  | 'ROTATE_270'
  | 'MIRROR_X';

const TRANSFORMS: readonly HorizontalTransform[] = [
  'IDENTITY',
  'ROTATE_90',
  'ROTATE_180',
  'ROTATE_270',
  'MIRROR_X',
] as const;

const TRANSFORM_LABELS: Record<HorizontalTransform, string> = {
  IDENTITY: '標準方向',
  ROTATE_90: '右轉方向',
  ROTATE_180: '反向結構',
  ROTATE_270: '左轉方向',
  MIRROR_X: '鏡像結構',
};

const STAGE_TEMPLATES: readonly LevelTemplate[] = [
  // -------------------------------------------------------------------------
  // Stage 1：基礎空間視覺化
  // -------------------------------------------------------------------------
  {
    code: 'S01-A',
    name: '基礎空間感知・階梯 L 型',
    primarySkill: 'spatialVisualization',
    gridSize: 4,
    difficulty: 1,
    targets: [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 1, z: 0 },
    ],
  },
  {
    code: 'S01-B',
    name: '基礎空間感知・三向轉角',
    primarySkill: 'spatialVisualization',
    gridSize: 4,
    difficulty: 1,
    targets: [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 1, y: 0, z: 1 },
      { x: 1, y: 1, z: 1 },
      { x: 2, y: 1, z: 1 },
    ],
  },

  // -------------------------------------------------------------------------
  // Stage 2：基礎規劃
  // -------------------------------------------------------------------------
  {
    code: 'S02-A',
    name: '結構規劃・短橋',
    primarySkill: 'planning',
    gridSize: 4,
    difficulty: 2,
    targets: [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
      { x: 1, y: 1, z: 0 },
      { x: 2, y: 1, z: 0 },
      { x: 2, y: 0, z: 0 },
    ],
  },
  {
    code: 'S02-B',
    name: '結構規劃・雙柱平台',
    primarySkill: 'planning',
    gridSize: 4,
    difficulty: 2,
    targets: [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
      { x: 2, y: 0, z: 0 },
      { x: 2, y: 1, z: 0 },
      { x: 0, y: 2, z: 0 },
      { x: 1, y: 2, z: 0 },
      { x: 2, y: 2, z: 0 },
    ],
  },

  // -------------------------------------------------------------------------
  // Stage 3：視角轉換
  // -------------------------------------------------------------------------
  {
    code: 'S03-A',
    name: '視角轉換・折線階梯',
    primarySkill: 'perspectiveTaking',
    gridSize: 5,
    difficulty: 3,
    targets: [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
      { x: 2, y: 0, z: 1 },
      { x: 2, y: 1, z: 1 },
      { x: 1, y: 1, z: 1 },
      { x: 1, y: 2, z: 1 },
    ],
  },
  {
    code: 'S03-B',
    name: '視角轉換・空間鉤形',
    primarySkill: 'perspectiveTaking',
    gridSize: 5,
    difficulty: 3,
    targets: [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
      { x: 0, y: 2, z: 0 },
      { x: 1, y: 2, z: 0 },
      { x: 1, y: 2, z: 1 },
      { x: 2, y: 2, z: 1 },
      { x: 2, y: 1, z: 1 },
    ],
  },

  // -------------------------------------------------------------------------
  // Stage 4：心理旋轉
  // -------------------------------------------------------------------------
  {
    code: 'S04-A',
    name: '心理旋轉・不對稱折角',
    primarySkill: 'mentalRotation',
    gridSize: 5,
    difficulty: 4,
    targets: [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 1, y: 1, z: 0 },
      { x: 1, y: 1, z: 1 },
      { x: 2, y: 1, z: 1 },
      { x: 2, y: 2, z: 1 },
    ],
  },
  {
    code: 'S04-B',
    name: '心理旋轉・偏心塔臂',
    primarySkill: 'mentalRotation',
    gridSize: 5,
    difficulty: 4,
    targets: [
      { x: 1, y: 0, z: 1 },
      { x: 1, y: 1, z: 1 },
      { x: 1, y: 2, z: 1 },
      { x: 0, y: 2, z: 1 },
      { x: 0, y: 2, z: 2 },
      { x: 2, y: 1, z: 1 },
      { x: 2, y: 1, z: 0 },
    ],
  },

  // -------------------------------------------------------------------------
  // Stage 5：工作記憶
  // -------------------------------------------------------------------------
  {
    code: 'S05-A',
    name: '工作記憶・缺口方框',
    primarySkill: 'workingMemory',
    gridSize: 5,
    difficulty: 5,
    targets: [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 2, y: 0, z: 1 },
      { x: 0, y: 0, z: 2 },
      { x: 1, y: 0, z: 2 },
      { x: 2, y: 0, z: 2 },
      { x: 1, y: 1, z: 2 },
    ],
  },
  {
    code: 'S05-B',
    name: '工作記憶・雙層序列',
    primarySkill: 'workingMemory',
    gridSize: 5,
    difficulty: 5,
    targets: [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
      { x: 2, y: 0, z: 1 },
      { x: 0, y: 1, z: 0 },
      { x: 0, y: 1, z: 1 },
      { x: 1, y: 1, z: 1 },
      { x: 1, y: 2, z: 1 },
    ],
  },

  // -------------------------------------------------------------------------
  // Stage 6：進階空間視覺化
  // -------------------------------------------------------------------------
  {
    code: 'S06-A',
    name: '進階視覺化・空間金字塔',
    primarySkill: 'spatialVisualization',
    gridSize: 5,
    difficulty: 6,
    targets: [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 1, y: 0, z: 1 },
      { x: 2, y: 0, z: 1 },
      { x: 0, y: 0, z: 2 },
      { x: 1, y: 0, z: 2 },
      { x: 2, y: 0, z: 2 },
      { x: 1, y: 1, z: 1 },
      { x: 1, y: 2, z: 1 },
    ],
  },
  {
    code: 'S06-B',
    name: '進階視覺化・立體十字',
    primarySkill: 'spatialVisualization',
    gridSize: 5,
    difficulty: 6,
    targets: [
      { x: 1, y: 0, z: 1 },
      { x: 1, y: 1, z: 1 },
      { x: 1, y: 2, z: 1 },
      { x: 0, y: 1, z: 1 },
      { x: 2, y: 1, z: 1 },
      { x: 1, y: 1, z: 0 },
      { x: 1, y: 1, z: 2 },
      { x: 2, y: 2, z: 1 },
      { x: 1, y: 2, z: 2 },
    ],
  },

  // -------------------------------------------------------------------------
  // Stage 7：進階規劃
  // -------------------------------------------------------------------------
  {
    code: 'S07-A',
    name: '進階規劃・雙層拱門',
    primarySkill: 'planning',
    gridSize: 6,
    difficulty: 7,
    targets: [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
      { x: 0, y: 2, z: 0 },
      { x: 3, y: 0, z: 0 },
      { x: 3, y: 1, z: 0 },
      { x: 3, y: 2, z: 0 },
      { x: 0, y: 3, z: 0 },
      { x: 1, y: 3, z: 0 },
      { x: 2, y: 3, z: 0 },
      { x: 3, y: 3, z: 0 },
      { x: 1, y: 2, z: 1 },
      { x: 2, y: 2, z: 1 },
    ],
  },
  {
    code: 'S07-B',
    name: '進階規劃・懸臂平台',
    primarySkill: 'planning',
    gridSize: 6,
    difficulty: 7,
    targets: [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
      { x: 0, y: 2, z: 0 },
      { x: 1, y: 2, z: 0 },
      { x: 2, y: 2, z: 0 },
      { x: 3, y: 2, z: 0 },
      { x: 3, y: 2, z: 1 },
      { x: 3, y: 2, z: 2 },
      { x: 2, y: 1, z: 2 },
      { x: 2, y: 0, z: 2 },
    ],
  },

  // -------------------------------------------------------------------------
  // Stage 8：複合視角與旋轉
  // -------------------------------------------------------------------------
  {
    code: 'S08-A',
    name: '複合推理・立體螺旋',
    primarySkill: 'perspectiveTaking',
    gridSize: 6,
    difficulty: 8,
    targets: [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
      { x: 2, y: 0, z: 1 },
      { x: 2, y: 0, z: 2 },
      { x: 2, y: 1, z: 2 },
      { x: 1, y: 1, z: 2 },
      { x: 0, y: 1, z: 2 },
      { x: 0, y: 2, z: 2 },
      { x: 0, y: 2, z: 1 },
      { x: 0, y: 2, z: 0 },
      { x: 1, y: 3, z: 0 },
    ],
  },
  {
    code: 'S08-B',
    name: '複合推理・交錯雙臂',
    primarySkill: 'mentalRotation',
    gridSize: 6,
    difficulty: 8,
    targets: [
      { x: 1, y: 0, z: 1 },
      { x: 1, y: 1, z: 1 },
      { x: 1, y: 2, z: 1 },
      { x: 0, y: 2, z: 1 },
      { x: 2, y: 2, z: 1 },
      { x: 1, y: 1, z: 0 },
      { x: 1, y: 1, z: 2 },
      { x: 0, y: 3, z: 1 },
      { x: 0, y: 3, z: 2 },
      { x: 2, y: 0, z: 1 },
      { x: 2, y: 0, z: 0 },
    ],
  },

  // -------------------------------------------------------------------------
  // Stage 9：毅力與高負荷建構
  // -------------------------------------------------------------------------
  {
    code: 'S09-A',
    name: '毅力挑戰・多層堡壘',
    primarySkill: 'persistence',
    gridSize: 6,
    difficulty: 9,
    targets: [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 2, y: 0, z: 1 },
      { x: 0, y: 0, z: 2 },
      { x: 1, y: 0, z: 2 },
      { x: 2, y: 0, z: 2 },
      { x: 0, y: 1, z: 0 },
      { x: 2, y: 1, z: 0 },
      { x: 0, y: 1, z: 2 },
      { x: 2, y: 1, z: 2 },
      { x: 1, y: 2, z: 1 },
      { x: 1, y: 3, z: 1 },
    ],
  },
  {
    code: 'S09-B',
    name: '毅力挑戰・階層迷宮',
    primarySkill: 'persistence',
    gridSize: 6,
    difficulty: 9,
    targets: [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
      { x: 3, y: 0, z: 0 },
      { x: 3, y: 0, z: 1 },
      { x: 3, y: 0, z: 2 },
      { x: 2, y: 1, z: 2 },
      { x: 1, y: 1, z: 2 },
      { x: 0, y: 1, z: 2 },
      { x: 0, y: 2, z: 1 },
      { x: 0, y: 2, z: 0 },
      { x: 1, y: 3, z: 0 },
      { x: 2, y: 3, z: 0 },
      { x: 2, y: 4, z: 1 },
    ],
  },

  // -------------------------------------------------------------------------
  // Stage 10：綜合精熟
  // -------------------------------------------------------------------------
  {
    code: 'S10-A',
    name: '精熟挑戰・懸空核心',
    primarySkill: 'planning',
    gridSize: 7,
    difficulty: 10,
    targets: [
      { x: 2, y: 0, z: 2 },
      { x: 2, y: 1, z: 2 },
      { x: 2, y: 2, z: 2 },
      { x: 1, y: 2, z: 2 },
      { x: 3, y: 2, z: 2 },
      { x: 2, y: 2, z: 1 },
      { x: 2, y: 2, z: 3 },
      { x: 1, y: 3, z: 2 },
      { x: 3, y: 3, z: 2 },
      { x: 2, y: 3, z: 1 },
      { x: 2, y: 3, z: 3 },
      { x: 1, y: 4, z: 1 },
      { x: 3, y: 4, z: 3 },
      { x: 2, y: 5, z: 2 },
    ],
  },
  {
    code: 'S10-B',
    name: '精熟挑戰・空間王冠',
    primarySkill: 'mentalRotation',
    gridSize: 7,
    difficulty: 10,
    targets: [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
      { x: 3, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
      { x: 3, y: 1, z: 0 },
      { x: 0, y: 2, z: 0 },
      { x: 3, y: 2, z: 0 },
      { x: 0, y: 2, z: 1 },
      { x: 3, y: 2, z: 1 },
      { x: 1, y: 3, z: 1 },
      { x: 2, y: 3, z: 1 },
      { x: 1, y: 3, z: 2 },
      { x: 2, y: 3, z: 2 },
      { x: 1, y: 4, z: 1 },
      { x: 2, y: 4, z: 2 },
    ],
  },
] as const;

function positionKey(position: Position): string {
  return `${position.x},${position.y},${position.z}`;
}

function transformPosition(
  position: Position,
  transform: HorizontalTransform,
): Position {
  const { x, y, z } = position;

  switch (transform) {
    case 'ROTATE_90':
      return { x: -z, y, z: x };
    case 'ROTATE_180':
      return { x: -x, y, z: -z };
    case 'ROTATE_270':
      return { x: z, y, z: -x };
    case 'MIRROR_X':
      return { x: -x, y, z };
    case 'IDENTITY':
    default:
      return { x, y, z };
  }
}

function normalizePositions(positions: readonly Position[]): Position[] {
  if (positions.length === 0) {
    return [];
  }

  const minimumX = Math.min(...positions.map(position => position.x));
  const minimumY = Math.min(...positions.map(position => position.y));
  const minimumZ = Math.min(...positions.map(position => position.z));

  const uniquePositions = new Map<string, Position>();

  positions.forEach(position => {
    const normalizedPosition: Position = {
      x: position.x - minimumX,
      y: position.y - minimumY,
      z: position.z - minimumZ,
    };

    uniquePositions.set(positionKey(normalizedPosition), normalizedPosition);
  });

  return [...uniquePositions.values()].sort((first, second) => {
    if (first.y !== second.y) {
      return first.y - second.y;
    }

    if (first.z !== second.z) {
      return first.z - second.z;
    }

    return first.x - second.x;
  });
}

function createLevel(
  template: LevelTemplate,
  transform: HorizontalTransform,
  variantIndex: number,
): Level {
  const transformedTargets = normalizePositions(
    template.targets.map(position => transformPosition(position, transform)),
  );

  return {
    id: `${template.code}-V${String(variantIndex + 1).padStart(2, '0')}`,
    name: `${template.name}・${TRANSFORM_LABELS[transform]}`,
    gridSize: template.gridSize,
    difficulty: template.difficulty,
    primarySkill: template.primarySkill,
    targets: transformedTargets,
  };
}

/**
 * 完整 100 關關卡池。
 *
 * 20 個基礎結構 × 5 個方向變體 = 100 關。
 * 每個 difficulty 階段恰好 10 關。
 */
export const LEVEL_POOL: Level[] = STAGE_TEMPLATES.flatMap(template =>
  TRANSFORMS.map((transform, variantIndex) =>
    createLevel(template, transform, variantIndex),
  ),
);

/** 依 ID 取得關卡。 */
export function getLevelById(levelId: string): Level | undefined {
  return LEVEL_POOL.find(level => level.id === levelId);
}

/** 取得指定難度的全部關卡。 */
export function getLevelsByDifficulty(difficulty: number): Level[] {
  return LEVEL_POOL.filter(level => level.difficulty === difficulty);
}

/** 取得指定能力的全部關卡。 */
export function getLevelsBySkill(skill: AbilityKey): Level[] {
  return LEVEL_POOL.filter(level => level.primarySkill === skill);
}

/**
 * 取得尚未完成且最接近目標難度的候選關卡。
 * 可供 Adaptive Decision 或教師面板使用。
 */
export function getRecommendedLevelCandidates(
  targetDifficulty: number,
  completedLevelIds: readonly string[] = [],
  preferredSkill?: AbilityKey,
): Level[] {
  const completedSet = new Set(completedLevelIds);
  const normalizedDifficulty = Math.max(1, Math.min(10, targetDifficulty));

  return LEVEL_POOL
    .filter(level => !completedSet.has(level.id))
    .map(level => ({
      level,
      score:
        Math.abs(level.difficulty - normalizedDifficulty) * 10 +
        (preferredSkill && level.primarySkill !== preferredSkill ? 3 : 0),
    }))
    .sort((first, second) => {
      if (first.score !== second.score) {
        return first.score - second.score;
      }

      if (first.level.difficulty !== second.level.difficulty) {
        return first.level.difficulty - second.level.difficulty;
      }

      return first.level.id.localeCompare(second.level.id);
    })
    .map(item => item.level);
}

/**
 * 相容舊版函式：根據既有關卡數估計下一個 1～10 難度。
 */
export function getNextUnassignedDifficulty(existing: readonly Level[]): number {
  if (existing.length === 0) {
    return 1;
  }

  const highestDifficulty = Math.max(
    ...existing.map(level =>
      Number.isFinite(level.difficulty) ? level.difficulty : 1,
    ),
  );

  return Math.min(10, Math.max(1, Math.floor(highestDifficulty) + 1));
}

export interface LevelPoolValidationIssue {
  levelId: string;
  message: string;
}

/**
 * 驗證關卡池是否符合研究與執行需求。
 */
export function validateLevelPool(
  levels: readonly Level[] = LEVEL_POOL,
): LevelPoolValidationIssue[] {
  const issues: LevelPoolValidationIssue[] = [];
  const levelIds = new Set<string>();

  levels.forEach(level => {
    if (levelIds.has(level.id)) {
      issues.push({
        levelId: level.id,
        message: '關卡 ID 重複。',
      });
    }

    levelIds.add(level.id);

    if (!Number.isInteger(level.gridSize) || level.gridSize < 2) {
      issues.push({
        levelId: level.id,
        message: 'gridSize 必須是至少為 2 的整數。',
      });
    }

    if (
      !Number.isInteger(level.difficulty) ||
      level.difficulty < 1 ||
      level.difficulty > 10
    ) {
      issues.push({
        levelId: level.id,
        message: 'difficulty 必須是 1～10 的整數。',
      });
    }

    if (level.targets.length === 0) {
      issues.push({
        levelId: level.id,
        message: '關卡至少需要一個目標積木。',
      });
    }

    const coordinateKeys = new Set<string>();

    level.targets.forEach(position => {
      const key = positionKey(position);

      if (coordinateKeys.has(key)) {
        issues.push({
          levelId: level.id,
          message: `存在重複積木座標：${key}。`,
        });
      }

      coordinateKeys.add(key);

      const coordinates = [position.x, position.y, position.z];
      const hasInvalidCoordinate = coordinates.some(
        coordinate =>
          !Number.isInteger(coordinate) ||
          coordinate < 0 ||
          coordinate >= level.gridSize,
      );

      if (hasInvalidCoordinate) {
        issues.push({
          levelId: level.id,
          message: `積木座標超出 ${level.gridSize} × ${level.gridSize} × ${level.gridSize} 網格：${key}。`,
        });
      }
    });
  });

  return issues;
}

/** 開發環境可用於快速檢查的統計資料。 */
export const LEVEL_POOL_STATS = {
  totalLevels: LEVEL_POOL.length,
  levelsPerDifficulty: Object.fromEntries(
    Array.from({ length: 10 }, (_, index) => {
      const difficulty = index + 1;
      return [difficulty, getLevelsByDifficulty(difficulty).length];
    }),
  ) as Record<number, number>,
  levelsPerSkill: {
    mentalRotation: getLevelsBySkill('mentalRotation').length,
    spatialVisualization: getLevelsBySkill('spatialVisualization').length,
    perspectiveTaking: getLevelsBySkill('perspectiveTaking').length,
    planning: getLevelsBySkill('planning').length,
    workingMemory: getLevelsBySkill('workingMemory').length,
    persistence: getLevelsBySkill('persistence').length,
  } satisfies Record<AbilityKey, number>,
} as const;