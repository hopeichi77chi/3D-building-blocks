import {
  AbilityKey,
  BehaviorFeatures,
  BehaviorVector,
  CognitiveDiagnosis,
  PlayerModel,
} from '../types';

// ============================================================================
// Knowledge Tracing Engine
// Explainable AI-based Adaptive Spatial Reasoning Intelligent Tutoring System
//
// 功能：
// 1. 使用 Bayesian Knowledge Tracing（BKT）概念追蹤能力掌握度。
// 2. 每項 AbilityKey 擁有獨立的知識狀態。
// 3. 根據成功、失敗、提示、難度、錯誤率與行為向量更新。
// 4. 產生可解釋的更新證據。
// 5. 可將 Knowledge Tracing 結果同步至 PlayerModel。
//
// Pipeline：
//
// Level Result / Task Observation
//              ↓
// Bayesian Posterior Update
//              ↓
// Learning Transition
//              ↓
// Skill Mastery Update
//              ↓
// Predicted Success Rate
//              ↓
// Player Model
//
// 所有機率皆為 0～1。
// ============================================================================

// ---------------------------------------------------------------------------
// 1. 型別定義
// ---------------------------------------------------------------------------

/**
 * 單一能力的 BKT 參數。
 *
 * initialMastery：
 * 初始掌握機率 P(L0)。
 *
 * learnRate：
 * 完成一次學習活動後，由未掌握轉為掌握的機率 P(T)。
 *
 * guessRate：
 * 尚未掌握，但仍成功作答／完成任務的機率 P(G)。
 *
 * slipRate：
 * 已經掌握，但仍答錯／失敗的機率 P(S)。
 */
export interface BKTParameters {
  initialMastery: number;
  learnRate: number;
  guessRate: number;
  slipRate: number;
}

/**
 * 單一能力的歷史紀錄。
 */
export interface KnowledgeHistoryEntry {
  timestamp: number;
  levelId?: string;
  observationId?: string;

  ability: AbilityKey;

  priorMastery: number;
  posteriorMastery: number;
  updatedMastery: number;

  predictedSuccessBefore: number;
  predictedSuccessAfter: number;

  observedSuccess: boolean;

  difficulty: number;
  hintUsed: boolean;
  hintDependencyRate: number;

  evidenceReliability: number;

  effectiveLearnRate: number;
  effectiveGuessRate: number;
  effectiveSlipRate: number;

  change: number;
}

/**
 * 單一能力的 Knowledge State。
 */
export interface SkillKnowledgeState {
  ability: AbilityKey;

  /**
   * 目前能力掌握機率，0～1。
   */
  mastery: number;

  /**
   * 下一次任務的預測成功率，0～1。
   */
  predictedSuccessRate: number;

  /**
   * 累積觀察次數。
   */
  observations: number;

  /**
   * 成功與失敗次數。
   */
  successCount: number;
  failureCount: number;

  /**
   * 最近一次更新時間。
   */
  lastUpdatedAt: number;

  /**
   * 能力變化趨勢。
   */
  trend: 'UP' | 'STABLE' | 'DOWN';

  /**
   * BKT 參數。
   */
  parameters: BKTParameters;

  /**
   * 最近的更新歷史。
   */
  history: KnowledgeHistoryEntry[];
}

/**
 * 全部能力的 Knowledge Tracing 狀態。
 */
export interface KnowledgeTracingState {
  learnerId?: string;

  skills: Record<AbilityKey, SkillKnowledgeState>;

  /**
   * 六項能力的整體平均掌握度。
   */
  overallMastery: number;

  /**
   * 下一個任務的整體預測成功率。
   */
  predictedSuccessRate: number;

  /**
   * 整體趨勢。
   */
  learningTrend: 'UP' | 'STABLE' | 'DOWN';

  /**
   * 總更新次數。
   */
  totalObservations: number;

  createdAt: number;
  updatedAt: number;
}

/**
 * 每次關卡／任務完成後傳入的觀察資料。
 */
export interface KnowledgeObservation {
  /**
   * 主要追蹤能力。
   */
  ability: AbilityKey;

  /**
   * 任務是否成功。
   */
  success: boolean;

  /**
   * 關卡難度。
   *
   * 建議輸入：
   * 1～5 或 0～1，系統會自動正規化。
   */
  difficulty: number;

  /**
   * 是否使用提示。
   */
  hintUsed?: boolean;

  /**
   * 提示詳細程度。
   *
   * 0：未使用提示
   * 1：低
   * 2：中
   * 3：高
   */
  hintLevel?: 0 | 1 | 2 | 3;

  /**
   * 任務完成率，0～1。
   */
  completionRate?: number;

  /**
   * 任務得分，0～1 或 0～100。
   */
  score?: number;

  /**
   * 是否為主要能力。
   *
   * 次要能力更新時可以設為 false，
   * 系統會降低該筆證據權重。
   */
  isPrimarySkill?: boolean;

  levelId?: string;
  observationId?: string;
  timestamp?: number;
}

/**
 * 單次能力更新的解釋。
 */
export interface KnowledgeTracingEvidence {
  ability: AbilityKey;

  previousMastery: number;
  posteriorMastery: number;
  updatedMastery: number;

  masteryChange: number;

  predictedSuccessBefore: number;
  predictedSuccessAfter: number;

  observedSuccess: boolean;

  effectiveParameters: {
    learnRate: number;
    guessRate: number;
    slipRate: number;
  };

  evidenceReliability: number;

  evidence: string[];
  explanation: string;
}

/**
 * Knowledge Tracing 更新輸出。
 */
export interface KnowledgeTracingUpdateResult {
  state: KnowledgeTracingState;
  updatedSkill: SkillKnowledgeState;
  evidence: KnowledgeTracingEvidence;
}

/**
 * 批次更新輸出。
 */
export interface BatchKnowledgeTracingResult {
  state: KnowledgeTracingState;
  updates: KnowledgeTracingEvidence[];
}

// ---------------------------------------------------------------------------
// 2. 常數設定
// ---------------------------------------------------------------------------

const ABILITIES: AbilityKey[] = [
  'mentalRotation',
  'spatialVisualization',
  'perspectiveTaking',
  'planning',
  'workingMemory',
  'persistence',
];

/**
 * 每項能力預設 BKT 參數。
 *
 * 目前為研究原型參數。
 * 正式研究後應根據前導實驗資料進行估計或校準。
 */
const DEFAULT_BKT_PARAMETERS: Record<AbilityKey, BKTParameters> = {
  mentalRotation: {
    initialMastery: 0.4,
    learnRate: 0.12,
    guessRate: 0.2,
    slipRate: 0.12,
  },

  spatialVisualization: {
    initialMastery: 0.4,
    learnRate: 0.12,
    guessRate: 0.18,
    slipRate: 0.12,
  },

  perspectiveTaking: {
    initialMastery: 0.42,
    learnRate: 0.11,
    guessRate: 0.2,
    slipRate: 0.13,
  },

  planning: {
    initialMastery: 0.45,
    learnRate: 0.1,
    guessRate: 0.2,
    slipRate: 0.12,
  },

  workingMemory: {
    initialMastery: 0.45,
    learnRate: 0.08,
    guessRate: 0.18,
    slipRate: 0.15,
  },

  persistence: {
    initialMastery: 0.5,
    learnRate: 0.08,
    guessRate: 0.2,
    slipRate: 0.12,
  },
};

const KNOWLEDGE_TRACING_CONFIG = {
  /**
   * 單項能力保留的最大歷史筆數。
   */
  maximumHistoryLength: 100,

  /**
   * 趨勢判斷使用最近幾筆紀錄。
   */
  trendWindowSize: 5,

  /**
   * 掌握度變化小於此數值視為穩定。
   */
  stableTrendThreshold: 0.015,

  /**
   * 避免機率變成絕對 0 或 1。
   */
  minimumProbability: 0.001,
  maximumProbability: 0.999,

  /**
   * 低可靠度證據仍保留的最低更新權重。
   */
  minimumEvidenceReliability: 0.25,
} as const;

// ---------------------------------------------------------------------------
// 3. 通用工具
// ---------------------------------------------------------------------------

function clamp(
  value: number,
  min = 0,
  max = 1,
): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

function clampProbability(value: number): number {
  return clamp(
    value,
    KNOWLEDGE_TRACING_CONFIG.minimumProbability,
    KNOWLEDGE_TRACING_CONFIG.maximumProbability,
  );
}

function safeDivide(
  numerator: number,
  denominator: number,
  fallback = 0,
): number {
  if (
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    denominator === 0
  ) {
    return fallback;
  }

  return numerator / denominator;
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return safeDivide(
    values.reduce((sum, value) => sum + value, 0),
    values.length,
  );
}

function round(value: number, decimals = 4): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/**
 * 支援難度格式：
 *
 * 0～1：
 * 直接使用。
 *
 * 1～5：
 * 轉換為 0～1。
 *
 * 大於 5：
 * 視為百分制並除以 100。
 */
function normalizeDifficulty(difficulty: number): number {
  if (!Number.isFinite(difficulty)) {
    return 0.5;
  }

  if (difficulty >= 0 && difficulty <= 1) {
    return clamp(difficulty);
  }

  if (difficulty >= 1 && difficulty <= 5) {
    return clamp((difficulty - 1) / 4);
  }

  return clamp(difficulty / 100);
}

/**
 * 支援 score：
 * 0～1 或 0～100。
 */
function normalizeScore(score: number | undefined): number | undefined {
  if (score === undefined || !Number.isFinite(score)) {
    return undefined;
  }

  return score > 1
    ? clamp(score / 100)
    : clamp(score);
}

function cloneParameters(
  parameters: BKTParameters,
): BKTParameters {
  return {
    initialMastery: parameters.initialMastery,
    learnRate: parameters.learnRate,
    guessRate: parameters.guessRate,
    slipRate: parameters.slipRate,
  };
}

function cloneHistoryEntry(
  entry: KnowledgeHistoryEntry,
): KnowledgeHistoryEntry {
  return {
    ...entry,
  };
}

function cloneSkillState(
  skill: SkillKnowledgeState,
): SkillKnowledgeState {
  return {
    ...skill,
    parameters: cloneParameters(skill.parameters),
    history: skill.history.map(cloneHistoryEntry),
  };
}

function cloneKnowledgeState(
  state: KnowledgeTracingState,
): KnowledgeTracingState {
  const skills = {} as Record<
    AbilityKey,
    SkillKnowledgeState
  >;

  for (const ability of ABILITIES) {
    skills[ability] = cloneSkillState(
      state.skills[ability],
    );
  }

  return {
    ...state,
    skills,
  };
}

// ---------------------------------------------------------------------------
// 4. 初始狀態
// ---------------------------------------------------------------------------

function predictSuccess(
  mastery: number,
  guessRate: number,
  slipRate: number,
): number {
  const probability =
    mastery * (1 - slipRate) +
    (1 - mastery) * guessRate;

  return clampProbability(probability);
}

function createInitialSkillState(
  ability: AbilityKey,
  parameters: BKTParameters,
  timestamp: number,
): SkillKnowledgeState {
  const mastery = clampProbability(
    parameters.initialMastery,
  );

  return {
    ability,
    mastery,
    predictedSuccessRate: predictSuccess(
      mastery,
      parameters.guessRate,
      parameters.slipRate,
    ),
    observations: 0,
    successCount: 0,
    failureCount: 0,
    lastUpdatedAt: timestamp,
    trend: 'STABLE',
    parameters: cloneParameters(parameters),
    history: [],
  };
}

/**
 * 建立初始 Knowledge Tracing State。
 */
export function createInitialKnowledgeState(
  learnerId?: string,
  customParameters?: Partial<
    Record<AbilityKey, Partial<BKTParameters>>
  >,
): KnowledgeTracingState {
  const now = Date.now();

  const skills = {} as Record<
    AbilityKey,
    SkillKnowledgeState
  >;

  for (const ability of ABILITIES) {
    const defaultParameters =
      DEFAULT_BKT_PARAMETERS[ability];

    const custom =
      customParameters?.[ability];

    const parameters: BKTParameters = {
      initialMastery: clampProbability(
        custom?.initialMastery ??
          defaultParameters.initialMastery,
      ),
      learnRate: clamp(
        custom?.learnRate ??
          defaultParameters.learnRate,
        0.001,
        0.5,
      ),
      guessRate: clamp(
        custom?.guessRate ??
          defaultParameters.guessRate,
        0.001,
        0.49,
      ),
      slipRate: clamp(
        custom?.slipRate ??
          defaultParameters.slipRate,
        0.001,
        0.49,
      ),
    };

    skills[ability] =
      createInitialSkillState(
        ability,
        parameters,
        now,
      );
  }

  const overallMastery = average(
    ABILITIES.map(
      ability => skills[ability].mastery,
    ),
  );

  const predictedSuccessRate = average(
    ABILITIES.map(
      ability =>
        skills[ability].predictedSuccessRate,
    ),
  );

  return {
    learnerId,
    skills,
    overallMastery: round(overallMastery),
    predictedSuccessRate: round(
      predictedSuccessRate,
    ),
    learningTrend: 'STABLE',
    totalObservations: 0,
    createdAt: now,
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// 5. 動態 BKT 參數
// ---------------------------------------------------------------------------

/**
 * 根據提示、難度與行為調整 Guess Rate。
 *
 * 使用提示時，即使尚未真正掌握，也較可能成功，
 * 因此 guessRate 會提高。
 */
function calculateEffectiveGuessRate(
  baseGuessRate: number,
  observation: KnowledgeObservation,
  features: BehaviorFeatures,
): number {
  const hintLevel =
    observation.hintLevel ?? 0;

  const hintUsed =
    observation.hintUsed === true ||
    hintLevel > 0;

  const hintEffect =
    hintUsed
      ? 0.04 + hintLevel * 0.025
      : 0;

  const dependencyEffect =
    features.hintDependencyRate * 0.08;

  return clamp(
    baseGuessRate +
      hintEffect +
      dependencyEffect,
    0.001,
    0.49,
  );
}

/**
 * 根據難度、認知負荷與行為調整 Slip Rate。
 *
 * 難度越高、認知負荷越高，
 * 已掌握但仍失敗的機率可能增加。
 */
function calculateEffectiveSlipRate(
  baseSlipRate: number,
  difficulty: number,
  features: BehaviorFeatures,
  vector: BehaviorVector,
): number {
  const difficultyEffect =
    difficulty * 0.08;

  const cognitiveLoadEffect =
    features.cognitiveLoadEstimate * 0.08;

  const impulsivenessEffect =
    vector.impulsiveness * 0.05;

  const reflectionProtection =
    vector.reflection * 0.04;

  const efficiencyProtection =
    vector.efficiency * 0.03;

  return clamp(
    baseSlipRate +
      difficultyEffect +
      cognitiveLoadEffect +
      impulsivenessEffect -
      reflectionProtection -
      efficiencyProtection,
    0.001,
    0.49,
  );
}

/**
 * 根據行為與提示使用方式調整 Learn Rate。
 *
 * 正向學習條件：
 * - 有反思
 * - 有規劃
 * - 有堅持
 * - 適當求助
 *
 * 負向條件：
 * - 過度提示依賴
 * - 高衝動
 * - 高認知負荷
 */
function calculateEffectiveLearnRate(
  baseLearnRate: number,
  observation: KnowledgeObservation,
  features: BehaviorFeatures,
  vector: BehaviorVector,
): number {
  const positiveAdjustment =
    vector.reflection * 0.04 +
    vector.planning * 0.03 +
    vector.persistence * 0.03 +
    vector.helpSeeking * 0.02;

  const negativeAdjustment =
    vector.impulsiveness * 0.025 +
    features.hintDependencyRate * 0.04 +
    features.cognitiveLoadEstimate * 0.025;

  const completionRate =
    clamp(
      observation.completionRate ??
        features.completionRate,
    );

  const completionAdjustment =
    completionRate * 0.025;

  return clamp(
    baseLearnRate +
      positiveAdjustment +
      completionAdjustment -
      negativeAdjustment,
    0.01,
    0.45,
  );
}

// ---------------------------------------------------------------------------
// 6. 證據可靠度
// ---------------------------------------------------------------------------

/**
 * 計算單次觀察的可靠度。
 *
 * 可靠度越高，本次觀察對掌握度更新的影響越大。
 *
 * 主要考量：
 * - 是否為主要能力
 * - 是否完成足夠比例
 * - 是否高度依賴提示
 * - 是否有正式得分
 * - 操作是否穩定
 */
function calculateEvidenceReliability(
  observation: KnowledgeObservation,
  features: BehaviorFeatures,
  vector: BehaviorVector,
): number {
  const primarySkillWeight =
    observation.isPrimarySkill === false
      ? 0.65
      : 1;

  const completionRate =
    clamp(
      observation.completionRate ??
        features.completionRate,
    );

  const completionEvidence =
    0.4 + completionRate * 0.6;

  const score = normalizeScore(
    observation.score,
  );

  const scoreEvidence =
    score === undefined
      ? 0.75
      : 0.85 + Math.abs(score - 0.5) * 0.3;

  const hintPenalty =
    clamp(
      features.hintDependencyRate * 1.5,
      0,
      0.35,
    );

  const stabilityEvidence =
    vector.efficiency * 0.15 +
    vector.reflection * 0.1 +
    vector.planning * 0.1;

  const reliability =
    primarySkillWeight *
      completionEvidence *
      scoreEvidence +
    stabilityEvidence -
    hintPenalty;

  return clamp(
    reliability,
    KNOWLEDGE_TRACING_CONFIG
      .minimumEvidenceReliability,
    1,
  );
}

// ---------------------------------------------------------------------------
// 7. Bayesian Knowledge Tracing
// ---------------------------------------------------------------------------

/**
 * 根據觀察結果進行 Bayesian posterior 更新。
 *
 * 成功：
 *
 * P(L|Correct) =
 * P(L) × (1 - Slip)
 * ----------------------------------------
 * P(L) × (1 - Slip) + (1 - P(L)) × Guess
 *
 * 失敗：
 *
 * P(L|Incorrect) =
 * P(L) × Slip
 * ----------------------------------------
 * P(L) × Slip + (1 - P(L)) × (1 - Guess)
 */
function calculatePosteriorMastery(
  priorMastery: number,
  observedSuccess: boolean,
  guessRate: number,
  slipRate: number,
): number {
  const prior =
    clampProbability(priorMastery);

  if (observedSuccess) {
    const numerator =
      prior * (1 - slipRate);

    const denominator =
      numerator +
      (1 - prior) * guessRate;

    return clampProbability(
      safeDivide(
        numerator,
        denominator,
        prior,
      ),
    );
  }

  const numerator =
    prior * slipRate;

  const denominator =
    numerator +
    (1 - prior) * (1 - guessRate);

  return clampProbability(
    safeDivide(
      numerator,
      denominator,
      prior,
    ),
  );
}

/**
 * 根據證據可靠度調整 posterior。
 *
 * 可靠度低時，不完全採用該次觀察的 posterior，
 * 而是讓結果更接近 prior。
 */
function applyEvidenceReliability(
  priorMastery: number,
  posteriorMastery: number,
  reliability: number,
): number {
  return clampProbability(
    priorMastery +
      (posteriorMastery - priorMastery) *
        reliability,
  );
}

/**
 * 套用學習轉移。
 *
 * P(L_next) =
 * P(L_posterior) +
 * (1 - P(L_posterior)) × P(T)
 */
function applyLearningTransition(
  posteriorMastery: number,
  learnRate: number,
): number {
  return clampProbability(
    posteriorMastery +
      (1 - posteriorMastery) *
        learnRate,
  );
}

// ---------------------------------------------------------------------------
// 8. 認知診斷調整
// ---------------------------------------------------------------------------

/**
 * 將認知診斷作為輕量校正證據。
 *
 * Weakness 診斷：
 * 小幅降低本次更新結果。
 *
 * Strength 診斷：
 * 小幅提高本次更新結果。
 *
 * 校正幅度受到 confidence 限制，
 * 避免診斷與 Knowledge Tracing 重複計算造成過度更新。
 */
function applyDiagnosisAdjustment(
  mastery: number,
  ability: AbilityKey,
  diagnoses: CognitiveDiagnosis[],
): number {
  const relatedDiagnoses =
    diagnoses.filter(
      diagnosis =>
        diagnosis.ability === ability,
    );

  if (relatedDiagnoses.length === 0) {
    return mastery;
  }

  let adjustment = 0;

  for (const diagnosis of relatedDiagnoses) {
    const confidence =
      clamp(diagnosis.confidence / 100);

    const label =
      diagnosis.label.toLowerCase();

    const isStrength =
      label.includes('strength') ||
      label.includes('良好') ||
      label.includes('穩定');

    const isWeakness =
      label.includes('weak') ||
      label.includes('load') ||
      label.includes('decline') ||
      label.includes('不足') ||
      label.includes('偏弱') ||
      label.includes('負荷');

    if (isStrength) {
      adjustment += confidence * 0.025;
    } else if (isWeakness) {
      adjustment -= confidence * 0.025;
    }
  }

  return clampProbability(
    mastery + clamp(adjustment, -0.05, 0.05),
  );
}

// ---------------------------------------------------------------------------
// 9. 趨勢分析
// ---------------------------------------------------------------------------

function determineSkillTrend(
  history: KnowledgeHistoryEntry[],
  currentMastery: number,
): 'UP' | 'STABLE' | 'DOWN' {
  if (history.length < 2) {
    return 'STABLE';
  }

  const windowSize =
    KNOWLEDGE_TRACING_CONFIG.trendWindowSize;

  const recentHistory =
    history.slice(
      Math.max(
        0,
        history.length - windowSize,
      ),
    );

  const firstMastery =
    recentHistory[0].priorMastery;

  const change =
    currentMastery - firstMastery;

  if (
    change >
    KNOWLEDGE_TRACING_CONFIG
      .stableTrendThreshold
  ) {
    return 'UP';
  }

  if (
    change <
    -KNOWLEDGE_TRACING_CONFIG
      .stableTrendThreshold
  ) {
    return 'DOWN';
  }

  return 'STABLE';
}

function determineOverallTrend(
  skills: Record<
    AbilityKey,
    SkillKnowledgeState
  >,
): 'UP' | 'STABLE' | 'DOWN' {
  const trendScores =
    ABILITIES.map(ability => {
      const trend =
        skills[ability].trend;

      if (trend === 'UP') return 1;
      if (trend === 'DOWN') return -1;
      return 0;
    });

  const meanTrend =
    average(trendScores);

  if (meanTrend > 0.2) {
    return 'UP';
  }

  if (meanTrend < -0.2) {
    return 'DOWN';
  }

  return 'STABLE';
}

// ---------------------------------------------------------------------------
// 10. 狀態重新計算
// ---------------------------------------------------------------------------

function recalculateKnowledgeState(
  state: KnowledgeTracingState,
  timestamp: number,
): KnowledgeTracingState {
  const overallMastery =
    average(
      ABILITIES.map(
        ability =>
          state.skills[ability].mastery,
      ),
    );

  const predictedSuccessRate =
    average(
      ABILITIES.map(
        ability =>
          state.skills[ability]
            .predictedSuccessRate,
      ),
    );

  return {
    ...state,
    overallMastery:
      round(overallMastery),
    predictedSuccessRate:
      round(predictedSuccessRate),
    learningTrend:
      determineOverallTrend(
        state.skills,
      ),
    totalObservations:
      ABILITIES.reduce(
        (total, ability) =>
          total +
          state.skills[ability]
            .observations,
        0,
      ),
    updatedAt: timestamp,
  };
}

// ---------------------------------------------------------------------------
// 11. 解釋產生
// ---------------------------------------------------------------------------

function getAbilityDisplayName(
  ability: AbilityKey,
): string {
  const labels: Record<
    AbilityKey,
    string
  > = {
    mentalRotation: '心理旋轉',
    spatialVisualization: '空間視覺化',
    perspectiveTaking: '視角轉換',
    planning: '規劃能力',
    workingMemory: '工作記憶',
    persistence: '堅持度',
  };

  return labels[ability];
}

function buildKnowledgeEvidence(params: {
  observation: KnowledgeObservation;
  features: BehaviorFeatures;
  vector: BehaviorVector;
  priorMastery: number;
  posteriorMastery: number;
  updatedMastery: number;
  predictedSuccessBefore: number;
  predictedSuccessAfter: number;
  effectiveLearnRate: number;
  effectiveGuessRate: number;
  effectiveSlipRate: number;
  evidenceReliability: number;
}): KnowledgeTracingEvidence {
  const {
    observation,
    features,
    vector,
    priorMastery,
    posteriorMastery,
    updatedMastery,
    predictedSuccessBefore,
    predictedSuccessAfter,
    effectiveLearnRate,
    effectiveGuessRate,
    effectiveSlipRate,
    evidenceReliability,
  } = params;

  const abilityName =
    getAbilityDisplayName(
      observation.ability,
    );

  const evidence: string[] = [
    `本次任務結果：${
      observation.success
        ? '成功'
        : '未成功'
    }。`,
    `關卡難度：${Math.round(
      normalizeDifficulty(
        observation.difficulty,
      ) * 100,
    )}%。`,
    `任務完成率：${Math.round(
      clamp(
        observation.completionRate ??
          features.completionRate,
      ) * 100,
    )}%。`,
    `錯誤率：${Math.round(
      features.errorRate * 100,
    )}%。`,
    `重試率：${Math.round(
      features.retryRate * 100,
    )}%。`,
    `提示依賴率：${Math.round(
      features.hintDependencyRate * 100,
    )}%。`,
    `行為規劃分數：${Math.round(
      vector.planning * 100,
    )}%。`,
    `反思分數：${Math.round(
      vector.reflection * 100,
    )}%。`,
    `證據可靠度：${Math.round(
      evidenceReliability * 100,
    )}%。`,
  ];

  const masteryChange =
    updatedMastery - priorMastery;

  const direction =
    masteryChange > 0.005
      ? '上升'
      : masteryChange < -0.005
        ? '下降'
        : '維持穩定';

  const explanation =
    `${abilityName}掌握度由 ` +
    `${Math.round(priorMastery * 100)}% ` +
    `${direction}至 ` +
    `${Math.round(updatedMastery * 100)}%。` +
    `模型先根據本次${
      observation.success
        ? '成功'
        : '失敗'
    }結果計算貝氏後驗機率 ` +
    `${Math.round(
      posteriorMastery * 100,
    )}%，` +
    `再套用學習轉移率 ` +
    `${Math.round(
      effectiveLearnRate * 100,
    )}% 與行為證據可靠度進行更新。`;

  return {
    ability: observation.ability,
    previousMastery:
      round(priorMastery),
    posteriorMastery:
      round(posteriorMastery),
    updatedMastery:
      round(updatedMastery),
    masteryChange:
      round(masteryChange),
    predictedSuccessBefore:
      round(predictedSuccessBefore),
    predictedSuccessAfter:
      round(predictedSuccessAfter),
    observedSuccess:
      observation.success,
    effectiveParameters: {
      learnRate:
        round(effectiveLearnRate),
      guessRate:
        round(effectiveGuessRate),
      slipRate:
        round(effectiveSlipRate),
    },
    evidenceReliability:
      round(evidenceReliability),
    evidence,
    explanation,
  };
}

// ---------------------------------------------------------------------------
// 12. 單項能力更新
// ---------------------------------------------------------------------------

/**
 * 更新單一能力的 Knowledge State。
 */
export function updateKnowledgeState(
  currentState: KnowledgeTracingState,
  observation: KnowledgeObservation,
  features: BehaviorFeatures,
  vector: BehaviorVector,
  diagnoses: CognitiveDiagnosis[] = [],
): KnowledgeTracingUpdateResult {
  const state =
    cloneKnowledgeState(
      currentState,
    );

  const timestamp =
    observation.timestamp ??
    Date.now();

  const ability =
    observation.ability;

  const currentSkill =
    state.skills[ability];

  if (!currentSkill) {
    throw new Error(
      `KnowledgeTracingEngine：無效的能力類型 ${ability}`,
    );
  }

  const difficulty =
    normalizeDifficulty(
      observation.difficulty,
    );

  const parameters =
    currentSkill.parameters;

  const effectiveGuessRate =
    calculateEffectiveGuessRate(
      parameters.guessRate,
      observation,
      features,
    );

  const effectiveSlipRate =
    calculateEffectiveSlipRate(
      parameters.slipRate,
      difficulty,
      features,
      vector,
    );

  const effectiveLearnRate =
    calculateEffectiveLearnRate(
      parameters.learnRate,
      observation,
      features,
      vector,
    );

  const evidenceReliability =
    calculateEvidenceReliability(
      observation,
      features,
      vector,
    );

  const priorMastery =
    currentSkill.mastery;

  const predictedSuccessBefore =
    predictSuccess(
      priorMastery,
      effectiveGuessRate,
      effectiveSlipRate,
    );

  const rawPosteriorMastery =
    calculatePosteriorMastery(
      priorMastery,
      observation.success,
      effectiveGuessRate,
      effectiveSlipRate,
    );

  const reliablePosteriorMastery =
    applyEvidenceReliability(
      priorMastery,
      rawPosteriorMastery,
      evidenceReliability,
    );

  const transitionedMastery =
    applyLearningTransition(
      reliablePosteriorMastery,
      effectiveLearnRate,
    );

  const updatedMastery =
    applyDiagnosisAdjustment(
      transitionedMastery,
      ability,
      diagnoses,
    );

  const predictedSuccessAfter =
    predictSuccess(
      updatedMastery,
      effectiveGuessRate,
      effectiveSlipRate,
    );

  const historyEntry: KnowledgeHistoryEntry = {
    timestamp,
    levelId:
      observation.levelId,
    observationId:
      observation.observationId,

    ability,

    priorMastery:
      round(priorMastery),

    posteriorMastery:
      round(
        reliablePosteriorMastery,
      ),

    updatedMastery:
      round(updatedMastery),

    predictedSuccessBefore:
      round(
        predictedSuccessBefore,
      ),

    predictedSuccessAfter:
      round(
        predictedSuccessAfter,
      ),

    observedSuccess:
      observation.success,

    difficulty:
      round(difficulty),

    hintUsed:
      observation.hintUsed === true ||
      (observation.hintLevel ?? 0) > 0,

    hintDependencyRate:
      round(
        features.hintDependencyRate,
      ),

    evidenceReliability:
      round(evidenceReliability),

    effectiveLearnRate:
      round(effectiveLearnRate),

    effectiveGuessRate:
      round(effectiveGuessRate),

    effectiveSlipRate:
      round(effectiveSlipRate),

    change:
      round(
        updatedMastery -
          priorMastery,
      ),
  };

  const nextHistory = [
    ...currentSkill.history,
    historyEntry,
  ].slice(
    -KNOWLEDGE_TRACING_CONFIG
      .maximumHistoryLength,
  );

  const updatedSkill: SkillKnowledgeState = {
    ...currentSkill,

    mastery:
      round(updatedMastery),

    predictedSuccessRate:
      round(
        predictedSuccessAfter,
      ),

    observations:
      currentSkill.observations + 1,

    successCount:
      currentSkill.successCount +
      (observation.success ? 1 : 0),

    failureCount:
      currentSkill.failureCount +
      (observation.success ? 0 : 1),

    lastUpdatedAt:
      timestamp,

    trend:
      determineSkillTrend(
        nextHistory,
        updatedMastery,
      ),

    history:
      nextHistory,
  };

  state.skills[ability] =
    updatedSkill;

  const updatedState =
    recalculateKnowledgeState(
      state,
      timestamp,
    );

  const evidence =
    buildKnowledgeEvidence({
      observation,
      features,
      vector,
      priorMastery,
      posteriorMastery:
        reliablePosteriorMastery,
      updatedMastery,
      predictedSuccessBefore,
      predictedSuccessAfter,
      effectiveLearnRate,
      effectiveGuessRate,
      effectiveSlipRate,
      evidenceReliability,
    });

  return {
    state: updatedState,
    updatedSkill,
    evidence,
  };
}

// ---------------------------------------------------------------------------
// 13. 多能力批次更新
// ---------------------------------------------------------------------------

/**
 * 一個關卡可能同時涉及多項能力。
 *
 * 例如：
 *
 * primarySkill = mentalRotation
 * secondarySkills = [
 *   spatialVisualization,
 *   planning
 * ]
 *
 * 次要能力可將 isPrimarySkill 設為 false，
 * 系統會降低證據可靠度，避免過度更新。
 */
export function updateMultipleKnowledgeStates(
  currentState: KnowledgeTracingState,
  observations: KnowledgeObservation[],
  features: BehaviorFeatures,
  vector: BehaviorVector,
  diagnoses: CognitiveDiagnosis[] = [],
): BatchKnowledgeTracingResult {
  let nextState =
    cloneKnowledgeState(
      currentState,
    );

  const updates: KnowledgeTracingEvidence[] =
    [];

  for (const observation of observations) {
    const result =
      updateKnowledgeState(
        nextState,
        observation,
        features,
        vector,
        diagnoses,
      );

    nextState =
      result.state;

    updates.push(
      result.evidence,
    );
  }

  return {
    state: nextState,
    updates,
  };
}

// ---------------------------------------------------------------------------
// 14. 由關卡資料建立觀察
// ---------------------------------------------------------------------------

/**
 * 建立主要能力與次要能力的觀察陣列。
 */
export function createLevelKnowledgeObservations(params: {
  primarySkill: AbilityKey;
  secondarySkills?: AbilityKey[];

  success: boolean;
  difficulty: number;

  hintUsed?: boolean;
  hintLevel?: 0 | 1 | 2 | 3;

  completionRate?: number;
  score?: number;

  levelId?: string;
  observationId?: string;
  timestamp?: number;
}): KnowledgeObservation[] {
  const {
    primarySkill,
    secondarySkills = [],
    success,
    difficulty,
    hintUsed,
    hintLevel,
    completionRate,
    score,
    levelId,
    observationId,
    timestamp,
  } = params;

  const observations: KnowledgeObservation[] = [
    {
      ability: primarySkill,
      success,
      difficulty,
      hintUsed,
      hintLevel,
      completionRate,
      score,
      isPrimarySkill: true,
      levelId,
      observationId,
      timestamp,
    },
  ];

  const uniqueSecondarySkills =
    Array.from(
      new Set(
        secondarySkills.filter(
          skill =>
            skill !== primarySkill,
        ),
      ),
    );

  for (
    const secondarySkill of
    uniqueSecondarySkills
  ) {
    observations.push({
      ability: secondarySkill,
      success,
      difficulty,
      hintUsed,
      hintLevel,
      completionRate,
      score,
      isPrimarySkill: false,
      levelId,
      observationId,
      timestamp,
    });
  }

  return observations;
}

// ---------------------------------------------------------------------------
// 15. PlayerModel 整合
// ---------------------------------------------------------------------------

/**
 * 固定能力順序。
 *
 * 必須和 types.ts 中 PlayerModel.knowledgeMastery 的
 * 使用順序保持一致。
 */
export const KNOWLEDGE_MASTERY_ORDER: AbilityKey[] = [
  'mentalRotation',
  'spatialVisualization',
  'perspectiveTaking',
  'planning',
  'workingMemory',
  'persistence',
];

/**
 * 將 Knowledge State 轉換為 PlayerModel 所需的知識掌握陣列。
 */
export function knowledgeStateToMasteryArray(
  state: KnowledgeTracingState,
): number[] {
  return KNOWLEDGE_MASTERY_ORDER.map(
    ability =>
      round(
        state.skills[ability].mastery,
      ),
  );
}

/**
 * 將 Knowledge Tracing 結果同步至 PlayerModel。
 *
 * 只更新：
 * - knowledgeMastery
 * - masteryLevel
 * - predictedSuccessRate
 * - learningTrend
 *
 * 不會改動 PlayerModel 其他欄位。
 */
export function applyKnowledgeStateToPlayerModel(
  playerModel: PlayerModel,
  knowledgeState: KnowledgeTracingState,
): PlayerModel {
  return {
    ...playerModel,

    knowledgeMastery:
      knowledgeStateToMasteryArray(
        knowledgeState,
      ),

    masteryLevel:
      round(
        knowledgeState.overallMastery,
      ),

    predictedSuccessRate:
      round(
        knowledgeState
          .predictedSuccessRate,
      ),

    learningTrend:
      knowledgeState.learningTrend,
  };
}

// ---------------------------------------------------------------------------
// 16. 查詢工具
// ---------------------------------------------------------------------------

/**
 * 取得單一能力狀態。
 */
export function getSkillKnowledgeState(
  state: KnowledgeTracingState,
  ability: AbilityKey,
): SkillKnowledgeState {
  return cloneSkillState(
    state.skills[ability],
  );
}

/**
 * 取得能力掌握度。
 */
export function getSkillMastery(
  state: KnowledgeTracingState,
  ability: AbilityKey,
): number {
  return state.skills[ability].mastery;
}

/**
 * 取得最低掌握能力。
 */
export function getWeakestKnowledgeSkill(
  state: KnowledgeTracingState,
): SkillKnowledgeState {
  const sorted =
    ABILITIES.map(
      ability =>
        state.skills[ability],
    ).sort(
      (a, b) =>
        a.mastery - b.mastery,
    );

  return cloneSkillState(sorted[0]);
}

/**
 * 取得最高掌握能力。
 */
export function getStrongestKnowledgeSkill(
  state: KnowledgeTracingState,
): SkillKnowledgeState {
  const sorted =
    ABILITIES.map(
      ability =>
        state.skills[ability],
    ).sort(
      (a, b) =>
        b.mastery - a.mastery,
    );

  return cloneSkillState(sorted[0]);
}

/**
 * 依能力預測下一題成功率。
 *
 * 可傳入不同難度進行調整。
 */
export function predictSkillSuccessForDifficulty(
  state: KnowledgeTracingState,
  ability: AbilityKey,
  difficulty: number,
): number {
  const skill =
    state.skills[ability];

  const normalizedDifficulty =
    normalizeDifficulty(difficulty);

  const difficultyAdjustedSlip =
    clamp(
      skill.parameters.slipRate +
        normalizedDifficulty * 0.1,
      0.001,
      0.49,
    );

  const difficultyAdjustedGuess =
    clamp(
      skill.parameters.guessRate -
        normalizedDifficulty * 0.04,
      0.001,
      0.49,
    );

  return round(
    predictSuccess(
      skill.mastery,
      difficultyAdjustedGuess,
      difficultyAdjustedSlip,
    ),
  );
}

// ---------------------------------------------------------------------------
// 17. 儲存與載入
// ---------------------------------------------------------------------------

/**
 * 將 Knowledge State 轉為 JSON。
 */
export function serializeKnowledgeState(
  state: KnowledgeTracingState,
): string {
  return JSON.stringify(state);
}

/**
 * 從 JSON 還原 Knowledge State。
 *
 * 若資料格式不合法，回傳新的初始狀態。
 */
export function deserializeKnowledgeState(
  json: string,
  learnerId?: string,
): KnowledgeTracingState {
  try {
    const parsed =
      JSON.parse(
        json,
      ) as Partial<KnowledgeTracingState>;

    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !parsed.skills
    ) {
      return createInitialKnowledgeState(
        learnerId,
      );
    }

    const fallback =
      createInitialKnowledgeState(
        learnerId ??
          parsed.learnerId,
      );

    const skills = {} as Record<
      AbilityKey,
      SkillKnowledgeState
    >;

    for (const ability of ABILITIES) {
      const storedSkill =
        parsed.skills[
          ability
        ] as
          | Partial<SkillKnowledgeState>
          | undefined;

      const fallbackSkill =
        fallback.skills[ability];

      skills[ability] = {
        ability,

        mastery:
          clampProbability(
            storedSkill?.mastery ??
              fallbackSkill.mastery,
          ),

        predictedSuccessRate:
          clampProbability(
            storedSkill
              ?.predictedSuccessRate ??
              fallbackSkill
                .predictedSuccessRate,
          ),

        observations:
          Math.max(
            0,
            Math.floor(
              storedSkill
                ?.observations ??
                0,
            ),
          ),

        successCount:
          Math.max(
            0,
            Math.floor(
              storedSkill
                ?.successCount ??
                0,
            ),
          ),

        failureCount:
          Math.max(
            0,
            Math.floor(
              storedSkill
                ?.failureCount ??
                0,
            ),
          ),

        lastUpdatedAt:
          storedSkill
            ?.lastUpdatedAt ??
          fallbackSkill
            .lastUpdatedAt,

        trend:
          storedSkill?.trend === 'UP' ||
          storedSkill?.trend === 'DOWN' ||
          storedSkill?.trend === 'STABLE'
            ? storedSkill.trend
            : 'STABLE',

        parameters: {
          initialMastery:
            clampProbability(
              storedSkill
                ?.parameters
                ?.initialMastery ??
                fallbackSkill
                  .parameters
                  .initialMastery,
            ),

          learnRate:
            clamp(
              storedSkill
                ?.parameters
                ?.learnRate ??
                fallbackSkill
                  .parameters
                  .learnRate,
              0.001,
              0.5,
            ),

          guessRate:
            clamp(
              storedSkill
                ?.parameters
                ?.guessRate ??
                fallbackSkill
                  .parameters
                  .guessRate,
              0.001,
              0.49,
            ),

          slipRate:
            clamp(
              storedSkill
                ?.parameters
                ?.slipRate ??
                fallbackSkill
                  .parameters
                  .slipRate,
              0.001,
              0.49,
            ),
        },

        history:
          Array.isArray(
            storedSkill?.history,
          )
            ? storedSkill.history
                .filter(
                  (
                    item,
                  ): item is KnowledgeHistoryEntry =>
                    Boolean(
                      item &&
                        typeof item ===
                          'object',
                    ),
                )
                .slice(
                  -KNOWLEDGE_TRACING_CONFIG
                    .maximumHistoryLength,
                )
                .map(
                  cloneHistoryEntry,
                )
            : [],
      };
    }

    const restoredState: KnowledgeTracingState = {
      learnerId:
        learnerId ??
        parsed.learnerId,

      skills,

      overallMastery: 0,
      predictedSuccessRate: 0,
      learningTrend: 'STABLE',

      totalObservations:
        parsed.totalObservations ??
        0,

      createdAt:
        parsed.createdAt ??
        Date.now(),

      updatedAt:
        parsed.updatedAt ??
        Date.now(),
    };

    return recalculateKnowledgeState(
      restoredState,
      restoredState.updatedAt,
    );
  } catch {
    return createInitialKnowledgeState(
      learnerId,
    );
  }
}