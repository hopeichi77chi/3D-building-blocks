import {
  AbilityKey,
  BehaviorFeatures,
  BehaviorVector,
  CognitiveDiagnosis,
  PatternId,
} from '../types';

// ============================================================================
// Cognitive Diagnosis Engine — 機率化認知診斷
// Explainable AI-based Adaptive Spatial Reasoning Intelligent Tutoring System
//
// Pipeline：
// BehaviorFeatures + BehaviorVector
//                  ↓
// Probability-based Cognitive Diagnosis
//                  ↓
// Player Model Update
//
// 舊版：
// IF Pattern A THEN Diagnosis B
//
// 新版：
// 將多個連續型行為證據加權整合，估計各能力的：
// - weakness probability
// - strength probability
// - severity
// - confidence
//
// 注意：
// 目前屬於可解釋的加權機率模型，不是由真實資料訓練出的統計模型。
// 正式研究累積足夠資料後，可將權重替換為 Logistic Regression、
// Bayesian Network、Random Forest 或 XGBoost 所學得的參數。
// ============================================================================

type DiagnosisType = 'WEAKNESS' | 'STRENGTH';

type DiagnosisSeverity = CognitiveDiagnosis['severity'];

interface ProbabilityEvidence {
  key: string;
  label: string;
  value: number;
  weight: number;
  contribution: number;
  direction: 'risk' | 'protective';
}

interface ProbabilityDiagnosisResult {
  ruleId: string;
  ability: AbilityKey;
  type: DiagnosisType;
  label: string;
  probability: number;
  severity: DiagnosisSeverity;
  triggeredBy: PatternId[];
  evidence: ProbabilityEvidence[];
  evidenceSummary: string;
}

interface DiagnosisRule {
  ruleId: string;
  ability: AbilityKey;
  weaknessLabel: string;
  strengthLabel: string;

  /**
   * 各能力的弱點機率計算器。
   *
   * 回傳 0～1：
   * 0 = 幾乎沒有弱點證據
   * 1 = 高度支持弱點診斷
   */
  calculateWeaknessProbability: (
    features: BehaviorFeatures,
    vector: BehaviorVector,
  ) => number;

  /**
   * 產生可追溯的診斷證據。
   */
  buildWeaknessEvidence: (
    features: BehaviorFeatures,
    vector: BehaviorVector,
  ) => ProbabilityEvidence[];

  /**
   * 根據數值證據建立相容的 PatternId。
   *
   * triggeredBy 保留是為了符合目前 CognitiveDiagnosis 型別。
   * 新模型實際上不依賴固定 Pattern 才能進行診斷。
   */
  inferTriggeredPatterns: (
    features: BehaviorFeatures,
    vector: BehaviorVector,
  ) => PatternId[];
}

// ---------------------------------------------------------------------------
// 診斷門檻
// ---------------------------------------------------------------------------

const DIAGNOSIS_THRESHOLDS = {
  /**
   * 弱點機率低於 0.55 時，不產生弱點診斷。
   */
  weaknessMinimum: 0.55,

  /**
   * 弱點機率低於 0.35，且保護性能力證據充足時，
   * 才產生能力優勢診斷。
   */
  strengthMaximumWeakness: 0.35,

  /**
   * 優勢診斷最低信心。
   */
  strengthMinimum: 0.65,
} as const;

// ---------------------------------------------------------------------------
// 通用工具
// ---------------------------------------------------------------------------

function clamp(value: number, min = 0, max = 1): number {
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

/**
 * 將原始值依參考最大值正規化至 0～1。
 */
function normalize(
  value: number,
  referenceMaximum: number,
): number {
  if (referenceMaximum <= 0) {
    return 0;
  }

  return clamp(value / referenceMaximum);
}

/**
 * 反向正規化。
 *
 * value 越低，輸出越高。
 * 適合表示低規劃、低成功率、低視角檢查等風險。
 */
function inverse(value: number): number {
  return clamp(1 - value);
}

/**
 * 將百分比限制在 0～100。
 */
function toPercentage(probability: number): number {
  return Math.round(clamp(probability) * 100);
}

/**
 * 將數值格式化為百分比。
 */
function formatPercent(value: number): string {
  return `${Math.round(clamp(value) * 100)}%`;
}

/**
 * 將數值格式化至一位小數。
 */
function formatNumber(value: number): string {
  return Number.isFinite(value)
    ? value.toFixed(1)
    : '0.0';
}

/**
 * 使用加權平均整合多個風險或保護性指標。
 */
function weightedProbability(
  items: Array<{
    value: number;
    weight: number;
  }>,
): number {
  const totalWeight = items.reduce(
    (sum, item) => sum + Math.max(0, item.weight),
    0,
  );

  if (totalWeight === 0) {
    return 0;
  }

  const weightedSum = items.reduce(
    (sum, item) =>
      sum +
      clamp(item.value) *
        Math.max(0, item.weight),
    0,
  );

  return clamp(weightedSum / totalWeight);
}

/**
 * 將基本加權機率轉換為更接近機率曲線的輸出。
 *
 * logistic transformation 可讓：
 * - 中間區域較敏感
 * - 極低、極高分數不會線性膨脹
 *
 * midpoint：
 * 原始風險到達多少時，輸出約為 0.5。
 *
 * steepness：
 * 曲線斜率。
 */
function logisticProbability(
  rawScore: number,
  midpoint = 0.5,
  steepness = 5,
): number {
  const boundedScore = clamp(rawScore);

  return clamp(
    1 /
      (1 +
        Math.exp(
          -steepness *
            (boundedScore - midpoint),
        )),
  );
}

/**
 * 根據診斷機率決定嚴重度。
 */
function determineSeverity(
  probability: number,
): DiagnosisSeverity {
  const normalized = clamp(probability);

  if (normalized >= 0.8) {
    return 'high';
  }

  if (normalized >= 0.65) {
    return 'medium';
  }

  return 'low';
}

/**
 * 建立單一診斷證據。
 */
function createEvidence(
  key: string,
  label: string,
  value: number,
  weight: number,
  direction: ProbabilityEvidence['direction'] = 'risk',
): ProbabilityEvidence {
  const normalizedValue = clamp(value);

  return {
    key,
    label,
    value: normalizedValue,
    weight,
    contribution: normalizedValue * weight,
    direction,
  };
}

/**
 * 將證據依實際貢獻排序。
 */
function sortEvidence(
  evidence: ProbabilityEvidence[],
): ProbabilityEvidence[] {
  return [...evidence].sort(
    (a, b) =>
      b.contribution - a.contribution,
  );
}

/**
 * 產生主要證據摘要。
 */
function buildEvidenceSummary(
  abilityLabel: string,
  probability: number,
  evidence: ProbabilityEvidence[],
): string {
  const topEvidence = sortEvidence(evidence)
    .filter(item => item.value > 0.2)
    .slice(0, 3);

  if (topEvidence.length === 0) {
    return `${abilityLabel}診斷機率為 ${formatPercent(
      probability,
    )}，但目前有效行為證據仍不足。`;
  }

  const details = topEvidence
    .map(
      item =>
        `${item.label} ${formatPercent(item.value)}`,
    )
    .join('、');

  return `${details}，綜合估計${abilityLabel}診斷機率為 ${formatPercent(
    probability,
  )}。`;
}

/**
 * 避免 triggeredBy 為空陣列。
 *
 * 此欄位主要為舊版 UI 相容用途。
 */
function ensureTriggeredPatterns(
  patterns: PatternId[],
  fallback: PatternId,
): PatternId[] {
  return patterns.length > 0
    ? Array.from(new Set(patterns))
    : [fallback];
}

// ---------------------------------------------------------------------------
// 各能力診斷規則
// ---------------------------------------------------------------------------

const RULES: DiagnosisRule[] = [
  // -------------------------------------------------------------------------
  // CD-P01：心理旋轉能力
  // -------------------------------------------------------------------------
  {
    ruleId: 'CD-P01',
    ability: 'mentalRotation',

    weaknessLabel:
      'Mental Rotation Weakness（心理旋轉能力偏弱）',

    strengthLabel:
      'Mental Rotation Strength（心理旋轉能力良好）',

    calculateWeaknessProbability: (f, v) => {
      const excessiveRotation = normalize(
        f.rotationFrequency,
        18,
      );

      const repeatedCameraUse = normalize(
        f.cameraRotationCount,
        15,
      );

      const rotationErrorInteraction =
        clamp(
          excessiveRotation *
            (0.5 + f.errorRate * 0.5),
        );

      const lowEfficiency =
        inverse(v.efficiency);

      const highCognitiveLoad =
        f.cognitiveLoadEstimate;

      const rawRisk = weightedProbability([
        {
          value: rotationErrorInteraction,
          weight: 0.3,
        },
        {
          value: repeatedCameraUse,
          weight: 0.15,
        },
        {
          value: f.errorRate,
          weight: 0.2,
        },
        {
          value: f.retryRate,
          weight: 0.1,
        },
        {
          value: lowEfficiency,
          weight: 0.15,
        },
        {
          value: highCognitiveLoad,
          weight: 0.1,
        },
      ]);

      return logisticProbability(
        rawRisk,
        0.47,
        5.5,
      );
    },

    buildWeaknessEvidence: (f, v) => [
      createEvidence(
        'rotationFrequency',
        '視角旋轉頻率',
        normalize(f.rotationFrequency, 18),
        0.3,
      ),
      createEvidence(
        'cameraRotationCount',
        '攝影機旋轉次數',
        normalize(f.cameraRotationCount, 15),
        0.15,
      ),
      createEvidence(
        'errorRate',
        '建構錯誤率',
        f.errorRate,
        0.2,
      ),
      createEvidence(
        'retryRate',
        '重試比例',
        f.retryRate,
        0.1,
      ),
      createEvidence(
        'lowEfficiency',
        '操作效率不足',
        inverse(v.efficiency),
        0.15,
      ),
      createEvidence(
        'cognitiveLoad',
        '認知負荷估計',
        f.cognitiveLoadEstimate,
        0.1,
      ),
    ],

    inferTriggeredPatterns: (f) => {
      const patterns: PatternId[] = [];

      if (f.rotationFrequency >= 10) {
        patterns.push('REPEATED_ROTATION');
      }

      if (
        f.rotationFrequency < 2 &&
        f.errorRate >= 0.3
      ) {
        patterns.push(
          'INSUFFICIENT_VIEW_CHECK',
        );
      }

      if (f.retryRate >= 0.35) {
        patterns.push(
          'REPEATED_TRIAL_ERROR',
        );
      }

      return ensureTriggeredPatterns(
        patterns,
        'REPEATED_ROTATION',
      );
    },
  },

  // -------------------------------------------------------------------------
  // CD-P02：空間視覺化能力
  // -------------------------------------------------------------------------
  {
    ruleId: 'CD-P02',
    ability: 'spatialVisualization',

    weaknessLabel:
      'Spatial Visualization Weakness（空間視覺化能力偏弱）',

    strengthLabel:
      'Spatial Visualization Strength（空間視覺化能力良好）',

    calculateWeaknessProbability: (f, v) => {
      const lowCompletion =
        inverse(f.completionRate);

      const lowSuccess =
        inverse(f.successRate);

      const nonSystematicConstruction =
        inverse(f.constructionOrderScore);

      const lowSequenceConsistency =
        inverse(f.sequenceConsistency);

      const trialErrorRisk =
        clamp(
          f.retryRate * 0.6 +
            f.errorRate * 0.4,
        );

      const rawRisk = weightedProbability([
        {
          value: f.errorRate,
          weight: 0.25,
        },
        {
          value: trialErrorRisk,
          weight: 0.2,
        },
        {
          value: lowCompletion,
          weight: 0.15,
        },
        {
          value: lowSuccess,
          weight: 0.15,
        },
        {
          value: nonSystematicConstruction,
          weight: 0.1,
        },
        {
          value: lowSequenceConsistency,
          weight: 0.1,
        },
        {
          value: v.impulsiveness,
          weight: 0.05,
        },
      ]);

      return logisticProbability(
        rawRisk,
        0.46,
        5.5,
      );
    },

    buildWeaknessEvidence: (f, v) => [
      createEvidence(
        'errorRate',
        '建構錯誤率',
        f.errorRate,
        0.25,
      ),
      createEvidence(
        'retryRate',
        '試誤與重試比例',
        f.retryRate,
        0.2,
      ),
      createEvidence(
        'lowCompletionRate',
        '關卡未完成程度',
        inverse(f.completionRate),
        0.15,
      ),
      createEvidence(
        'lowSuccessRate',
        '成功率不足',
        inverse(f.successRate),
        0.15,
      ),
      createEvidence(
        'constructionOrder',
        '非系統化建構程度',
        inverse(f.constructionOrderScore),
        0.1,
      ),
      createEvidence(
        'sequenceConsistency',
        '操作序列不一致',
        inverse(f.sequenceConsistency),
        0.1,
      ),
      createEvidence(
        'impulsiveness',
        '衝動操作傾向',
        v.impulsiveness,
        0.05,
      ),
    ],

    inferTriggeredPatterns: (f, v) => {
      const patterns: PatternId[] = [];

      if (f.retryRate >= 0.3) {
        patterns.push(
          'REPEATED_TRIAL_ERROR',
        );
      }

      if (
        f.constructionSpeed < 2 &&
        f.retryRate >= 0.25
      ) {
        patterns.push('RAPID_TRIAL_ERROR');
      }

      if (
        f.constructionOrderScore < 0.4
      ) {
        patterns.push('BOTTOM_UP_STRATEGY');
      }

      if (v.planning >= 0.7) {
        patterns.push('SYSTEMATIC_PLANNING');
      }

      return ensureTriggeredPatterns(
        patterns,
        'REPEATED_TRIAL_ERROR',
      );
    },
  },

  // -------------------------------------------------------------------------
  // CD-P03：視角轉換能力
  // -------------------------------------------------------------------------
  {
    ruleId: 'CD-P03',
    ability: 'perspectiveTaking',

    weaknessLabel:
      'Perspective-Taking Weakness（視角轉換能力偏弱）',

    strengthLabel:
      'Perspective-Taking Strength（視角轉換能力良好）',

    calculateWeaknessProbability: (f, v) => {
      const lowPerspectiveChange =
        inverse(
          normalize(
            f.perspectiveChangeCount,
            8,
          ),
        );

      const lowViewSwitch =
        inverse(
          normalize(
            f.viewSwitchFrequency,
            10,
          ),
        );

      const lowExploration =
        inverse(v.exploration);

      const viewErrorInteraction =
        clamp(
          lowPerspectiveChange *
            (0.45 + f.errorRate * 0.55),
        );

      const rawRisk = weightedProbability([
        {
          value: viewErrorInteraction,
          weight: 0.3,
        },
        {
          value: lowViewSwitch,
          weight: 0.2,
        },
        {
          value: lowExploration,
          weight: 0.15,
        },
        {
          value: f.errorRate,
          weight: 0.2,
        },
        {
          value: f.retryRate,
          weight: 0.1,
        },
        {
          value: f.cognitiveLoadEstimate,
          weight: 0.05,
        },
      ]);

      return logisticProbability(
        rawRisk,
        0.47,
        5.5,
      );
    },

    buildWeaknessEvidence: (f, v) => [
      createEvidence(
        'perspectiveChange',
        '視角轉換不足',
        inverse(
          normalize(
            f.perspectiveChangeCount,
            8,
          ),
        ),
        0.3,
      ),
      createEvidence(
        'viewSwitchFrequency',
        '視角切換頻率不足',
        inverse(
          normalize(
            f.viewSwitchFrequency,
            10,
          ),
        ),
        0.2,
      ),
      createEvidence(
        'lowExploration',
        '多角度探索不足',
        inverse(v.exploration),
        0.15,
      ),
      createEvidence(
        'errorRate',
        '建構錯誤率',
        f.errorRate,
        0.2,
      ),
      createEvidence(
        'retryRate',
        '重試比例',
        f.retryRate,
        0.1,
      ),
      createEvidence(
        'cognitiveLoad',
        '認知負荷估計',
        f.cognitiveLoadEstimate,
        0.05,
      ),
    ],

    inferTriggeredPatterns: (f) => {
      const patterns: PatternId[] = [];

      if (
        f.perspectiveChangeCount <= 2 &&
        f.errorRate >= 0.25
      ) {
        patterns.push(
          'INSUFFICIENT_VIEW_CHECK',
        );
      }

      if (f.rotationFrequency >= 14) {
        patterns.push('REPEATED_ROTATION');
      }

      return ensureTriggeredPatterns(
        patterns,
        'INSUFFICIENT_VIEW_CHECK',
      );
    },
  },

  // -------------------------------------------------------------------------
  // CD-P04：規劃能力
  // -------------------------------------------------------------------------
  {
    ruleId: 'CD-P04',
    ability: 'planning',

    weaknessLabel:
      'Planning Weakness（規劃能力不足）',

    strengthLabel:
      'Planning Strength（規劃能力良好）',

    calculateWeaknessProbability: (f, v) => {
      const lowPlanning =
        inverse(v.planning);

      const lowFeaturePlanning =
        inverse(f.planningScore);

      const lowOrder =
        inverse(f.constructionOrderScore);

      const lowConsistency =
        inverse(f.sequenceConsistency);

      const abnormalPlanningTime =
        f.planningTime < 2
          ? 1
          : f.planningTime > 45
            ? normalize(
                f.planningTime - 45,
                60,
              )
            : 0;

      const hesitationRisk =
        clamp(
          normalize(f.idleTime, 60) *
            0.7 +
            abnormalPlanningTime * 0.3,
        );

      const rawRisk = weightedProbability([
        {
          value: lowPlanning,
          weight: 0.25,
        },
        {
          value: lowFeaturePlanning,
          weight: 0.2,
        },
        {
          value: lowOrder,
          weight: 0.15,
        },
        {
          value: lowConsistency,
          weight: 0.15,
        },
        {
          value: hesitationRisk,
          weight: 0.1,
        },
        {
          value: f.retryRate,
          weight: 0.1,
        },
        {
          value: v.impulsiveness,
          weight: 0.05,
        },
      ]);

      return logisticProbability(
        rawRisk,
        0.46,
        5.5,
      );
    },

    buildWeaknessEvidence: (f, v) => [
      createEvidence(
        'planningVector',
        '規劃行為向量不足',
        inverse(v.planning),
        0.25,
      ),
      createEvidence(
        'planningScore',
        '規劃特徵分數不足',
        inverse(f.planningScore),
        0.2,
      ),
      createEvidence(
        'constructionOrder',
        '建構順序缺乏規律',
        inverse(f.constructionOrderScore),
        0.15,
      ),
      createEvidence(
        'sequenceConsistency',
        '操作序列一致性不足',
        inverse(f.sequenceConsistency),
        0.15,
      ),
      createEvidence(
        'idleTime',
        '停滯與猶豫程度',
        normalize(f.idleTime, 60),
        0.1,
      ),
      createEvidence(
        'retryRate',
        '重試比例',
        f.retryRate,
        0.1,
      ),
      createEvidence(
        'impulsiveness',
        '衝動操作傾向',
        v.impulsiveness,
        0.05,
      ),
    ],

    inferTriggeredPatterns: (f, v) => {
      const patterns: PatternId[] = [];

      if (f.idleTime >= 20) {
        patterns.push('HESITATION_IDLE');
      }

      if (
        f.constructionOrderScore >= 0.75 &&
        v.planning >= 0.65
      ) {
        patterns.push('SYSTEMATIC_PLANNING');
      }

      if (f.retryRate >= 0.35) {
        patterns.push(
          'REPEATED_TRIAL_ERROR',
        );
      }

      return ensureTriggeredPatterns(
        patterns,
        'HESITATION_IDLE',
      );
    },
  },

  // -------------------------------------------------------------------------
  // CD-P05：工作記憶
  // -------------------------------------------------------------------------
  {
    ruleId: 'CD-P05',
    ability: 'workingMemory',

    weaknessLabel:
      'Working-Memory Load（工作記憶負荷偏高）',

    strengthLabel:
      'Working-Memory Stability（工作記憶表現穩定）',

    calculateWeaknessProbability: (f, v) => {
      const hintOveruse =
        normalize(
          f.hintDependencyRate,
          0.25,
        );

      const repeatedCorrection =
        clamp(
          f.retryRate * 0.5 +
            normalize(
              f.undoCount +
                f.redoCount +
                f.blockReplacementCount,
              10,
            ) *
              0.5,
        );

      const attentionSwitching =
        normalize(
          f.attentionSwitchCount,
          20,
        );

      const lowSequenceConsistency =
        inverse(f.sequenceConsistency);

      const rawRisk = weightedProbability([
        {
          value: f.cognitiveLoadEstimate,
          weight: 0.3,
        },
        {
          value: hintOveruse,
          weight: 0.2,
        },
        {
          value: repeatedCorrection,
          weight: 0.15,
        },
        {
          value: attentionSwitching,
          weight: 0.1,
        },
        {
          value: lowSequenceConsistency,
          weight: 0.1,
        },
        {
          value: f.errorRate,
          weight: 0.1,
        },
        {
          value: inverse(v.reflection),
          weight: 0.05,
        },
      ]);

      return logisticProbability(
        rawRisk,
        0.47,
        5.5,
      );
    },

    buildWeaknessEvidence: (f, v) => [
      createEvidence(
        'cognitiveLoadEstimate',
        '認知負荷估計',
        f.cognitiveLoadEstimate,
        0.3,
      ),
      createEvidence(
        'hintDependency',
        '提示依賴程度',
        normalize(
          f.hintDependencyRate,
          0.25,
        ),
        0.2,
      ),
      createEvidence(
        'correctionBehavior',
        '重複修正行為',
        normalize(
          f.undoCount +
            f.redoCount +
            f.blockReplacementCount,
          10,
        ),
        0.15,
      ),
      createEvidence(
        'attentionSwitch',
        '注意力切換頻率',
        normalize(
          f.attentionSwitchCount,
          20,
        ),
        0.1,
      ),
      createEvidence(
        'sequenceConsistency',
        '序列記憶穩定性不足',
        inverse(f.sequenceConsistency),
        0.1,
      ),
      createEvidence(
        'errorRate',
        '建構錯誤率',
        f.errorRate,
        0.1,
      ),
      createEvidence(
        'lowReflection',
        '反思行為不足',
        inverse(v.reflection),
        0.05,
      ),
    ],

    inferTriggeredPatterns: (f) => {
      const patterns: PatternId[] = [];

      if (f.hintDependencyRate >= 0.15) {
        patterns.push('HINT_OVERRELIANCE');
      }

      if (f.retryRate >= 0.35) {
        patterns.push(
          'REPEATED_TRIAL_ERROR',
        );
      }

      if (f.idleTime >= 25) {
        patterns.push('HESITATION_IDLE');
      }

      return ensureTriggeredPatterns(
        patterns,
        'HINT_OVERRELIANCE',
      );
    },
  },

  // -------------------------------------------------------------------------
  // CD-P06：堅持度
  // -------------------------------------------------------------------------
  {
    ruleId: 'CD-P06',
    ability: 'persistence',

    weaknessLabel:
      'Persistence Decline（堅持度下降）',

    strengthLabel:
      'Persistence Strength（堅持度良好）',

    calculateWeaknessProbability: (f, v) => {
      const lowPersistence =
        inverse(v.persistence);

      const lowFeaturePersistence =
        inverse(f.persistenceScore);

      const longIdle =
        normalize(f.idleTime, 60);

      const lowCompletion =
        inverse(f.completionRate);

      const lowEngagementProxy =
        clamp(
          longIdle * 0.6 +
            lowCompletion * 0.4,
        );

      const rawRisk = weightedProbability([
        {
          value: lowPersistence,
          weight: 0.3,
        },
        {
          value: lowFeaturePersistence,
          weight: 0.25,
        },
        {
          value: longIdle,
          weight: 0.15,
        },
        {
          value: lowCompletion,
          weight: 0.15,
        },
        {
          value: lowEngagementProxy,
          weight: 0.1,
        },
        {
          value: inverse(v.reflection),
          weight: 0.05,
        },
      ]);

      return logisticProbability(
        rawRisk,
        0.48,
        5.5,
      );
    },

    buildWeaknessEvidence: (f, v) => [
      createEvidence(
        'persistenceVector',
        '堅持行為向量不足',
        inverse(v.persistence),
        0.3,
      ),
      createEvidence(
        'persistenceScore',
        '堅持特徵分數不足',
        inverse(f.persistenceScore),
        0.25,
      ),
      createEvidence(
        'idleTime',
        '長時間停滯程度',
        normalize(f.idleTime, 60),
        0.15,
      ),
      createEvidence(
        'completionRate',
        '關卡未完成程度',
        inverse(f.completionRate),
        0.15,
      ),
      createEvidence(
        'lowReflection',
        '反思與策略修正不足',
        inverse(v.reflection),
        0.05,
      ),
      createEvidence(
        'cognitiveLoad',
        '認知負荷壓力',
        f.cognitiveLoadEstimate,
        0.1,
      ),
    ],

    inferTriggeredPatterns: (f) => {
      const patterns: PatternId[] = [];

      if (f.idleTime >= 20) {
        patterns.push('HESITATION_IDLE');
      }

      if (f.retryRate >= 0.4) {
        patterns.push(
          'REPEATED_TRIAL_ERROR',
        );
      }

      return ensureTriggeredPatterns(
        patterns,
        'HESITATION_IDLE',
      );
    },
  },
];

// ---------------------------------------------------------------------------
// 優勢機率估計
// ---------------------------------------------------------------------------

/**
 * 依能力與行為資料估計能力優勢機率。
 *
 * 優勢機率不是單純的 1 - weakness probability，
 * 因為低弱點證據不一定代表有足夠優勢證據。
 */
function calculateStrengthProbability(
  ability: AbilityKey,
  features: BehaviorFeatures,
  vector: BehaviorVector,
): number {
  switch (ability) {
    case 'mentalRotation': {
      const moderateRotation =
        features.rotationFrequency >= 2 &&
        features.rotationFrequency <= 12
          ? 1
          : features.rotationFrequency < 2
            ? 0.45
            : clamp(
                1 -
                  (features.rotationFrequency -
                    12) /
                    18,
              );

      const rawStrength =
        weightedProbability([
          {
            value: moderateRotation,
            weight: 0.2,
          },
          {
            value: features.successRate,
            weight: 0.25,
          },
          {
            value: vector.efficiency,
            weight: 0.2,
          },
          {
            value: vector.exploration,
            weight: 0.15,
          },
          {
            value: inverse(
              features.errorRate,
            ),
            weight: 0.2,
          },
        ]);

      return logisticProbability(
        rawStrength,
        0.58,
        5,
      );
    }

    case 'spatialVisualization': {
      const rawStrength =
        weightedProbability([
          {
            value: features.successRate,
            weight: 0.25,
          },
          {
            value: features.completionRate,
            weight: 0.2,
          },
          {
            value: features.sequenceConsistency,
            weight: 0.15,
          },
          {
            value: features.constructionOrderScore,
            weight: 0.15,
          },
          {
            value: vector.efficiency,
            weight: 0.15,
          },
          {
            value: inverse(
              features.retryRate,
            ),
            weight: 0.1,
          },
        ]);

      return logisticProbability(
        rawStrength,
        0.6,
        5,
      );
    }

    case 'perspectiveTaking': {
      const viewUse =
        normalize(
          features.perspectiveChangeCount,
          8,
        );

      const rawStrength =
        weightedProbability([
          {
            value: viewUse,
            weight: 0.25,
          },
          {
            value: vector.exploration,
            weight: 0.25,
          },
          {
            value: features.successRate,
            weight: 0.2,
          },
          {
            value: inverse(
              features.errorRate,
            ),
            weight: 0.2,
          },
          {
            value: vector.reflection,
            weight: 0.1,
          },
        ]);

      return logisticProbability(
        rawStrength,
        0.6,
        5,
      );
    }

    case 'planning': {
      const rawStrength =
        weightedProbability([
          {
            value: vector.planning,
            weight: 0.3,
          },
          {
            value: features.planningScore,
            weight: 0.25,
          },
          {
            value: features.constructionOrderScore,
            weight: 0.15,
          },
          {
            value: features.sequenceConsistency,
            weight: 0.15,
          },
          {
            value: inverse(
              features.retryRate,
            ),
            weight: 0.1,
          },
          {
            value: inverse(
              vector.impulsiveness,
            ),
            weight: 0.05,
          },
        ]);

      return logisticProbability(
        rawStrength,
        0.6,
        5,
      );
    }

    case 'workingMemory': {
      const rawStrength =
        weightedProbability([
          {
            value: inverse(
              features.cognitiveLoadEstimate,
            ),
            weight: 0.25,
          },
          {
            value: features.sequenceConsistency,
            weight: 0.2,
          },
          {
            value: inverse(
              features.hintDependencyRate,
            ),
            weight: 0.15,
          },
          {
            value: features.successRate,
            weight: 0.2,
          },
          {
            value: vector.reflection,
            weight: 0.1,
          },
          {
            value: vector.efficiency,
            weight: 0.1,
          },
        ]);

      return logisticProbability(
        rawStrength,
        0.6,
        5,
      );
    }

    case 'persistence': {
      const rawStrength =
        weightedProbability([
          {
            value: vector.persistence,
            weight: 0.35,
          },
          {
            value: features.persistenceScore,
            weight: 0.3,
          },
          {
            value: features.completionRate,
            weight: 0.15,
          },
          {
            value: inverse(
              normalize(
                features.idleTime,
                60,
              ),
            ),
            weight: 0.1,
          },
          {
            value: vector.reflection,
            weight: 0.1,
          },
        ]);

      return logisticProbability(
        rawStrength,
        0.6,
        5,
      );
    }

    default:
      return 0.5;
  }
}

// ---------------------------------------------------------------------------
// 診斷結果產生
// ---------------------------------------------------------------------------

function createWeaknessDiagnosis(
  rule: DiagnosisRule,
  features: BehaviorFeatures,
  vector: BehaviorVector,
  probability: number,
): ProbabilityDiagnosisResult {
  const evidence =
    rule.buildWeaknessEvidence(
      features,
      vector,
    );

  return {
    ruleId: rule.ruleId,
    ability: rule.ability,
    type: 'WEAKNESS',
    label: rule.weaknessLabel,
    probability,
    severity: determineSeverity(probability),
    triggeredBy: rule.inferTriggeredPatterns(
      features,
      vector,
    ),
    evidence,
    evidenceSummary:
      buildEvidenceSummary(
        rule.weaknessLabel,
        probability,
        evidence,
      ),
  };
}

function createStrengthDiagnosis(
  rule: DiagnosisRule,
  features: BehaviorFeatures,
  vector: BehaviorVector,
  strengthProbability: number,
): ProbabilityDiagnosisResult {
  const protectiveEvidence: ProbabilityEvidence[] =
    (() => {
      switch (rule.ability) {
        case 'mentalRotation':
          return [
            createEvidence(
              'successRate',
              '建構成功率',
              features.successRate,
              0.35,
              'protective',
            ),
            createEvidence(
              'efficiency',
              '操作效率',
              vector.efficiency,
              0.3,
              'protective',
            ),
            createEvidence(
              'exploration',
              '視角探索品質',
              vector.exploration,
              0.2,
              'protective',
            ),
            createEvidence(
              'lowError',
              '低錯誤表現',
              inverse(features.errorRate),
              0.15,
              'protective',
            ),
          ];

        case 'spatialVisualization':
          return [
            createEvidence(
              'successRate',
              '建構成功率',
              features.successRate,
              0.3,
              'protective',
            ),
            createEvidence(
              'completionRate',
              '關卡完成率',
              features.completionRate,
              0.25,
              'protective',
            ),
            createEvidence(
              'sequenceConsistency',
              '建構序列一致性',
              features.sequenceConsistency,
              0.25,
              'protective',
            ),
            createEvidence(
              'efficiency',
              '建構效率',
              vector.efficiency,
              0.2,
              'protective',
            ),
          ];

        case 'perspectiveTaking':
          return [
            createEvidence(
              'exploration',
              '多視角探索',
              vector.exploration,
              0.35,
              'protective',
            ),
            createEvidence(
              'perspectiveChange',
              '視角轉換使用',
              normalize(
                features.perspectiveChangeCount,
                8,
              ),
              0.25,
              'protective',
            ),
            createEvidence(
              'successRate',
              '建構成功率',
              features.successRate,
              0.25,
              'protective',
            ),
            createEvidence(
              'reflection',
              '反思確認行為',
              vector.reflection,
              0.15,
              'protective',
            ),
          ];

        case 'planning':
          return [
            createEvidence(
              'planningVector',
              '規劃行為向量',
              vector.planning,
              0.35,
              'protective',
            ),
            createEvidence(
              'planningScore',
              '規劃特徵分數',
              features.planningScore,
              0.25,
              'protective',
            ),
            createEvidence(
              'constructionOrder',
              '建構順序規律',
              features.constructionOrderScore,
              0.2,
              'protective',
            ),
            createEvidence(
              'sequenceConsistency',
              '操作序列一致性',
              features.sequenceConsistency,
              0.2,
              'protective',
            ),
          ];

        case 'workingMemory':
          return [
            createEvidence(
              'lowCognitiveLoad',
              '低認知負荷',
              inverse(
                features.cognitiveLoadEstimate,
              ),
              0.3,
              'protective',
            ),
            createEvidence(
              'sequenceConsistency',
              '操作序列穩定',
              features.sequenceConsistency,
              0.25,
              'protective',
            ),
            createEvidence(
              'successRate',
              '建構成功率',
              features.successRate,
              0.25,
              'protective',
            ),
            createEvidence(
              'reflection',
              '反思行為',
              vector.reflection,
              0.2,
              'protective',
            ),
          ];

        case 'persistence':
          return [
            createEvidence(
              'persistenceVector',
              '堅持行為向量',
              vector.persistence,
              0.4,
              'protective',
            ),
            createEvidence(
              'persistenceScore',
              '堅持特徵分數',
              features.persistenceScore,
              0.3,
              'protective',
            ),
            createEvidence(
              'completionRate',
              '關卡完成率',
              features.completionRate,
              0.2,
              'protective',
            ),
            createEvidence(
              'reflection',
              '反思與修正行為',
              vector.reflection,
              0.1,
              'protective',
            ),
          ];

        default:
          return [];
      }
    })();

  return {
    ruleId: `${rule.ruleId}-S`,
    ability: rule.ability,
    type: 'STRENGTH',
    label: rule.strengthLabel,
    probability: strengthProbability,
    severity: 'low',
    triggeredBy:
      rule.ability === 'planning'
        ? ['SYSTEMATIC_PLANNING']
        : rule.inferTriggeredPatterns(
            features,
            vector,
          ),
    evidence: protectiveEvidence,
    evidenceSummary:
      buildEvidenceSummary(
        rule.strengthLabel,
        strengthProbability,
        protectiveEvidence,
      ),
  };
}

/**
 * 將內部機率診斷結果轉換為現有 CognitiveDiagnosis。
 */
function toCognitiveDiagnosis(
  result: ProbabilityDiagnosisResult,
): CognitiveDiagnosis {
  return {
    ruleId: result.ruleId,
    ability: result.ability,
    label: result.label,
    severity: result.severity,
    confidence: toPercentage(
      result.probability,
    ),
    triggeredBy: result.triggeredBy,
    evidenceSummary:
      result.evidenceSummary,
  };
}

// ---------------------------------------------------------------------------
// 主要診斷函式
// ---------------------------------------------------------------------------

/**
 * 由 Behavior Vector 與 Behavior Features 進行機率化認知診斷。
 *
 * @param vector
 * behaviorPatternRecognizer.ts 產生的 BehaviorVector。
 *
 * @param features
 * behaviorFeatureExtractor.ts 產生的 BehaviorFeatures。
 */
export function diagnose(
  vector: BehaviorVector,
  features: BehaviorFeatures,
): CognitiveDiagnosis[] {
  const results: ProbabilityDiagnosisResult[] =
    [];

  for (const rule of RULES) {
    const weaknessProbability =
      rule.calculateWeaknessProbability(
        features,
        vector,
      );

    const strengthProbability =
      calculateStrengthProbability(
        rule.ability,
        features,
        vector,
      );

    if (
      weaknessProbability >=
      DIAGNOSIS_THRESHOLDS.weaknessMinimum
    ) {
      results.push(
        createWeaknessDiagnosis(
          rule,
          features,
          vector,
          weaknessProbability,
        ),
      );

      continue;
    }

    if (
      weaknessProbability <=
        DIAGNOSIS_THRESHOLDS
          .strengthMaximumWeakness &&
      strengthProbability >=
        DIAGNOSIS_THRESHOLDS.strengthMinimum
    ) {
      results.push(
        createStrengthDiagnosis(
          rule,
          features,
          vector,
          strengthProbability,
        ),
      );
    }
  }

  return results
    .sort(
      (a, b) =>
        b.probability - a.probability,
    )
    .map(toCognitiveDiagnosis);
}

/**
 * 語意更清楚的別名函式。
 *
 * 可於 App.tsx 使用：
 *
 * const diagnoses = diagnoseCognitiveState(
 *   behaviorVector,
 *   features,
 * );
 */
export function diagnoseCognitiveState(
  vector: BehaviorVector,
  features: BehaviorFeatures,
): CognitiveDiagnosis[] {
  return diagnose(vector, features);
}

/**
 * 回傳每一項能力的完整弱點機率。
 *
 * 即使某能力未超過診斷門檻，也會回傳其機率。
 * 適合用於：
 * - 教師儀表板
 * - 雷達圖
 * - CSV / JSON 研究資料匯出
 * - Player Model 更新
 */
export function getAbilityWeaknessProbabilities(
  vector: BehaviorVector,
  features: BehaviorFeatures,
): Record<AbilityKey, number> {
  const probabilities = {} as Record<
    AbilityKey,
    number
  >;

  for (const rule of RULES) {
    probabilities[rule.ability] =
      Number(
        rule
          .calculateWeaknessProbability(
            features,
            vector,
          )
          .toFixed(4),
      );
  }

  return probabilities;
}

/**
 * 回傳每一項能力的優勢機率。
 */
export function getAbilityStrengthProbabilities(
  vector: BehaviorVector,
  features: BehaviorFeatures,
): Record<AbilityKey, number> {
  const abilities: AbilityKey[] = [
    'mentalRotation',
    'spatialVisualization',
    'perspectiveTaking',
    'planning',
    'workingMemory',
    'persistence',
  ];

  const probabilities = {} as Record<
    AbilityKey,
    number
  >;

  for (const ability of abilities) {
    probabilities[ability] =
      Number(
        calculateStrengthProbability(
          ability,
          features,
          vector,
        ).toFixed(4),
      );
  }

  return probabilities;
}

/**
 * 回傳教師端可使用的完整機率診斷資訊。
 *
 * 與 diagnose() 不同：
 * 此函式不會過濾未達門檻的能力。
 */
export function getFullProbabilityDiagnosis(
  vector: BehaviorVector,
  features: BehaviorFeatures,
): Array<{
  ability: AbilityKey;
  weaknessProbability: number;
  strengthProbability: number;
  dominantState:
    | 'WEAKNESS'
    | 'STRENGTH'
    | 'UNCERTAIN';
}> {
  return RULES.map(rule => {
    const weaknessProbability =
      rule.calculateWeaknessProbability(
        features,
        vector,
      );

    const strengthProbability =
      calculateStrengthProbability(
        rule.ability,
        features,
        vector,
      );

    let dominantState:
      | 'WEAKNESS'
      | 'STRENGTH'
      | 'UNCERTAIN' =
      'UNCERTAIN';

    if (
      weaknessProbability >=
        DIAGNOSIS_THRESHOLDS.weaknessMinimum &&
      weaknessProbability >
        strengthProbability
    ) {
      dominantState = 'WEAKNESS';
    } else if (
      strengthProbability >=
        DIAGNOSIS_THRESHOLDS.strengthMinimum &&
      strengthProbability >
        weaknessProbability
    ) {
      dominantState = 'STRENGTH';
    }

    return {
      ability: rule.ability,
      weaknessProbability: Number(
        weaknessProbability.toFixed(4),
      ),
      strengthProbability: Number(
        strengthProbability.toFixed(4),
      ),
      dominantState,
    };
  });
}