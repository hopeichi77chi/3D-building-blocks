import {
  AbilityKey,
  BehaviorFeatures,
  BehaviorVector,
  CognitiveDiagnosis,
  DynamicMetricStateMap,
  LearningTrend,
  PlayerModel,
  PlayerModelMetricKey,
} from '../types';

import type {
  KnowledgeTracingState,
} from './knowledgeTracingEngine';

import {
  KNOWLEDGE_MASTERY_ORDER,
  knowledgeStateToMasteryArray,
} from './knowledgeTracingEngine';

// ============================================================================
// Machine Learning Player Model
// Explainable AI-based Adaptive Spatial Reasoning Intelligent Tutoring System
//
// 功能：
// 1. 封裝玩家模型推論流程。
// 2. 整合 BehaviorFeatures、BehaviorVector、CognitiveDiagnosis。
// 3. 整合 KnowledgeTracingState。
// 4. 支援既有 PlayerModel 的平滑更新。
// 5. 提供每個模型欄位的推論證據與信心值。
// 6. 預留未來 Random Forest、XGBoost、神經網路或後端 API 介面。
//
// 目前版本採用：
// Explainable Weighted Predictor（可解釋加權推論模型）
//
// 注意：
// 這不是由正式研究資料訓練出的機器學習模型。
// 正式論文中建議描述為：
// 「封裝於 Machine Learning Player Model 介面中的可解釋加權基準模型」。
// ============================================================================

// ---------------------------------------------------------------------------
// 1. 型別定義
// ---------------------------------------------------------------------------

/**
 * PlayerModel 中所有數值型的推論欄位。
 */
export type PlayerModelMetric = PlayerModelMetricKey;

/**
 * 推論模型種類。
 *
 * WEIGHTED：
 * 目前內建的可解釋加權模型。
 *
 * EXTERNAL：
 * 未來由外部 Predictor 實作，例如後端 ML API。
 */
export type PlayerModelPredictorType =
  | 'WEIGHTED'
  | 'EXTERNAL';

/**
 * 單項推論輸入證據。
 */
export interface PlayerModelInferenceEvidence {
  /**
   * 證據來源欄位。
   */
  source: string;

  /**
   * UI 顯示名稱。
   */
  label: string;

  /**
   * 正規化後的輸入值，0～1。
   */
  value: number;

  /**
   * 模型權重。
   */
  weight: number;

  /**
   * value × weight。
   */
  contribution: number;

  /**
   * positive：數值越高，目標能力越高。
   * negative：數值越高，目標能力越低。
   */
  direction: 'positive' | 'negative';
}

/**
 * 單一玩家模型指標的推論結果。
 */
export interface PlayerMetricPrediction {
  metric: PlayerModelMetric;

  previousValue: number;
  rawPrediction: number;
  updatedValue: number;

  /**
   * 本次更新量。
   */
  delta: number;

  /**
   * 模型對此指標的推論信心，0～1。
   */
  confidence: number;

  evidence: PlayerModelInferenceEvidence[];

  formula: string;
  explanation: string;
}

/**
 * 完整玩家模型推論結果。
 */
export interface PlayerModelInferenceResult {
  playerModel: PlayerModel;

  predictions: PlayerMetricPrediction[];

  /**
   * 每項玩家模型指標的動態狀態。
   * 包含趨勢、信心、觀察次數與證據追蹤。
   */
  metricStates: DynamicMetricStateMap;

  /**
   * 整體模型信心，0～1。
   */
  overallConfidence: number;

  /**
   * 實際使用的 Predictor。
   */
  predictorType: PlayerModelPredictorType;

  generatedAt: number;

  /**
   * 適合儲存於研究資料中的模型版本。
   */
  modelVersion: string;
}

/**
 * 模型推論輸入。
 */
export interface PlayerModelInferenceInput {
  features: BehaviorFeatures;
  behaviorVector: BehaviorVector;
  diagnoses?: CognitiveDiagnosis[];
  knowledgeState?: KnowledgeTracingState;
  previousPlayerModel?: PlayerModel;

  /**
   * 上一次推論留下的動態指標狀態。
   * 若未提供，觀察次數會由 1 開始。
   */
  previousMetricStates?: DynamicMetricStateMap;
}

/**
 * 推論設定。
 */
export interface PlayerModelInferenceOptions {
  /**
   * 新資料對既有玩家模型的更新比例。
   *
   * 0：
   * 完全保留舊模型。
   *
   * 1：
   * 完全採用本次推論。
   *
   * 預設 0.35。
   */
  learningRate?: number;

  /**
   * 診斷結果對能力推論的最大調整幅度。
   *
   * 預設 0.12。
   */
  diagnosisAdjustmentLimit?: number;

  /**
   * Knowledge Tracing 對空間能力分數的混合比例。
   *
   * 預設 0.35。
   */
  knowledgeWeight?: number;

  /**
   * 是否將結果四捨五入。
   */
  roundResults?: boolean;
}

/**
 * 外部 Predictor 介面。
 *
 * 未來可建立：
 * - RandomForestPredictor
 * - XGBoostApiPredictor
 * - TensorFlowPredictor
 */
export interface PlayerModelPredictor {
  readonly type: PlayerModelPredictorType;
  readonly version: string;

  predict(
    input: PlayerModelInferenceInput,
    options?: PlayerModelInferenceOptions,
  ): PlayerModelInferenceResult;
}

/**
 * 加權模型內部證據定義。
 */
interface WeightedEvidenceDefinition {
  source: string;
  label: string;
  value: number;
  weight: number;
  direction?: 'positive' | 'negative';
}

// ---------------------------------------------------------------------------
// 2. 常數
// ---------------------------------------------------------------------------

const MODEL_VERSION =
  'XAI-ASRITS-PLAYER-MODEL-WEIGHTED-V1.0';

const DEFAULT_OPTIONS: Required<PlayerModelInferenceOptions> = {
  learningRate: 0.35,
  diagnosisAdjustmentLimit: 0.12,
  knowledgeWeight: 0.35,
  roundResults: true,
};

const DEFAULT_PLAYER_VALUE = 0.5;

const PLAYER_MODEL_METRICS: PlayerModelMetric[] = [
  'mentalRotation',
  'spatialVisualization',
  'perspectiveTaking',
  'planning',
  'workingMemory',
  'persistence',
  'hintDependency',
  'confidence',
  'exploration',
  'efficiency',
  'helpSeeking',
  'reflection',
  'impulsiveness',
  'selfRegulation',
  'cognitiveLoad',
  'engagement',
  'motivation',
  'masteryLevel',
  'predictedSuccessRate',
];

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

function normalize(
  value: number,
  referenceMaximum: number,
): number {
  if (referenceMaximum <= 0) {
    return 0;
  }

  return clamp(value / referenceMaximum);
}

function inverse(value: number): number {
  return clamp(1 - value);
}

function round(value: number, decimals = 4): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return safeDivide(
    values.reduce(
      (sum, value) => sum + value,
      0,
    ),
    values.length,
  );
}

function mergeOptions(
  options?: PlayerModelInferenceOptions,
): Required<PlayerModelInferenceOptions> {
  return {
    learningRate: clamp(
      options?.learningRate ??
        DEFAULT_OPTIONS.learningRate,
    ),

    diagnosisAdjustmentLimit: clamp(
      options?.diagnosisAdjustmentLimit ??
        DEFAULT_OPTIONS.diagnosisAdjustmentLimit,
      0,
      0.3,
    ),

    knowledgeWeight: clamp(
      options?.knowledgeWeight ??
        DEFAULT_OPTIONS.knowledgeWeight,
    ),

    roundResults:
      options?.roundResults ??
      DEFAULT_OPTIONS.roundResults,
  };
}

function formatPercent(value: number): string {
  return `${Math.round(clamp(value) * 100)}%`;
}

/**
 * 指數移動平均式更新。
 *
 * updated =
 * previous × (1 - learningRate)
 * + prediction × learningRate
 */
function smoothUpdate(
  previous: number,
  prediction: number,
  learningRate: number,
): number {
  return clamp(
    previous * (1 - learningRate) +
      prediction * learningRate,
  );
}

/**
 * 建立標準化推論證據。
 */
function createEvidence(
  definition: WeightedEvidenceDefinition,
): PlayerModelInferenceEvidence {
  const direction =
    definition.direction ?? 'positive';

  const boundedValue =
    clamp(definition.value);

  const transformedValue =
    direction === 'negative'
      ? inverse(boundedValue)
      : boundedValue;

  return {
    source: definition.source,
    label: definition.label,
    value: boundedValue,
    weight: Math.max(0, definition.weight),
    contribution:
      transformedValue *
      Math.max(0, definition.weight),
    direction,
  };
}

/**
 * 加權推論。
 *
 * negative 證據會在模型內轉換為 1 - value。
 */
function weightedPrediction(
  definitions: WeightedEvidenceDefinition[],
  fallback = DEFAULT_PLAYER_VALUE,
): {
  prediction: number;
  evidence: PlayerModelInferenceEvidence[];
  confidence: number;
} {
  if (definitions.length === 0) {
    return {
      prediction: fallback,
      evidence: [],
      confidence: 0,
    };
  }

  const evidence =
    definitions.map(createEvidence);

  const totalWeight =
    evidence.reduce(
      (sum, item) =>
        sum + item.weight,
      0,
    );

  if (totalWeight === 0) {
    return {
      prediction: fallback,
      evidence,
      confidence: 0,
    };
  }

  const weightedSum =
    evidence.reduce(
      (sum, item) =>
        sum + item.contribution,
      0,
    );

  const prediction =
    clamp(weightedSum / totalWeight);

  /**
   * 信心值考量：
   * 1. 總權重是否充足。
   * 2. 證據數量。
   * 3. 證據值是否遠離完全不確定的 0.5。
   */
  const weightCoverage =
    clamp(totalWeight);

  const evidenceCoverage =
    clamp(evidence.length / 5);

  const evidenceClarity =
    average(
      evidence.map(item =>
        Math.abs(item.value - 0.5) * 2,
      ),
    );

  const confidence =
    clamp(
      weightCoverage * 0.4 +
        evidenceCoverage * 0.25 +
        evidenceClarity * 0.35,
    );

  return {
    prediction,
    evidence,
    confidence,
  };
}

function getMetricLabel(
  metric: PlayerModelMetric,
): string {
  const labels: Record<
    PlayerModelMetric,
    string
  > = {
    mentalRotation: '心理旋轉能力',
    spatialVisualization: '空間視覺化能力',
    perspectiveTaking: '視角轉換能力',
    planning: '規劃能力',
    workingMemory: '工作記憶',
    persistence: '堅持度',
    hintDependency: '提示依賴',
    confidence: '學習自信',
    exploration: '探索傾向',
    efficiency: '操作效率',
    helpSeeking: '適當求助',
    reflection: '反思能力',
    impulsiveness: '衝動操作',
    selfRegulation: '自我調節',
    cognitiveLoad: '認知負荷',
    engagement: '學習投入',
    motivation: '學習動機',
    masteryLevel: '整體知識掌握度',
    predictedSuccessRate: '預測成功率',
  };

  return labels[metric];
}

// ---------------------------------------------------------------------------
// 4. 初始 PlayerModel
// ---------------------------------------------------------------------------

/**
 * 建立初始玩家模型。
 *
 * 掌握狀態以 0.5 表示中性／證據不足，
 * 而不是能力差。
 */
export function createInitialPlayerModel(): PlayerModel {
  return {
    // 空間能力
    mentalRotation: DEFAULT_PLAYER_VALUE,
    spatialVisualization: DEFAULT_PLAYER_VALUE,
    perspectiveTaking: DEFAULT_PLAYER_VALUE,
    planning: DEFAULT_PLAYER_VALUE,
    workingMemory: DEFAULT_PLAYER_VALUE,
    persistence: DEFAULT_PLAYER_VALUE,

    // 學習者特質
    hintDependency: 0,
    confidence: DEFAULT_PLAYER_VALUE,
    exploration: DEFAULT_PLAYER_VALUE,
    efficiency: DEFAULT_PLAYER_VALUE,
    helpSeeking: DEFAULT_PLAYER_VALUE,
    reflection: DEFAULT_PLAYER_VALUE,
    impulsiveness: DEFAULT_PLAYER_VALUE,
    selfRegulation: DEFAULT_PLAYER_VALUE,
    cognitiveLoad: DEFAULT_PLAYER_VALUE,
    engagement: DEFAULT_PLAYER_VALUE,
    motivation: DEFAULT_PLAYER_VALUE,

    // Knowledge Tracing
    knowledgeMastery: KNOWLEDGE_MASTERY_ORDER.map(
      () => DEFAULT_PLAYER_VALUE,
    ),

    masteryLevel: DEFAULT_PLAYER_VALUE,
    predictedSuccessRate: DEFAULT_PLAYER_VALUE,
    learningTrend: 'STABLE',
  };
}

// ---------------------------------------------------------------------------
// 5. Cognitive Diagnosis 調整
// ---------------------------------------------------------------------------

interface DiagnosisAdjustmentResult {
  adjustment: number;
  evidence: PlayerModelInferenceEvidence[];
}

/**
 * 判斷診斷是否為能力優勢。
 */
function isStrengthDiagnosis(
  diagnosis: CognitiveDiagnosis,
): boolean {
  const label =
    diagnosis.label.toLowerCase();

  return (
    label.includes('strength') ||
    label.includes('良好') ||
    label.includes('穩定') ||
    label.includes('優勢')
  );
}

/**
 * 判斷診斷是否為能力弱點。
 */
function isWeaknessDiagnosis(
  diagnosis: CognitiveDiagnosis,
): boolean {
  const label =
    diagnosis.label.toLowerCase();

  return (
    label.includes('weak') ||
    label.includes('load') ||
    label.includes('decline') ||
    label.includes('不足') ||
    label.includes('偏弱') ||
    label.includes('負荷') ||
    label.includes('下降')
  );
}

/**
 * 取得單項能力的診斷調整。
 */
function calculateDiagnosisAdjustment(
  ability: AbilityKey,
  diagnoses: CognitiveDiagnosis[],
  maximumAdjustment: number,
): DiagnosisAdjustmentResult {
  const related =
    diagnoses.filter(
      diagnosis =>
        diagnosis.ability === ability,
    );

  if (related.length === 0) {
    return {
      adjustment: 0,
      evidence: [],
    };
  }

  let adjustment = 0;

  const evidence: PlayerModelInferenceEvidence[] =
    [];

  for (const diagnosis of related) {
    const confidence =
      clamp(
        diagnosis.confidence / 100,
      );

    let signedAdjustment = 0;

    if (isStrengthDiagnosis(diagnosis)) {
      signedAdjustment =
        confidence *
        maximumAdjustment;
    } else if (
      isWeaknessDiagnosis(diagnosis)
    ) {
      signedAdjustment =
        -confidence *
        maximumAdjustment;
    }

    adjustment += signedAdjustment;

    evidence.push({
      source:
        `diagnosis.${diagnosis.ruleId}`,
      label: diagnosis.label,
      value: confidence,
      weight: maximumAdjustment,
      contribution: signedAdjustment,
      direction:
        signedAdjustment >= 0
          ? 'positive'
          : 'negative',
    });
  }

  return {
    adjustment: clamp(
      adjustment,
      -maximumAdjustment,
      maximumAdjustment,
    ),
    evidence,
  };
}

// ---------------------------------------------------------------------------
// 6. Knowledge Tracing 整合
// ---------------------------------------------------------------------------

function getKnowledgeMastery(
  ability: AbilityKey,
  knowledgeState?: KnowledgeTracingState,
): number | undefined {
  if (!knowledgeState) {
    return undefined;
  }

  return knowledgeState
    .skills[ability]
    .mastery;
}

/**
 * 將行為式能力推論與 KT 掌握度混合。
 */
function blendWithKnowledgeMastery(
  behavioralPrediction: number,
  ability: AbilityKey,
  knowledgeState: KnowledgeTracingState | undefined,
  knowledgeWeight: number,
): number {
  const mastery =
    getKnowledgeMastery(
      ability,
      knowledgeState,
    );

  if (mastery === undefined) {
    return behavioralPrediction;
  }

  return clamp(
    behavioralPrediction *
      (1 - knowledgeWeight) +
      mastery *
        knowledgeWeight,
  );
}

// ---------------------------------------------------------------------------
// 7. 六項核心能力推論
// ---------------------------------------------------------------------------

function predictMentalRotation(
  input: PlayerModelInferenceInput,
  options: Required<PlayerModelInferenceOptions>,
): {
  prediction: number;
  confidence: number;
  evidence: PlayerModelInferenceEvidence[];
  formula: string;
} {
  const { features: f, behaviorVector: v } =
    input;

  const moderateRotationScore =
    f.rotationFrequency >= 2 &&
    f.rotationFrequency <= 12
      ? 1
      : f.rotationFrequency < 2
        ? 0.45
        : clamp(
            1 -
              (f.rotationFrequency - 12) /
                18,
          );

  const weighted =
    weightedPrediction([
      {
        source:
          'features.rotationFrequency',
        label: '適當視角旋轉',
        value: moderateRotationScore,
        weight: 0.18,
      },
      {
        source: 'features.successRate',
        label: '建構成功率',
        value: f.successRate,
        weight: 0.22,
      },
      {
        source: 'features.errorRate',
        label: '建構錯誤率',
        value: f.errorRate,
        weight: 0.18,
        direction: 'negative',
      },
      {
        source: 'features.retryRate',
        label: '重試率',
        value: f.retryRate,
        weight: 0.12,
        direction: 'negative',
      },
      {
        source: 'vector.exploration',
        label: '視角探索品質',
        value: v.exploration,
        weight: 0.15,
      },
      {
        source: 'vector.efficiency',
        label: '操作效率',
        value: v.efficiency,
        weight: 0.15,
      },
    ]);

  const diagnosisAdjustment =
    calculateDiagnosisAdjustment(
      'mentalRotation',
      input.diagnoses ?? [],
      options.diagnosisAdjustmentLimit,
    );

  const adjusted =
    clamp(
      weighted.prediction +
        diagnosisAdjustment.adjustment,
    );

  return {
    prediction:
      blendWithKnowledgeMastery(
        adjusted,
        'mentalRotation',
        input.knowledgeState,
        options.knowledgeWeight,
      ),
    confidence: weighted.confidence,
    evidence: [
      ...weighted.evidence,
      ...diagnosisAdjustment.evidence,
    ],
    formula:
      'MentalRotation = WeightedBehavior + DiagnosisAdjustment + KnowledgeMasteryBlend',
  };
}

function predictSpatialVisualization(
  input: PlayerModelInferenceInput,
  options: Required<PlayerModelInferenceOptions>,
): {
  prediction: number;
  confidence: number;
  evidence: PlayerModelInferenceEvidence[];
  formula: string;
} {
  const { features: f, behaviorVector: v } =
    input;

  const weighted =
    weightedPrediction([
      {
        source: 'features.successRate',
        label: '建構成功率',
        value: f.successRate,
        weight: 0.22,
      },
      {
        source:
          'features.completionRate',
        label: '關卡完成率',
        value: f.completionRate,
        weight: 0.18,
      },
      {
        source:
          'features.sequenceConsistency',
        label: '建構序列一致性',
        value: f.sequenceConsistency,
        weight: 0.16,
      },
      {
        source:
          'features.constructionOrderScore',
        label: '建構順序分數',
        value:
          f.constructionOrderScore,
        weight: 0.14,
      },
      {
        source: 'features.errorRate',
        label: '建構錯誤率',
        value: f.errorRate,
        weight: 0.14,
        direction: 'negative',
      },
      {
        source: 'features.retryRate',
        label: '試誤比例',
        value: f.retryRate,
        weight: 0.08,
        direction: 'negative',
      },
      {
        source: 'vector.efficiency',
        label: '建構效率',
        value: v.efficiency,
        weight: 0.08,
      },
    ]);

  const diagnosisAdjustment =
    calculateDiagnosisAdjustment(
      'spatialVisualization',
      input.diagnoses ?? [],
      options.diagnosisAdjustmentLimit,
    );

  const adjusted =
    clamp(
      weighted.prediction +
        diagnosisAdjustment.adjustment,
    );

  return {
    prediction:
      blendWithKnowledgeMastery(
        adjusted,
        'spatialVisualization',
        input.knowledgeState,
        options.knowledgeWeight,
      ),
    confidence: weighted.confidence,
    evidence: [
      ...weighted.evidence,
      ...diagnosisAdjustment.evidence,
    ],
    formula:
      'SpatialVisualization = Performance + SequenceQuality + Diagnosis + KT',
  };
}

function predictPerspectiveTaking(
  input: PlayerModelInferenceInput,
  options: Required<PlayerModelInferenceOptions>,
): {
  prediction: number;
  confidence: number;
  evidence: PlayerModelInferenceEvidence[];
  formula: string;
} {
  const { features: f, behaviorVector: v } =
    input;

  const viewUsage =
    normalize(
      f.perspectiveChangeCount,
      8,
    );

  const viewSwitchQuality =
    f.viewSwitchFrequency >= 2 &&
    f.viewSwitchFrequency <= 15
      ? 1
      : f.viewSwitchFrequency < 2
        ? normalize(
            f.viewSwitchFrequency,
            2,
          )
        : clamp(
            1 -
              (f.viewSwitchFrequency - 15) /
                20,
          );

  const weighted =
    weightedPrediction([
      {
        source:
          'features.perspectiveChangeCount',
        label: '多視角使用程度',
        value: viewUsage,
        weight: 0.25,
      },
      {
        source:
          'features.viewSwitchFrequency',
        label: '視角切換品質',
        value: viewSwitchQuality,
        weight: 0.18,
      },
      {
        source: 'vector.exploration',
        label: '探索行為',
        value: v.exploration,
        weight: 0.2,
      },
      {
        source: 'features.successRate',
        label: '建構成功率',
        value: f.successRate,
        weight: 0.14,
      },
      {
        source: 'features.errorRate',
        label: '視角相關錯誤風險',
        value: f.errorRate,
        weight: 0.13,
        direction: 'negative',
      },
      {
        source: 'vector.reflection',
        label: '視角反思與確認',
        value: v.reflection,
        weight: 0.1,
      },
    ]);

  const diagnosisAdjustment =
    calculateDiagnosisAdjustment(
      'perspectiveTaking',
      input.diagnoses ?? [],
      options.diagnosisAdjustmentLimit,
    );

  const adjusted =
    clamp(
      weighted.prediction +
        diagnosisAdjustment.adjustment,
    );

  return {
    prediction:
      blendWithKnowledgeMastery(
        adjusted,
        'perspectiveTaking',
        input.knowledgeState,
        options.knowledgeWeight,
      ),
    confidence: weighted.confidence,
    evidence: [
      ...weighted.evidence,
      ...diagnosisAdjustment.evidence,
    ],
    formula:
      'PerspectiveTaking = ViewUse + Exploration + Reflection + Diagnosis + KT',
  };
}

function predictPlanning(
  input: PlayerModelInferenceInput,
  options: Required<PlayerModelInferenceOptions>,
): {
  prediction: number;
  confidence: number;
  evidence: PlayerModelInferenceEvidence[];
  formula: string;
} {
  const { features: f, behaviorVector: v } =
    input;

  const weighted =
    weightedPrediction([
      {
        source: 'vector.planning',
        label: '規劃行為向量',
        value: v.planning,
        weight: 0.26,
      },
      {
        source: 'features.planningScore',
        label: '規劃特徵分數',
        value: f.planningScore,
        weight: 0.22,
      },
      {
        source:
          'features.constructionOrderScore',
        label: '建構順序規律',
        value:
          f.constructionOrderScore,
        weight: 0.17,
      },
      {
        source:
          'features.sequenceConsistency',
        label: '操作序列一致性',
        value: f.sequenceConsistency,
        weight: 0.16,
      },
      {
        source: 'features.retryRate',
        label: '重試比例',
        value: f.retryRate,
        weight: 0.1,
        direction: 'negative',
      },
      {
        source: 'vector.impulsiveness',
        label: '衝動操作傾向',
        value: v.impulsiveness,
        weight: 0.09,
        direction: 'negative',
      },
    ]);

  const diagnosisAdjustment =
    calculateDiagnosisAdjustment(
      'planning',
      input.diagnoses ?? [],
      options.diagnosisAdjustmentLimit,
    );

  const adjusted =
    clamp(
      weighted.prediction +
        diagnosisAdjustment.adjustment,
    );

  return {
    prediction:
      blendWithKnowledgeMastery(
        adjusted,
        'planning',
        input.knowledgeState,
        options.knowledgeWeight,
      ),
    confidence: weighted.confidence,
    evidence: [
      ...weighted.evidence,
      ...diagnosisAdjustment.evidence,
    ],
    formula:
      'Planning = PlanningVector + Order + Consistency - Retry - Impulsiveness + Diagnosis + KT',
  };
}

function predictWorkingMemory(
  input: PlayerModelInferenceInput,
  options: Required<PlayerModelInferenceOptions>,
): {
  prediction: number;
  confidence: number;
  evidence: PlayerModelInferenceEvidence[];
  formula: string;
} {
  const { features: f, behaviorVector: v } =
    input;

  const hintIndependence =
    inverse(
      normalize(
        f.hintDependencyRate,
        0.25,
      ),
    );

  const correctionStability =
    inverse(
      normalize(
        f.undoCount +
          f.redoCount +
          f.blockReplacementCount,
        10,
      ),
    );

  const weighted =
    weightedPrediction([
      {
        source:
          'features.cognitiveLoadEstimate',
        label: '低認知負荷',
        value:
          f.cognitiveLoadEstimate,
        weight: 0.23,
        direction: 'negative',
      },
      {
        source:
          'features.sequenceConsistency',
        label: '操作序列穩定',
        value: f.sequenceConsistency,
        weight: 0.2,
      },
      {
        source:
          'features.hintDependencyRate',
        label: '提示獨立程度',
        value: hintIndependence,
        weight: 0.16,
      },
      {
        source: 'features.successRate',
        label: '任務成功率',
        value: f.successRate,
        weight: 0.16,
      },
      {
        source:
          'features.correctionStability',
        label: '修正操作穩定性',
        value: correctionStability,
        weight: 0.12,
      },
      {
        source: 'vector.reflection',
        label: '反思行為',
        value: v.reflection,
        weight: 0.08,
      },
      {
        source: 'vector.efficiency',
        label: '操作效率',
        value: v.efficiency,
        weight: 0.05,
      },
    ]);

  const diagnosisAdjustment =
    calculateDiagnosisAdjustment(
      'workingMemory',
      input.diagnoses ?? [],
      options.diagnosisAdjustmentLimit,
    );

  const adjusted =
    clamp(
      weighted.prediction +
        diagnosisAdjustment.adjustment,
    );

  return {
    prediction:
      blendWithKnowledgeMastery(
        adjusted,
        'workingMemory',
        input.knowledgeState,
        options.knowledgeWeight,
      ),
    confidence: weighted.confidence,
    evidence: [
      ...weighted.evidence,
      ...diagnosisAdjustment.evidence,
    ],
    formula:
      'WorkingMemory = LowLoad + SequenceStability + HintIndependence + Diagnosis + KT',
  };
}

function predictPersistence(
  input: PlayerModelInferenceInput,
  options: Required<PlayerModelInferenceOptions>,
): {
  prediction: number;
  confidence: number;
  evidence: PlayerModelInferenceEvidence[];
  formula: string;
} {
  const { features: f, behaviorVector: v } =
    input;

  const lowIdle =
    inverse(
      normalize(f.idleTime, 60),
    );

  const weighted =
    weightedPrediction([
      {
        source: 'vector.persistence',
        label: '堅持行為向量',
        value: v.persistence,
        weight: 0.32,
      },
      {
        source:
          'features.persistenceScore',
        label: '堅持特徵分數',
        value: f.persistenceScore,
        weight: 0.25,
      },
      {
        source:
          'features.completionRate',
        label: '關卡完成率',
        value: f.completionRate,
        weight: 0.18,
      },
      {
        source: 'features.idleTime',
        label: '持續投入程度',
        value: lowIdle,
        weight: 0.1,
      },
      {
        source: 'vector.reflection',
        label: '錯誤後反思',
        value: v.reflection,
        weight: 0.08,
      },
      {
        source: 'vector.helpSeeking',
        label: '適當求助',
        value: v.helpSeeking,
        weight: 0.07,
      },
    ]);

  const diagnosisAdjustment =
    calculateDiagnosisAdjustment(
      'persistence',
      input.diagnoses ?? [],
      options.diagnosisAdjustmentLimit,
    );

  const adjusted =
    clamp(
      weighted.prediction +
        diagnosisAdjustment.adjustment,
    );

  return {
    prediction:
      blendWithKnowledgeMastery(
        adjusted,
        'persistence',
        input.knowledgeState,
        options.knowledgeWeight,
      ),
    confidence: weighted.confidence,
    evidence: [
      ...weighted.evidence,
      ...diagnosisAdjustment.evidence,
    ],
    formula:
      'Persistence = PersistenceBehavior + Completion + ContinuedEngagement + Diagnosis + KT',
  };
}

// ---------------------------------------------------------------------------
// 8. 學習者特質推論
// ---------------------------------------------------------------------------

function predictHintDependency(
  f: BehaviorFeatures,
  v: BehaviorVector,
): ReturnType<typeof weightedPrediction> {
  return weightedPrediction([
    {
      source:
        'features.hintDependencyRate',
      label: '提示請求比例',
      value: normalize(
        f.hintDependencyRate,
        0.25,
      ),
      weight: 0.45,
    },
    {
      source:
        'features.hintRequestCount',
      label: '提示請求次數',
      value: normalize(
        f.hintRequestCount,
        5,
      ),
      weight: 0.2,
    },
    {
      source:
        'features.hintReadingTime',
      label: '提示閱讀投入',
      value: normalize(
        f.hintReadingTime,
        60,
      ),
      weight: 0.1,
    },
    {
      source: 'vector.helpSeeking',
      label: '適當求助程度',
      value: v.helpSeeking,
      weight: 0.1,
      direction: 'negative',
    },
    {
      source: 'features.successRate',
      label: '無提示成功表現',
      value: f.successRate,
      weight: 0.15,
      direction: 'negative',
    },
  ]);
}

function predictConfidence(
  f: BehaviorFeatures,
  v: BehaviorVector,
): ReturnType<typeof weightedPrediction> {
  return weightedPrediction([
    {
      source: 'vector.confidence',
      label: '行為自信向量',
      value: v.confidence,
      weight: 0.35,
    },
    {
      source:
        'features.confidenceScore',
      label: '自信特徵分數',
      value: f.confidenceScore,
      weight: 0.25,
    },
    {
      source: 'features.successRate',
      label: '成功經驗',
      value: f.successRate,
      weight: 0.18,
    },
    {
      source: 'vector.efficiency',
      label: '操作效率',
      value: v.efficiency,
      weight: 0.1,
    },
    {
      source: 'features.errorRate',
      label: '錯誤壓力',
      value: f.errorRate,
      weight: 0.07,
      direction: 'negative',
    },
    {
      source: 'vector.impulsiveness',
      label: '不穩定操作',
      value: v.impulsiveness,
      weight: 0.05,
      direction: 'negative',
    },
  ]);
}

function predictSelfRegulation(
  f: BehaviorFeatures,
  v: BehaviorVector,
): ReturnType<typeof weightedPrediction> {
  return weightedPrediction([
    {
      source: 'vector.planning',
      label: '事前規劃',
      value: v.planning,
      weight: 0.22,
    },
    {
      source: 'vector.reflection',
      label: '事後反思',
      value: v.reflection,
      weight: 0.23,
    },
    {
      source: 'vector.persistence',
      label: '持續投入',
      value: v.persistence,
      weight: 0.18,
    },
    {
      source: 'vector.helpSeeking',
      label: '適當求助',
      value: v.helpSeeking,
      weight: 0.12,
    },
    {
      source:
        'features.sequenceConsistency',
      label: '策略一致性',
      value: f.sequenceConsistency,
      weight: 0.12,
    },
    {
      source: 'vector.impulsiveness',
      label: '衝動操作',
      value: v.impulsiveness,
      weight: 0.13,
      direction: 'negative',
    },
  ]);
}

function predictEngagement(
  f: BehaviorFeatures,
  v: BehaviorVector,
): ReturnType<typeof weightedPrediction> {
  const lowIdle =
    inverse(
      normalize(f.idleTime, 60),
    );

  const meaningfulActivity =
    normalize(
      f.blockPlacementCount +
        f.blockMoveCount +
        f.cameraRotationCount +
        f.perspectiveChangeCount,
      30,
    );

  return weightedPrediction([
    {
      source: 'vector.persistence',
      label: '持續投入',
      value: v.persistence,
      weight: 0.25,
    },
    {
      source:
        'features.completionRate',
      label: '任務完成投入',
      value: f.completionRate,
      weight: 0.2,
    },
    {
      source: 'features.idleTime',
      label: '非閒置程度',
      value: lowIdle,
      weight: 0.18,
    },
    {
      source:
        'features.meaningfulActivity',
      label: '有效操作密度',
      value: meaningfulActivity,
      weight: 0.17,
    },
    {
      source: 'vector.exploration',
      label: '主動探索',
      value: v.exploration,
      weight: 0.1,
    },
    {
      source: 'vector.reflection',
      label: '認知投入',
      value: v.reflection,
      weight: 0.1,
    },
  ]);
}

function predictMotivation(
  f: BehaviorFeatures,
  v: BehaviorVector,
  confidence: number,
  engagement: number,
): ReturnType<typeof weightedPrediction> {
  return weightedPrediction([
    {
      source: 'derived.engagement',
      label: '學習投入',
      value: engagement,
      weight: 0.28,
    },
    {
      source: 'vector.persistence',
      label: '堅持程度',
      value: v.persistence,
      weight: 0.22,
    },
    {
      source: 'derived.confidence',
      label: '成功自信',
      value: confidence,
      weight: 0.18,
    },
    {
      source:
        'features.completionRate',
      label: '完成經驗',
      value: f.completionRate,
      weight: 0.15,
    },
    {
      source: 'vector.helpSeeking',
      label: '主動求助',
      value: v.helpSeeking,
      weight: 0.07,
    },
    {
      source:
        'features.cognitiveLoadEstimate',
      label: '認知負荷壓力',
      value:
        f.cognitiveLoadEstimate,
      weight: 0.1,
      direction: 'negative',
    },
  ]);
}

// ---------------------------------------------------------------------------
// 9. Prediction 建立
// ---------------------------------------------------------------------------

function createMetricPrediction(params: {
  metric: PlayerModelMetric;
  previousValue: number;
  rawPrediction: number;
  learningRate: number;
  confidence: number;
  evidence: PlayerModelInferenceEvidence[];
  formula: string;
  roundResults: boolean;
}): PlayerMetricPrediction {
  const {
    metric,
    previousValue,
    rawPrediction,
    learningRate,
    confidence,
    evidence,
    formula,
    roundResults,
  } = params;

  const updatedValue =
    smoothUpdate(
      previousValue,
      rawPrediction,
      learningRate,
    );

  const outputPrevious =
    roundResults
      ? round(previousValue)
      : previousValue;

  const outputRaw =
    roundResults
      ? round(rawPrediction)
      : rawPrediction;

  const outputUpdated =
    roundResults
      ? round(updatedValue)
      : updatedValue;

  const delta =
    outputUpdated -
    outputPrevious;

  const direction =
    delta > 0.005
      ? '上升'
      : delta < -0.005
        ? '下降'
        : '維持穩定';

  return {
    metric,
    previousValue: outputPrevious,
    rawPrediction: outputRaw,
    updatedValue: outputUpdated,
    delta:
      roundResults
        ? round(delta)
        : delta,
    confidence:
      roundResults
        ? round(confidence)
        : confidence,
    evidence,
    formula,
    explanation:
      `${getMetricLabel(metric)}由 ` +
      `${formatPercent(previousValue)} ` +
      `${direction}至 ` +
      `${formatPercent(updatedValue)}；` +
      `本次原始推論值為 ` +
      `${formatPercent(rawPrediction)}，` +
      `模型信心為 ` +
      `${formatPercent(confidence)}。`,
  };
}

/**
 * 根據本次推論結果建立 Dynamic Player Model 狀態。
 *
 * 此函式可直接供 App.tsx、研究匯出模組與 Dashboard 使用，
 * 避免各處自行重複計算趨勢、觀察次數與證據摘要。
 */
export function createDynamicMetricStates(
  predictions: PlayerMetricPrediction[],
  previousMetricStates: DynamicMetricStateMap = {},
  generatedAt = Date.now(),
): DynamicMetricStateMap {
  const states: DynamicMetricStateMap = {};

  for (const prediction of predictions) {
    const metric = prediction.metric;
    const previousState = previousMetricStates[metric];

    const trend: LearningTrend =
      prediction.delta > 0.01
        ? 'UP'
        : prediction.delta < -0.01
          ? 'DOWN'
          : 'STABLE';

    const evidenceIds = prediction.evidence.map((evidence, index) =>
      [
        metric,
        generatedAt,
        evidence.source.replace(/[^a-zA-Z0-9_.-]/g, '_'),
        index,
      ].join('-'),
    );

    states[metric] = {
      metric,
      value: clamp(prediction.updatedValue),
      previousValue: clamp(prediction.previousValue),
      change: round(prediction.delta),
      confidence: clamp(prediction.confidence),
      trend,
      observations: Math.max(1, (previousState?.observations ?? 0) + 1),
      lastUpdatedAt: generatedAt,
      evidenceIds,
      evidenceSummary: prediction.evidence.map(evidence => {
        const direction = evidence.direction === 'negative' ? '負向' : '正向';
        return (
          `${evidence.label}（${direction}）：` +
          `${formatPercent(evidence.value)} × ` +
          `權重 ${round(evidence.weight, 3)}`
        );
      }),
    };
  }

  return states;
}

function getPredictionValue(
  predictions: PlayerMetricPrediction[],
  metric: PlayerModelMetric,
  fallback: number,
): number {
  const prediction =
    predictions.find(
      item => item.metric === metric,
    );

  return prediction
    ? prediction.updatedValue
    : fallback;
}

// ---------------------------------------------------------------------------
// 10. 可解釋加權 Predictor
// ---------------------------------------------------------------------------

export class WeightedPlayerModelPredictor
implements PlayerModelPredictor {
  public readonly type:
    PlayerModelPredictorType =
    'WEIGHTED';

  public readonly version =
    MODEL_VERSION;

  public predict(
    input: PlayerModelInferenceInput,
    inputOptions?: PlayerModelInferenceOptions,
  ): PlayerModelInferenceResult {
    const options =
      mergeOptions(inputOptions);

    const previous =
      input.previousPlayerModel ??
      createInitialPlayerModel();

    const f = input.features;
    const v = input.behaviorVector;

    const predictions: PlayerMetricPrediction[] =
      [];

    // -----------------------------------------------------------------------
    // 六項核心能力
    // -----------------------------------------------------------------------

    const abilityPredictors: Record<
      AbilityKey,
      () => {
        prediction: number;
        confidence: number;
        evidence: PlayerModelInferenceEvidence[];
        formula: string;
      }
    > = {
      mentalRotation: () =>
        predictMentalRotation(
          input,
          options,
        ),

      spatialVisualization: () =>
        predictSpatialVisualization(
          input,
          options,
        ),

      perspectiveTaking: () =>
        predictPerspectiveTaking(
          input,
          options,
        ),

      planning: () =>
        predictPlanning(
          input,
          options,
        ),

      workingMemory: () =>
        predictWorkingMemory(
          input,
          options,
        ),

      persistence: () =>
        predictPersistence(
          input,
          options,
        ),
    };

    for (const ability of KNOWLEDGE_MASTERY_ORDER) {
      const result =
        abilityPredictors[ability]();

      predictions.push(
        createMetricPrediction({
          metric: ability,
          previousValue:
            previous[ability],
          rawPrediction:
            result.prediction,
          learningRate:
            options.learningRate,
          confidence:
            result.confidence,
          evidence:
            result.evidence,
          formula:
            result.formula,
          roundResults:
            options.roundResults,
        }),
      );
    }

    // -----------------------------------------------------------------------
    // 學習者特質
    // -----------------------------------------------------------------------

    const hintDependency =
      predictHintDependency(f, v);

    predictions.push(
      createMetricPrediction({
        metric: 'hintDependency',
        previousValue:
          previous.hintDependency,
        rawPrediction:
          hintDependency.prediction,
        learningRate:
          options.learningRate,
        confidence:
          hintDependency.confidence,
        evidence:
          hintDependency.evidence,
        formula:
          'HintDependency = HintRate + HintCount + Reading - IndependentPerformance',
        roundResults:
          options.roundResults,
      }),
    );

    const confidence =
      predictConfidence(f, v);

    predictions.push(
      createMetricPrediction({
        metric: 'confidence',
        previousValue:
          previous.confidence,
        rawPrediction:
          confidence.prediction,
        learningRate:
          options.learningRate,
        confidence:
          confidence.confidence,
        evidence:
          confidence.evidence,
        formula:
          'Confidence = BehaviorConfidence + Success + Efficiency - Error',
        roundResults:
          options.roundResults,
      }),
    );

    predictions.push(
      createMetricPrediction({
        metric: 'exploration',
        previousValue:
          previous.exploration,
        rawPrediction:
          v.exploration,
        learningRate:
          options.learningRate,
        confidence: 0.8,
        evidence: [
          createEvidence({
            source:
              'vector.exploration',
            label: '探索行為向量',
            value: v.exploration,
            weight: 1,
          }),
        ],
        formula:
          'Exploration = BehaviorVector.exploration',
        roundResults:
          options.roundResults,
      }),
    );

    predictions.push(
      createMetricPrediction({
        metric: 'efficiency',
        previousValue:
          previous.efficiency,
        rawPrediction:
          clamp(
            v.efficiency * 0.6 +
              f.efficiencyScore * 0.4,
          ),
        learningRate:
          options.learningRate,
        confidence: 0.82,
        evidence: [
          createEvidence({
            source:
              'vector.efficiency',
            label: '效率行為向量',
            value: v.efficiency,
            weight: 0.6,
          }),
          createEvidence({
            source:
              'features.efficiencyScore',
            label: '效率特徵分數',
            value: f.efficiencyScore,
            weight: 0.4,
          }),
        ],
        formula:
          'Efficiency = 0.6 × BehaviorEfficiency + 0.4 × FeatureEfficiency',
        roundResults:
          options.roundResults,
      }),
    );

    predictions.push(
      createMetricPrediction({
        metric: 'helpSeeking',
        previousValue:
          previous.helpSeeking,
        rawPrediction:
          clamp(
            v.helpSeeking * 0.65 +
              f.helpSeekingScore * 0.35,
          ),
        learningRate:
          options.learningRate,
        confidence: 0.78,
        evidence: [
          createEvidence({
            source:
              'vector.helpSeeking',
            label: '求助行為向量',
            value: v.helpSeeking,
            weight: 0.65,
          }),
          createEvidence({
            source:
              'features.helpSeekingScore',
            label: '求助特徵分數',
            value:
              f.helpSeekingScore,
            weight: 0.35,
          }),
        ],
        formula:
          'HelpSeeking = 0.65 × BehaviorHelp + 0.35 × FeatureHelp',
        roundResults:
          options.roundResults,
      }),
    );

    predictions.push(
      createMetricPrediction({
        metric: 'reflection',
        previousValue:
          previous.reflection,
        rawPrediction:
          v.reflection,
        learningRate:
          options.learningRate,
        confidence: 0.78,
        evidence: [
          createEvidence({
            source:
              'vector.reflection',
            label: '反思行為向量',
            value: v.reflection,
            weight: 1,
          }),
        ],
        formula:
          'Reflection = BehaviorVector.reflection',
        roundResults:
          options.roundResults,
      }),
    );

    predictions.push(
      createMetricPrediction({
        metric: 'impulsiveness',
        previousValue:
          previous.impulsiveness,
        rawPrediction:
          v.impulsiveness,
        learningRate:
          options.learningRate,
        confidence: 0.8,
        evidence: [
          createEvidence({
            source:
              'vector.impulsiveness',
            label: '衝動行為向量',
            value: v.impulsiveness,
            weight: 1,
          }),
        ],
        formula:
          'Impulsiveness = BehaviorVector.impulsiveness',
        roundResults:
          options.roundResults,
      }),
    );

    const selfRegulation =
      predictSelfRegulation(f, v);

    predictions.push(
      createMetricPrediction({
        metric: 'selfRegulation',
        previousValue:
          previous.selfRegulation,
        rawPrediction:
          selfRegulation.prediction,
        learningRate:
          options.learningRate,
        confidence:
          selfRegulation.confidence,
        evidence:
          selfRegulation.evidence,
        formula:
          'SelfRegulation = Planning + Reflection + Persistence + AppropriateHelp - Impulsiveness',
        roundResults:
          options.roundResults,
      }),
    );

    predictions.push(
      createMetricPrediction({
        metric: 'cognitiveLoad',
        previousValue:
          previous.cognitiveLoad,
        rawPrediction:
          f.cognitiveLoadEstimate,
        learningRate:
          options.learningRate,
        confidence: 0.8,
        evidence: [
          createEvidence({
            source:
              'features.cognitiveLoadEstimate',
            label: '行為式認知負荷估計',
            value:
              f.cognitiveLoadEstimate,
            weight: 1,
          }),
        ],
        formula:
          'CognitiveLoad = BehaviorFeature.cognitiveLoadEstimate',
        roundResults:
          options.roundResults,
      }),
    );

    const engagement =
      predictEngagement(f, v);

    predictions.push(
      createMetricPrediction({
        metric: 'engagement',
        previousValue:
          previous.engagement,
        rawPrediction:
          engagement.prediction,
        learningRate:
          options.learningRate,
        confidence:
          engagement.confidence,
        evidence:
          engagement.evidence,
        formula:
          'Engagement = Persistence + Completion + ActiveInteraction - Idle',
        roundResults:
          options.roundResults,
      }),
    );

    const updatedConfidence =
      getPredictionValue(
        predictions,
        'confidence',
        previous.confidence,
      );

    const updatedEngagement =
      getPredictionValue(
        predictions,
        'engagement',
        previous.engagement,
      );

    const motivation =
      predictMotivation(
        f,
        v,
        updatedConfidence,
        updatedEngagement,
      );

    predictions.push(
      createMetricPrediction({
        metric: 'motivation',
        previousValue:
          previous.motivation,
        rawPrediction:
          motivation.prediction,
        learningRate:
          options.learningRate,
        confidence:
          motivation.confidence,
        evidence:
          motivation.evidence,
        formula:
          'Motivation = Engagement + Persistence + Confidence + Completion - CognitiveLoad',
        roundResults:
          options.roundResults,
      }),
    );

    // -----------------------------------------------------------------------
    // Knowledge Tracing 欄位
    // -----------------------------------------------------------------------

    const masteryLevel =
      input.knowledgeState
        ? input.knowledgeState
            .overallMastery
        : average(
            KNOWLEDGE_MASTERY_ORDER.map(
              ability =>
                getPredictionValue(
                  predictions,
                  ability,
                  previous[ability],
                ),
            ),
          );

    const predictedSuccessRate =
      input.knowledgeState
        ? input.knowledgeState
            .predictedSuccessRate
        : clamp(
            f.successRate * 0.45 +
              masteryLevel * 0.35 +
              getPredictionValue(
                predictions,
                'efficiency',
                previous.efficiency,
              ) *
                0.2,
          );

    predictions.push(
      createMetricPrediction({
        metric: 'masteryLevel',
        previousValue:
          previous.masteryLevel,
        rawPrediction:
          masteryLevel,
        learningRate:
          input.knowledgeState
            ? 1
            : options.learningRate,
        confidence:
          input.knowledgeState
            ? 0.9
            : 0.65,
        evidence: [
          createEvidence({
            source:
              input.knowledgeState
                ? 'knowledgeState.overallMastery'
                : 'derived.abilityAverage',
            label:
              input.knowledgeState
                ? 'Knowledge Tracing 整體掌握度'
                : '六項能力平均值',
            value: masteryLevel,
            weight: 1,
          }),
        ],
        formula:
          'MasteryLevel = KnowledgeTracing.overallMastery',
        roundResults:
          options.roundResults,
      }),
    );

    predictions.push(
      createMetricPrediction({
        metric:
          'predictedSuccessRate',
        previousValue:
          previous.predictedSuccessRate,
        rawPrediction:
          predictedSuccessRate,
        learningRate:
          input.knowledgeState
            ? 1
            : options.learningRate,
        confidence:
          input.knowledgeState
            ? 0.9
            : 0.7,
        evidence: [
          createEvidence({
            source:
              input.knowledgeState
                ? 'knowledgeState.predictedSuccessRate'
                : 'derived.successPrediction',
            label: '下一關預測成功率',
            value:
              predictedSuccessRate,
            weight: 1,
          }),
        ],
        formula:
          'PredictedSuccess = KnowledgeTracingPrediction or PerformanceBlend',
        roundResults:
          options.roundResults,
      }),
    );

    // -----------------------------------------------------------------------
    // 建立 PlayerModel
    // -----------------------------------------------------------------------

    const knowledgeMastery =
      input.knowledgeState
        ? knowledgeStateToMasteryArray(
            input.knowledgeState,
          )
        : KNOWLEDGE_MASTERY_ORDER.map(
            ability =>
              getPredictionValue(
                predictions,
                ability,
                previous[ability],
              ),
          );

    const playerModel: PlayerModel = {
      mentalRotation:
        getPredictionValue(
          predictions,
          'mentalRotation',
          previous.mentalRotation,
        ),

      spatialVisualization:
        getPredictionValue(
          predictions,
          'spatialVisualization',
          previous.spatialVisualization,
        ),

      perspectiveTaking:
        getPredictionValue(
          predictions,
          'perspectiveTaking',
          previous.perspectiveTaking,
        ),

      planning:
        getPredictionValue(
          predictions,
          'planning',
          previous.planning,
        ),

      workingMemory:
        getPredictionValue(
          predictions,
          'workingMemory',
          previous.workingMemory,
        ),

      persistence:
        getPredictionValue(
          predictions,
          'persistence',
          previous.persistence,
        ),

      hintDependency:
        getPredictionValue(
          predictions,
          'hintDependency',
          previous.hintDependency,
        ),

      confidence:
        getPredictionValue(
          predictions,
          'confidence',
          previous.confidence,
        ),

      exploration:
        getPredictionValue(
          predictions,
          'exploration',
          previous.exploration,
        ),

      efficiency:
        getPredictionValue(
          predictions,
          'efficiency',
          previous.efficiency,
        ),

      helpSeeking:
        getPredictionValue(
          predictions,
          'helpSeeking',
          previous.helpSeeking,
        ),

      reflection:
        getPredictionValue(
          predictions,
          'reflection',
          previous.reflection,
        ),

      impulsiveness:
        getPredictionValue(
          predictions,
          'impulsiveness',
          previous.impulsiveness,
        ),

      selfRegulation:
        getPredictionValue(
          predictions,
          'selfRegulation',
          previous.selfRegulation,
        ),

      cognitiveLoad:
        getPredictionValue(
          predictions,
          'cognitiveLoad',
          previous.cognitiveLoad,
        ),

      engagement:
        getPredictionValue(
          predictions,
          'engagement',
          previous.engagement,
        ),

      motivation:
        getPredictionValue(
          predictions,
          'motivation',
          previous.motivation,
        ),

      knowledgeMastery:
        knowledgeMastery.map(value =>
          options.roundResults
            ? round(value)
            : value,
        ),

      masteryLevel:
        getPredictionValue(
          predictions,
          'masteryLevel',
          previous.masteryLevel,
        ),

      predictedSuccessRate:
        getPredictionValue(
          predictions,
          'predictedSuccessRate',
          previous.predictedSuccessRate,
        ),

      learningTrend:
        input.knowledgeState
          ? input.knowledgeState
              .learningTrend
          : determineLearningTrend(
              previous.masteryLevel,
              masteryLevel,
            ),
    };

    const usableConfidences =
      predictions
        .filter(prediction =>
          PLAYER_MODEL_METRICS.includes(
            prediction.metric,
          ),
        )
        .map(
          prediction =>
            prediction.confidence,
        );

    const generatedAt = Date.now();
    const metricStates = createDynamicMetricStates(
      predictions,
      input.previousMetricStates,
      generatedAt,
    );

    return {
      playerModel,
      predictions,
      metricStates,
      overallConfidence:
        round(
          average(
            usableConfidences,
          ),
        ),
      predictorType: this.type,
      generatedAt,
      modelVersion: this.version,
    };
  }
}

// ---------------------------------------------------------------------------
// 11. 趨勢判斷
// ---------------------------------------------------------------------------

function determineLearningTrend(
  previousMastery: number,
  currentMastery: number,
): 'UP' | 'STABLE' | 'DOWN' {
  const difference =
    currentMastery -
    previousMastery;

  if (difference > 0.015) {
    return 'UP';
  }

  if (difference < -0.015) {
    return 'DOWN';
  }

  return 'STABLE';
}

// ---------------------------------------------------------------------------
// 12. 統一 MachineLearningPlayerModel 封裝
// ---------------------------------------------------------------------------

/**
 * 玩家模型統一入口。
 *
 * 預設使用 WeightedPlayerModelPredictor。
 * 未來可注入其他 Predictor。
 */
export class MachineLearningPlayerModel {
  private predictor: PlayerModelPredictor;

  public constructor(
    predictor: PlayerModelPredictor =
      new WeightedPlayerModelPredictor(),
  ) {
    this.predictor = predictor;
  }

  /**
   * 更換推論器。
   *
   * 未來可在系統啟動時改成：
   *
   * playerModelEngine.setPredictor(
   *   new XGBoostApiPredictor()
   * );
   */
  public setPredictor(
    predictor: PlayerModelPredictor,
  ): void {
    this.predictor = predictor;
  }

  public getPredictor():
    PlayerModelPredictor {
    return this.predictor;
  }

  /**
   * 執行完整玩家模型推論。
   */
  public infer(
    input: PlayerModelInferenceInput,
    options?: PlayerModelInferenceOptions,
  ): PlayerModelInferenceResult {
    validateInferenceInput(input);

    return this.predictor.predict(
      input,
      options,
    );
  }

  /**
   * 只回傳 PlayerModel。
   */
  public update(
    input: PlayerModelInferenceInput,
    options?: PlayerModelInferenceOptions,
  ): PlayerModel {
    return this.infer(
      input,
      options,
    ).playerModel;
  }
}

// ---------------------------------------------------------------------------
// 13. 輸入驗證
// ---------------------------------------------------------------------------

function validateInferenceInput(
  input: PlayerModelInferenceInput,
): void {
  if (!input) {
    throw new Error(
      'MachineLearningPlayerModel：缺少推論輸入。',
    );
  }

  if (!input.features) {
    throw new Error(
      'MachineLearningPlayerModel：缺少 BehaviorFeatures。',
    );
  }

  if (!input.behaviorVector) {
    throw new Error(
      'MachineLearningPlayerModel：缺少 BehaviorVector。',
    );
  }

  const requiredVectorKeys:
    Array<keyof BehaviorVector> = [
      'exploration',
      'planning',
      'persistence',
      'confidence',
      'impulsiveness',
      'efficiency',
      'helpSeeking',
      'reflection',
    ];

  for (const key of requiredVectorKeys) {
    const value =
      input.behaviorVector[key];

    if (
      typeof value !== 'number' ||
      !Number.isFinite(value)
    ) {
      throw new Error(
        `MachineLearningPlayerModel：BehaviorVector.${key} 不是有效數值。`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 14. 預設實例與便利函式
// ---------------------------------------------------------------------------

/**
 * 專案可直接共用的預設實例。
 */
export const machineLearningPlayerModel =
  new MachineLearningPlayerModel();

/**
 * 函式式呼叫方式。
 */
export function inferPlayerModel(
  input: PlayerModelInferenceInput,
  options?: PlayerModelInferenceOptions,
): PlayerModelInferenceResult {
  return machineLearningPlayerModel.infer(
    input,
    options,
  );
}

/**
 * 只更新並回傳 PlayerModel。
 */
export function updatePlayerModel(
  input: PlayerModelInferenceInput,
  options?: PlayerModelInferenceOptions,
): PlayerModel {
  return machineLearningPlayerModel.update(
    input,
    options,
  );
}

// ---------------------------------------------------------------------------
// 15. 儲存與載入
// ---------------------------------------------------------------------------

export function serializePlayerModel(
  playerModel: PlayerModel,
): string {
  return JSON.stringify(playerModel);
}

/**
 * 將 JSON 還原為 PlayerModel。
 *
 * 缺少的新欄位會使用初始值補足，
 * 可相容舊版 localStorage。
 */
export function deserializePlayerModel(
  json: string,
): PlayerModel {
  const initial =
    createInitialPlayerModel();

  try {
    const parsed =
      JSON.parse(
        json,
      ) as Partial<PlayerModel>;

    if (
      !parsed ||
      typeof parsed !== 'object'
    ) {
      return initial;
    }

    const readMetric = (
      key: keyof PlayerModel,
      fallback: number,
    ): number => {
      const value = parsed[key];

      return typeof value === 'number' &&
        Number.isFinite(value)
        ? clamp(value)
        : fallback;
    };

    const storedMastery =
      Array.isArray(
        parsed.knowledgeMastery,
      )
        ? parsed.knowledgeMastery
            .slice(
              0,
              KNOWLEDGE_MASTERY_ORDER.length,
            )
            .map(value =>
              typeof value === 'number' &&
              Number.isFinite(value)
                ? clamp(value)
                : DEFAULT_PLAYER_VALUE,
            )
        : [];

    while (
      storedMastery.length <
      KNOWLEDGE_MASTERY_ORDER.length
    ) {
      storedMastery.push(
        DEFAULT_PLAYER_VALUE,
      );
    }

    return {
      mentalRotation:
        readMetric(
          'mentalRotation',
          initial.mentalRotation,
        ),

      spatialVisualization:
        readMetric(
          'spatialVisualization',
          initial.spatialVisualization,
        ),

      perspectiveTaking:
        readMetric(
          'perspectiveTaking',
          initial.perspectiveTaking,
        ),

      planning:
        readMetric(
          'planning',
          initial.planning,
        ),

      workingMemory:
        readMetric(
          'workingMemory',
          initial.workingMemory,
        ),

      persistence:
        readMetric(
          'persistence',
          initial.persistence,
        ),

      hintDependency:
        readMetric(
          'hintDependency',
          initial.hintDependency,
        ),

      confidence:
        readMetric(
          'confidence',
          initial.confidence,
        ),

      exploration:
        readMetric(
          'exploration',
          initial.exploration,
        ),

      efficiency:
        readMetric(
          'efficiency',
          initial.efficiency,
        ),

      helpSeeking:
        readMetric(
          'helpSeeking',
          initial.helpSeeking,
        ),

      reflection:
        readMetric(
          'reflection',
          initial.reflection,
        ),

      impulsiveness:
        readMetric(
          'impulsiveness',
          initial.impulsiveness,
        ),

      selfRegulation:
        readMetric(
          'selfRegulation',
          initial.selfRegulation,
        ),

      cognitiveLoad:
        readMetric(
          'cognitiveLoad',
          initial.cognitiveLoad,
        ),

      engagement:
        readMetric(
          'engagement',
          initial.engagement,
        ),

      motivation:
        readMetric(
          'motivation',
          initial.motivation,
        ),

      knowledgeMastery:
        storedMastery,

      masteryLevel:
        readMetric(
          'masteryLevel',
          initial.masteryLevel,
        ),

      predictedSuccessRate:
        readMetric(
          'predictedSuccessRate',
          initial.predictedSuccessRate,
        ),

      learningTrend:
        parsed.learningTrend === 'UP' ||
        parsed.learningTrend === 'DOWN' ||
        parsed.learningTrend === 'STABLE'
          ? parsed.learningTrend
          : initial.learningTrend,
    };
  } catch {
    return initial;
  }
}