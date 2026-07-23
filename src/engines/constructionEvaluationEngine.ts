import type {
  BehaviorFeatures,
  ConstructionEvaluation,
  Position,
  TutorInterventionEvaluation,
  TutorObjectiveResult,
} from '../types';

/**
 * 建構評估引擎
 *
 * 職責：
 * 1. 比較玩家目前積木與關卡目標結構。
 * 2. 支援 X/Z 水平平移不變比對，避免因建構起點不同誤判。
 * 3. 計算完成率、精確率、缺漏與錯誤積木。
 * 4. 比較 Tutor 提示介入前後的建構與行為改善。
 *
 * 注意：目前積木皆以整數網格座標表示，且不處理整體旋轉等價。
 * 若未來關卡允許整體旋轉後仍視為正確，可再加入旋轉正規化。
 */

const EPSILON = 1e-9;

export interface ConstructionEvaluationOptions {
  /**
   * 是否允許玩家結構相對目標在 X/Z 平面平移後仍視為相同。
   * 預設 true。
   */
  allowHorizontalTranslation?: boolean;

  /**
   * 平移搜尋半徑。未提供時會依目前與目標結構的邊界自動估計。
   */
  maxTranslationDistance?: number;
}

export interface TutorInterventionEvaluationInput {
  beforeBlocks: Position[];
  afterBlocks: Position[];
  targetBlocks: Position[];
  beforeFeatures?: BehaviorFeatures;
  afterFeatures?: BehaviorFeatures;
  constructionOptions?: ConstructionEvaluationOptions;
}

interface TranslationCandidate {
  dx: number;
  dz: number;
}

interface MatchResult {
  correctBlocks: number;
  incorrectBlocks: number;
  missingBlocks: number;
  dx: number;
  dz: number;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function normalizeCoordinate(value: number): number {
  if (!Number.isFinite(value)) return 0;

  // 網格座標理論上應是整數；保留小數支援，但消除浮點尾差。
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function normalizePosition(position: Position): Position {
  return {
    x: normalizeCoordinate(position.x),
    y: normalizeCoordinate(position.y),
    z: normalizeCoordinate(position.z),
  };
}

function positionKey(position: Position): string {
  const normalized = normalizePosition(position);
  return `${normalized.x}|${normalized.y}|${normalized.z}`;
}

/**
 * 去除同一座標的重複積木，避免重複資料讓正確率超過 100%。
 */
export function deduplicatePositions(positions: Position[]): Position[] {
  const unique = new Map<string, Position>();

  positions.forEach(position => {
    const normalized = normalizePosition(position);
    unique.set(positionKey(normalized), normalized);
  });

  return [...unique.values()];
}

function getHorizontalBounds(positions: Position[]): {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
} {
  if (positions.length === 0) {
    return { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
  }

  return positions.reduce(
    (bounds, position) => ({
      minX: Math.min(bounds.minX, position.x),
      maxX: Math.max(bounds.maxX, position.x),
      minZ: Math.min(bounds.minZ, position.z),
      maxZ: Math.max(bounds.maxZ, position.z),
    }),
    {
      minX: positions[0].x,
      maxX: positions[0].x,
      minZ: positions[0].z,
      maxZ: positions[0].z,
    },
  );
}

function estimateTranslationDistance(
  currentBlocks: Position[],
  targetBlocks: Position[],
): number {
  const currentBounds = getHorizontalBounds(currentBlocks);
  const targetBounds = getHorizontalBounds(targetBlocks);

  const maxCoordinateDistance = Math.max(
    Math.abs(currentBounds.minX - targetBounds.minX),
    Math.abs(currentBounds.maxX - targetBounds.maxX),
    Math.abs(currentBounds.minZ - targetBounds.minZ),
    Math.abs(currentBounds.maxZ - targetBounds.maxZ),
  );

  return Math.max(1, Math.ceil(maxCoordinateDistance) + 1);
}

/**
 * 從所有目前積木與目標積木的座標差產生候選平移量。
 * 相較暴力搜尋整個網格，此方法更準確且效率較高。
 */
function createTranslationCandidates(
  currentBlocks: Position[],
  targetBlocks: Position[],
  options: ConstructionEvaluationOptions,
): TranslationCandidate[] {
  const allowTranslation = options.allowHorizontalTranslation ?? true;

  if (!allowTranslation || currentBlocks.length === 0 || targetBlocks.length === 0) {
    return [{ dx: 0, dz: 0 }];
  }

  const maxDistance = Math.max(
    0,
    Math.floor(
      options.maxTranslationDistance ??
        estimateTranslationDistance(currentBlocks, targetBlocks),
    ),
  );

  const candidates = new Map<string, TranslationCandidate>();
  candidates.set('0|0', { dx: 0, dz: 0 });

  currentBlocks.forEach(current => {
    targetBlocks.forEach(target => {
      // 將目標移動到目前積木位置需要的平移量。
      const dx = normalizeCoordinate(current.x - target.x);
      const dz = normalizeCoordinate(current.z - target.z);

      if (Math.abs(dx) <= maxDistance && Math.abs(dz) <= maxDistance) {
        candidates.set(`${dx}|${dz}`, { dx, dz });
      }
    });
  });

  return [...candidates.values()];
}

function matchWithTranslation(
  currentBlocks: Position[],
  targetBlocks: Position[],
  candidate: TranslationCandidate,
): MatchResult {
  const translatedTargetKeys = new Set(
    targetBlocks.map(target =>
      positionKey({
        x: target.x + candidate.dx,
        y: target.y,
        z: target.z + candidate.dz,
      }),
    ),
  );

  const currentKeys = new Set(currentBlocks.map(positionKey));

  let correctBlocks = 0;
  currentKeys.forEach(key => {
    if (translatedTargetKeys.has(key)) correctBlocks += 1;
  });

  const incorrectBlocks = currentKeys.size - correctBlocks;
  const missingBlocks = translatedTargetKeys.size - correctBlocks;

  return {
    correctBlocks,
    incorrectBlocks,
    missingBlocks,
    dx: candidate.dx,
    dz: candidate.dz,
  };
}

function isBetterMatch(candidate: MatchResult, best: MatchResult | null): boolean {
  if (!best) return true;

  if (candidate.correctBlocks !== best.correctBlocks) {
    return candidate.correctBlocks > best.correctBlocks;
  }

  if (candidate.incorrectBlocks !== best.incorrectBlocks) {
    return candidate.incorrectBlocks < best.incorrectBlocks;
  }

  if (candidate.missingBlocks !== best.missingBlocks) {
    return candidate.missingBlocks < best.missingBlocks;
  }

  // 同分時優先選擇位移較小的結果，讓判定更穩定。
  const candidateDistance = Math.abs(candidate.dx) + Math.abs(candidate.dz);
  const bestDistance = Math.abs(best.dx) + Math.abs(best.dz);
  return candidateDistance < bestDistance;
}

/**
 * 評估玩家目前建構結果。
 */
export function evaluateConstruction(
  currentBlocksInput: Position[],
  targetBlocksInput: Position[],
  options: ConstructionEvaluationOptions = {},
): ConstructionEvaluation {
  const currentBlocks = deduplicatePositions(currentBlocksInput);
  const targetBlocks = deduplicatePositions(targetBlocksInput);

  if (targetBlocks.length === 0) {
    return {
      totalTargetBlocks: 0,
      totalCurrentBlocks: currentBlocks.length,
      correctBlocks: 0,
      incorrectBlocks: currentBlocks.length,
      missingBlocks: 0,
      completionRate: 0,
      precision: currentBlocks.length === 0 ? 1 : 0,
      exactMatch: currentBlocks.length === 0,
    };
  }

  const candidates = createTranslationCandidates(currentBlocks, targetBlocks, options);
  let bestMatch: MatchResult | null = null;

  candidates.forEach(candidate => {
    const match = matchWithTranslation(currentBlocks, targetBlocks, candidate);
    if (isBetterMatch(match, bestMatch)) bestMatch = match;
  });

  const resolvedMatch: MatchResult = bestMatch ?? {
    correctBlocks: 0,
    incorrectBlocks: currentBlocks.length,
    missingBlocks: targetBlocks.length,
    dx: 0,
    dz: 0,
  };

  const completionRate = resolvedMatch.correctBlocks / targetBlocks.length;
  const precision =
    currentBlocks.length === 0
      ? 0
      : resolvedMatch.correctBlocks / currentBlocks.length;

  return {
    totalTargetBlocks: targetBlocks.length,
    totalCurrentBlocks: currentBlocks.length,
    correctBlocks: resolvedMatch.correctBlocks,
    incorrectBlocks: resolvedMatch.incorrectBlocks,
    missingBlocks: resolvedMatch.missingBlocks,
    completionRate: clamp01(completionRate),
    precision: clamp01(precision),
    exactMatch:
      resolvedMatch.correctBlocks === targetBlocks.length &&
      resolvedMatch.incorrectBlocks === 0 &&
      resolvedMatch.missingBlocks === 0 &&
      currentBlocks.length === targetBlocks.length,
  };
}

function safeFeatureDifference(
  after: number | undefined,
  before: number | undefined,
): number {
  if (!Number.isFinite(after) || !Number.isFinite(before)) return 0;
  return (after as number) - (before as number);
}

/**
 * 評估一次 Tutor 介入前後是否有效。
 *
 * 改善分數組成：
 * - 建構完成率提升：45%
 * - 精確率提升：20%
 * - 錯誤積木減少：15%
 * - 行為錯誤率改善：10%
 * - 建構效率改善：10%
 */
export function evaluateTutorIntervention(
  input: TutorInterventionEvaluationInput,
): TutorInterventionEvaluation {
  const beforeConstruction = evaluateConstruction(
    input.beforeBlocks,
    input.targetBlocks,
    input.constructionOptions,
  );
  const afterConstruction = evaluateConstruction(
    input.afterBlocks,
    input.targetBlocks,
    input.constructionOptions,
  );

  const completionGain =
    afterConstruction.completionRate - beforeConstruction.completionRate;
  const precisionGain = afterConstruction.precision - beforeConstruction.precision;
  const incorrectReduction =
    beforeConstruction.incorrectBlocks - afterConstruction.incorrectBlocks;

  const beforeErrorRate = input.beforeFeatures?.errorRate;
  const afterErrorRate = input.afterFeatures?.errorRate;
  const errorRateChange = safeFeatureDifference(afterErrorRate, beforeErrorRate);

  const beforeEfficiency = input.beforeFeatures?.efficiencyScore;
  const afterEfficiency = input.afterFeatures?.efficiencyScore;
  const efficiencyChange = safeFeatureDifference(afterEfficiency, beforeEfficiency);

  const normalizedIncorrectReduction =
    beforeConstruction.totalTargetBlocks === 0
      ? 0
      : incorrectReduction / beforeConstruction.totalTargetBlocks;

  const errorRateImprovement = Math.max(0, -errorRateChange);
  const normalizedEfficiencyGain = Math.max(0, efficiencyChange / 100);

  const rawImprovementScore =
    Math.max(0, completionGain) * 0.45 +
    Math.max(0, precisionGain) * 0.2 +
    Math.max(0, normalizedIncorrectReduction) * 0.15 +
    errorRateImprovement * 0.1 +
    normalizedEfficiencyGain * 0.1;

  const improvementScore = clamp01(rawImprovementScore);

  let result: TutorObjectiveResult;

  if (afterConstruction.exactMatch) {
    result = 'SUCCESS';
  } else {
    const objectivelyImproved =
      completionGain >= 0.1 - EPSILON ||
      precisionGain >= 0.15 - EPSILON ||
      incorrectReduction >= 1 ||
      errorRateImprovement >= 0.1 - EPSILON ||
      normalizedEfficiencyGain >= 0.1 - EPSILON;

    result = objectivelyImproved ? 'PARTIAL' : 'NO_IMPROVEMENT';
  }

  const evidence: string[] = [
    `完成率 ${(beforeConstruction.completionRate * 100).toFixed(0)}% → ${(afterConstruction.completionRate * 100).toFixed(0)}%`,
    `正確積木 ${beforeConstruction.correctBlocks} → ${afterConstruction.correctBlocks}`,
    `錯誤積木 ${beforeConstruction.incorrectBlocks} → ${afterConstruction.incorrectBlocks}`,
    `缺少積木 ${beforeConstruction.missingBlocks} → ${afterConstruction.missingBlocks}`,
    `建構精確率 ${(beforeConstruction.precision * 100).toFixed(0)}% → ${(afterConstruction.precision * 100).toFixed(0)}%`,
  ];

  if (
    Number.isFinite(beforeErrorRate) &&
    Number.isFinite(afterErrorRate)
  ) {
    evidence.push(
      `行為錯誤率 ${((beforeErrorRate as number) * 100).toFixed(0)}% → ${((afterErrorRate as number) * 100).toFixed(0)}%`,
    );
  }

  if (
    Number.isFinite(beforeEfficiency) &&
    Number.isFinite(afterEfficiency)
  ) {
    evidence.push(
      `建構效率 ${(beforeEfficiency as number).toFixed(0)} → ${(afterEfficiency as number).toFixed(0)}`,
    );
  }

  return {
    result,
    beforeConstruction,
    afterConstruction,
    completionGain,
    errorRateChange,
    efficiencyChange,
    improvementScore,
    evidence,
  };
}

/**
 * 取得客觀結果的繁體中文標籤，供 TutorPanel 與 Dashboard 共用。
 */
export function getTutorObjectiveResultLabel(
  result: TutorObjectiveResult,
): string {
  switch (result) {
    case 'SUCCESS':
      return '已客觀完成';
    case 'PARTIAL':
      return '已有部分改善';
    case 'NO_IMPROVEMENT':
      return '尚未偵測到明顯改善';
    default: {
      const exhaustiveCheck: never = result;
      return exhaustiveCheck;
    }
  }
}