import {
  AbilityKey,
  AdaptiveDecision,
  CognitiveDiagnosis,
  HintType,
  Level,
  PlayerModel,
} from '../types';

// ============================================================================
// Adaptive Decision Engine
// Explainable AI-based Adaptive Spatial Reasoning Intelligent Tutoring System
//
// 功能：
// 1. 使用明確 Decision Table 產生自適應教學決策。
// 2. 所有 PlayerModel 數值均以 0～1 為範圍。
// 3. 綜合能力、認知診斷、提示依賴、認知負荷與知識追蹤結果。
// 4. 支援規則優先序與命中分數，而不是只依單一 if-else。
// 5. 根據能力弱點及目標難度選擇下一關。
// 6. 保留完整規則條件與行動文字，供 XAI 與教師面板顯示。
//
// Pipeline：
//
// PlayerModel + CognitiveDiagnosis
//                ↓
// Decision Table Matching
//                ↓
// Priority + Matching Score
//                ↓
// AdaptiveDecision
//                ↓
// Next-Level Selection
// ============================================================================

// ---------------------------------------------------------------------------
// 1. 型別定義
// ---------------------------------------------------------------------------

export type DecisionCategory =
  | 'SAFETY_SUPPORT'
  | 'COGNITIVE_SUPPORT'
  | 'STRATEGY_SUPPORT'
  | 'MOTIVATIONAL_SUPPORT'
  | 'HINT_REGULATION'
  | 'CHALLENGE_INCREASE'
  | 'MAINTAIN';

export interface AdaptiveDecisionContext {
  /**
   * 當前關卡，可不傳。
   */
  currentLevel?: Level;

  /**
   * 本次是否完成關卡。
   */
  levelCompleted?: boolean;

  /**
   * 目前已連續成功幾次。
   */
  consecutiveSuccesses?: number;

  /**
   * 目前已連續失敗幾次。
   */
  consecutiveFailures?: number;

  /**
   * 此關是否已使用提示。
   */
  hintUsed?: boolean;

  /**
   * 此關已要求提示的次數。
   */
  hintRequestCount?: number;
}

/**
 * Decision Table 規則。
 */
export interface DecisionRule {
  ruleId: string;

  /**
   * 數值越小，優先序越高。
   */
  priority: number;

  category: DecisionCategory;

  /**
   * 可供教師面板及 XAI 顯示的規則條件。
   */
  condition: string;

  /**
   * 判斷規則是否命中。
   */
  test: (
    model: PlayerModel,
    diagnoses: CognitiveDiagnosis[],
    context: AdaptiveDecisionContext,
  ) => boolean;

  /**
   * 計算規則命中強度，0～1。
   *
   * 若同一優先層級有多個規則命中，
   * 使用 matchingScore 較高者。
   */
  matchingScore: (
    model: PlayerModel,
    diagnoses: CognitiveDiagnosis[],
    context: AdaptiveDecisionContext,
  ) => number;

  /**
   * 建立自適應決策。
   */
  build: (
    model: PlayerModel,
    diagnoses: CognitiveDiagnosis[],
    context: AdaptiveDecisionContext,
  ) => Omit<AdaptiveDecision, 'ruleId' | 'condition'>;
}

/**
 * 決策規則評估結果。
 */
export interface DecisionRuleEvaluation {
  ruleId: string;
  priority: number;
  category: DecisionCategory;
  condition: string;
  matched: boolean;
  matchingScore: number;
}

/**
 * 完整決策輸出，包含所有規則的評估資訊。
 *
 * decide() 仍只回傳 AdaptiveDecision，
 * decideWithEvidence() 則回傳此完整結構。
 */
export interface AdaptiveDecisionResult {
  decision: AdaptiveDecision;
  selectedRule: DecisionRuleEvaluation;
  evaluations: DecisionRuleEvaluation[];
  generatedAt: number;
}

// ---------------------------------------------------------------------------
// 2. 常數
// ---------------------------------------------------------------------------

const ABILITIES: AbilityKey[] = [
  'mentalRotation',
  'spatialVisualization',
  'perspectiveTaking',
  'planning',
  'workingMemory',
  'persistence',
];

const CORE_SPATIAL_ABILITIES: AbilityKey[] = [
  'mentalRotation',
  'spatialVisualization',
  'perspectiveTaking',
  'planning',
];

/**
 * 玩家模型門檻。
 *
 * PlayerModel 現在使用 0～1，不是 0～100。
 */
const THRESHOLDS = {
  criticalAbility: 0.35,
  weakAbility: 0.5,
  moderateAbility: 0.65,
  strongAbility: 0.75,
  masteryAbility: 0.8,

  highHintDependency: 0.65,
  mediumHintDependency: 0.45,

  highCognitiveLoad: 0.7,
  mediumCognitiveLoad: 0.55,

  lowPersistence: 0.4,
  lowMotivation: 0.4,
  lowEngagement: 0.4,
  lowConfidence: 0.4,
  lowSelfRegulation: 0.45,

  highImpulsiveness: 0.7,

  lowPredictedSuccess: 0.4,
  mediumPredictedSuccess: 0.6,
  highPredictedSuccess: 0.8,
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

function clampDifficulty(value: number): number {
  return Math.max(1, Math.min(10, Math.round(value)));
}

function normalizeDifficulty(
  difficulty: number,
): number {
  if (!Number.isFinite(difficulty)) {
    return 0.5;
  }

  if (difficulty >= 0 && difficulty <= 1) {
    return clamp(difficulty);
  }

  if (difficulty >= 1 && difficulty <= 10) {
    return clamp((difficulty - 1) / 9);
  }

  return clamp(difficulty / 100);
}

function denormalizeDifficulty(
  difficulty: number,
): number {
  return clampDifficulty(
    1 + clamp(difficulty) * 9,
  );
}

function getAbilityScore(
  model: PlayerModel,
  ability: AbilityKey,
): number {
  return clamp(model[ability]);
}

function formatPercent(value: number): string {
  return `${Math.round(clamp(value) * 100)}%`;
}

/**
 * 判斷診斷是否為弱點。
 */
function isWeaknessDiagnosis(
  diagnosis: CognitiveDiagnosis,
): boolean {
  const label = diagnosis.label.toLowerCase();

  return (
    label.includes('weak') ||
    label.includes('load') ||
    label.includes('decline') ||
    label.includes('偏弱') ||
    label.includes('不足') ||
    label.includes('負荷') ||
    label.includes('下降')
  );
}

/**
 * 判斷診斷是否為優勢。
 */
function isStrengthDiagnosis(
  diagnosis: CognitiveDiagnosis,
): boolean {
  const label = diagnosis.label.toLowerCase();

  return (
    label.includes('strength') ||
    label.includes('良好') ||
    label.includes('穩定') ||
    label.includes('優勢')
  );
}

function getWeaknessDiagnoses(
  diagnoses: CognitiveDiagnosis[],
  ability?: AbilityKey,
): CognitiveDiagnosis[] {
  return diagnoses.filter(
    diagnosis =>
      isWeaknessDiagnosis(diagnosis) &&
      (!ability || diagnosis.ability === ability),
  );
}

function getStrengthDiagnoses(
  diagnoses: CognitiveDiagnosis[],
  ability?: AbilityKey,
): CognitiveDiagnosis[] {
  return diagnoses.filter(
    diagnosis =>
      isStrengthDiagnosis(diagnosis) &&
      (!ability || diagnosis.ability === ability),
  );
}

function hasWeaknessDiagnosis(
  diagnoses: CognitiveDiagnosis[],
  ability: AbilityKey,
  minimumConfidence = 55,
): boolean {
  return getWeaknessDiagnoses(
    diagnoses,
    ability,
  ).some(
    diagnosis =>
      diagnosis.confidence >= minimumConfidence,
  );
}

function hasHighSeverityDiagnosis(
  diagnoses: CognitiveDiagnosis[],
  ability: AbilityKey,
): boolean {
  return diagnoses.some(
    diagnosis =>
      diagnosis.ability === ability &&
      isWeaknessDiagnosis(diagnosis) &&
      diagnosis.severity === 'high',
  );
}

function getHighestDiagnosisConfidence(
  diagnoses: CognitiveDiagnosis[],
  ability: AbilityKey,
): number {
  const relevant = diagnoses.filter(
    diagnosis =>
      diagnosis.ability === ability &&
      isWeaknessDiagnosis(diagnosis),
  );

  if (relevant.length === 0) {
    return 0;
  }

  return clamp(
    Math.max(
      ...relevant.map(
        diagnosis =>
          diagnosis.confidence / 100,
      ),
    ),
  );
}

/**
 * 找出能力分數最低者。
 */
export function getWeakestAbility(
  model: PlayerModel,
  abilities: AbilityKey[] = ABILITIES,
): AbilityKey {
  return [...abilities].sort(
    (abilityA, abilityB) =>
      getAbilityScore(model, abilityA) -
      getAbilityScore(model, abilityB),
  )[0];
}

/**
 * 找出能力分數最高者。
 */
export function getStrongestAbility(
  model: PlayerModel,
  abilities: AbilityKey[] = ABILITIES,
): AbilityKey {
  return [...abilities].sort(
    (abilityA, abilityB) =>
      getAbilityScore(model, abilityB) -
      getAbilityScore(model, abilityA),
  )[0];
}

/**
 * 計算能力弱點分數。
 *
 * ability 越低，weakness 越高。
 */
function getAbilityWeakness(
  model: PlayerModel,
  ability: AbilityKey,
): number {
  return clamp(
    1 - getAbilityScore(model, ability),
  );
}

/**
 * 綜合玩家模型弱點與認知診斷信心。
 */
function calculateAbilityRisk(
  model: PlayerModel,
  diagnoses: CognitiveDiagnosis[],
  ability: AbilityKey,
): number {
  const modelWeakness =
    getAbilityWeakness(
      model,
      ability,
    );

  const diagnosisConfidence =
    getHighestDiagnosisConfidence(
      diagnoses,
      ability,
    );

  return clamp(
    modelWeakness * 0.65 +
      diagnosisConfidence * 0.35,
  );
}

/**
 * 依目前能力與預測成功率估計適合難度。
 */
function estimateSuitableDifficulty(
  model: PlayerModel,
  ability: AbilityKey,
): number {
  const abilityScore =
    getAbilityScore(
      model,
      ability,
    );

  const predictedSuccess =
    clamp(
      model.predictedSuccessRate,
    );

  const mastery =
    clamp(
      model.masteryLevel,
    );

  const combinedReadiness =
    abilityScore * 0.45 +
    predictedSuccess * 0.35 +
    mastery * 0.2;

  return denormalizeDifficulty(
    combinedReadiness,
  );
}

/**
 * 取得提示形式對應文字。
 */
function getHintTypeDescription(
  hintType: HintType,
): string {
  const descriptions: Record<
    HintType,
    string
  > = {
    STRUCTURAL: '結構分解提示',
    PERSPECTIVE: '視角轉換提示',
    PLANNING: '規劃策略提示',
    MOTIVATIONAL: '鼓勵與動機提示',
    NONE: '不主動提供提示',
  };

  return descriptions[hintType];
}

// ---------------------------------------------------------------------------
// 4. Decision Table
// ---------------------------------------------------------------------------

/**
 * Decision Table 執行原則：
 *
 * 1. 先檢查 priority。
 * 2. priority 較小者優先。
 * 3. 若同一 priority 有多項命中，取 matchingScore 較高者。
 * 4. AD-DEFAULT 永遠命中，作為保底規則。
 */
export const DECISION_TABLE: DecisionRule[] = [
  // -------------------------------------------------------------------------
  // Priority 1：極低預測成功率或多重能力嚴重弱點
  // -------------------------------------------------------------------------
  {
    ruleId: 'AD-01',
    priority: 1,
    category: 'SAFETY_SUPPORT',

    condition:
      'IF predictedSuccessRate < 0.40 OR two or more high-severity cognitive weaknesses are detected',

    test: (model, diagnoses) => {
      const highSeverityWeaknesses =
        diagnoses.filter(
          diagnosis =>
            diagnosis.severity === 'high' &&
            isWeaknessDiagnosis(diagnosis),
        );

      return (
        model.predictedSuccessRate <
          THRESHOLDS.lowPredictedSuccess ||
        highSeverityWeaknesses.length >= 2
      );
    },

    matchingScore: (model, diagnoses) => {
      const predictionRisk =
        clamp(
          1 -
            model.predictedSuccessRate /
              THRESHOLDS.lowPredictedSuccess,
        );

      const highSeverityCount =
        diagnoses.filter(
          diagnosis =>
            diagnosis.severity === 'high' &&
            isWeaknessDiagnosis(diagnosis),
        ).length;

      const multipleWeaknessRisk =
        clamp(highSeverityCount / 3);

      return clamp(
        predictionRisk * 0.6 +
          multipleWeaknessRisk * 0.4,
      );
    },

    build: (model, diagnoses) => {
      const weakestAbility =
        getWeakestAbility(model);

      return {
        hintType:
          weakestAbility ===
            'mentalRotation' ||
          weakestAbility ===
            'perspectiveTaking'
            ? 'PERSPECTIVE'
            : weakestAbility === 'planning'
              ? 'PLANNING'
              : 'STRUCTURAL',

        hintTiming: 'IMMEDIATE',

        hintDetailLevel: 'HIGH',

        difficultyAdjustment: -1,

        recommendedSkillFocus:
          weakestAbility,

        action:
          `THEN 立即提供高細節「${getHintTypeDescription(
            weakestAbility ===
                'mentalRotation' ||
              weakestAbility ===
                'perspectiveTaking'
              ? 'PERSPECTIVE'
              : weakestAbility ===
                    'planning'
                ? 'PLANNING'
                : 'STRUCTURAL',
          )}」，將下一關難度降低一級，並優先安排${weakestAbility}能力訓練。`,
      };
    },
  },

  // -------------------------------------------------------------------------
  // Priority 2：心理旋轉嚴重弱點
  // -------------------------------------------------------------------------
  {
    ruleId: 'AD-02',
    priority: 2,
    category: 'COGNITIVE_SUPPORT',

    condition:
      'IF mentalRotation < 0.45 AND mentalRotation weakness diagnosis confidence >= 0.55',

    test: (model, diagnoses) =>
      model.mentalRotation <
        THRESHOLDS.weakAbility &&
      hasWeaknessDiagnosis(
        diagnoses,
        'mentalRotation',
      ),

    matchingScore: (model, diagnoses) =>
      calculateAbilityRisk(
        model,
        diagnoses,
        'mentalRotation',
      ),

    build: model => ({
      hintType: 'PERSPECTIVE',
      hintTiming: 'IMMEDIATE',
      hintDetailLevel:
        model.mentalRotation <
        THRESHOLDS.criticalAbility
          ? 'HIGH'
          : 'MEDIUM',
      difficultyAdjustment: -1,
      recommendedSkillFocus:
        'mentalRotation',
      action:
        'THEN 立即提供視角旋轉與基準面定位提示，引導學習者先辨識正面、頂面與側面，再降低下一關難度一級。',
    }),
  },

  // -------------------------------------------------------------------------
  // Priority 2：空間視覺化弱點
  // -------------------------------------------------------------------------
  {
    ruleId: 'AD-03',
    priority: 2,
    category: 'COGNITIVE_SUPPORT',

    condition:
      'IF spatialVisualization < 0.50 AND spatialVisualization weakness is detected',

    test: (model, diagnoses) =>
      model.spatialVisualization <
        THRESHOLDS.weakAbility &&
      hasWeaknessDiagnosis(
        diagnoses,
        'spatialVisualization',
      ),

    matchingScore: (model, diagnoses) =>
      calculateAbilityRisk(
        model,
        diagnoses,
        'spatialVisualization',
      ),

    build: model => ({
      hintType: 'STRUCTURAL',
      hintTiming: 'IMMEDIATE',
      hintDetailLevel:
        model.spatialVisualization <
        THRESHOLDS.criticalAbility
          ? 'HIGH'
          : 'MEDIUM',
      difficultyAdjustment: -1,
      recommendedSkillFocus:
        'spatialVisualization',
      action:
        'THEN 提供結構分層提示，指出目前作品與目標在積木數量、位置或高度上的差異，並安排空間視覺化訓練關卡。',
    }),
  },

  // -------------------------------------------------------------------------
  // Priority 2：視角轉換弱點
  // -------------------------------------------------------------------------
  {
    ruleId: 'AD-04',
    priority: 2,
    category: 'COGNITIVE_SUPPORT',

    condition:
      'IF perspectiveTaking < 0.50 AND perspective-taking weakness is detected',

    test: (model, diagnoses) =>
      model.perspectiveTaking <
        THRESHOLDS.weakAbility &&
      hasWeaknessDiagnosis(
        diagnoses,
        'perspectiveTaking',
      ),

    matchingScore: (model, diagnoses) =>
      calculateAbilityRisk(
        model,
        diagnoses,
        'perspectiveTaking',
      ),

    build: () => ({
      hintType: 'PERSPECTIVE',
      hintTiming: 'IMMEDIATE',
      hintDetailLevel: 'MEDIUM',
      difficultyAdjustment: -1,
      recommendedSkillFocus:
        'perspectiveTaking',
      action:
        'THEN 提示學習者切換至頂視圖、側視圖或正視圖進行交叉驗證，並降低下一關的視角複雜度。',
    }),
  },

  // -------------------------------------------------------------------------
  // Priority 3：高認知負荷／工作記憶負荷
  // -------------------------------------------------------------------------
  {
    ruleId: 'AD-05',
    priority: 3,
    category: 'COGNITIVE_SUPPORT',

    condition:
      'IF cognitiveLoad >= 0.70 OR workingMemory < 0.45 with high-severity diagnosis',

    test: (model, diagnoses) =>
      model.cognitiveLoad >=
        THRESHOLDS.highCognitiveLoad ||
      (
        model.workingMemory <
          THRESHOLDS.weakAbility &&
        hasHighSeverityDiagnosis(
          diagnoses,
          'workingMemory',
        )
      ),

    matchingScore: (model, diagnoses) => {
      const cognitiveLoadRisk =
        model.cognitiveLoad;

      const workingMemoryRisk =
        calculateAbilityRisk(
          model,
          diagnoses,
          'workingMemory',
        );

      return clamp(
        cognitiveLoadRisk * 0.6 +
          workingMemoryRisk * 0.4,
      );
    },

    build: () => ({
      hintType: 'STRUCTURAL',
      hintTiming: 'IMMEDIATE',
      hintDetailLevel: 'HIGH',
      difficultyAdjustment: -1,
      recommendedSkillFocus:
        'workingMemory',
      action:
        'THEN 將任務拆成較小步驟，每次只呈現一項建構目標，提供高細節結構提示並降低下一關複雜度。',
    }),
  },

  // -------------------------------------------------------------------------
  // Priority 3：規劃能力不足
  // -------------------------------------------------------------------------
  {
    ruleId: 'AD-06',
    priority: 3,
    category: 'STRATEGY_SUPPORT',

    condition:
      'IF planning < 0.50 OR selfRegulation < 0.45 with planning weakness diagnosis',

    test: (model, diagnoses) =>
      (
        model.planning <
          THRESHOLDS.weakAbility ||
        model.selfRegulation <
          THRESHOLDS.lowSelfRegulation
      ) &&
      hasWeaknessDiagnosis(
        diagnoses,
        'planning',
        50,
      ),

    matchingScore: (model, diagnoses) => {
      const planningRisk =
        calculateAbilityRisk(
          model,
          diagnoses,
          'planning',
        );

      const regulationRisk =
        inverseScore(
          model.selfRegulation,
        );

      return clamp(
        planningRisk * 0.7 +
          regulationRisk * 0.3,
      );
    },

    build: model => ({
      hintType: 'PLANNING',
      hintTiming:
        model.impulsiveness >=
        THRESHOLDS.highImpulsiveness
          ? 'IMMEDIATE'
          : 'DELAYED',
      hintDetailLevel:
        model.planning <
        THRESHOLDS.criticalAbility
          ? 'HIGH'
          : 'MEDIUM',
      difficultyAdjustment:
        model.planning <
        THRESHOLDS.criticalAbility
          ? -1
          : 0,
      recommendedSkillFocus:
        'planning',
      action:
        model.impulsiveness >=
        THRESHOLDS.highImpulsiveness
          ? 'THEN 立即中止衝動式操作，引導學習者先觀察底層、拆解結構並說明下一步，再繼續放置積木。'
          : 'THEN 延遲約 10 秒提供規劃提示，先要求學習者思考底層、支撐點與建構順序，再視需要提供結構分解。',
    }),
  },

  // -------------------------------------------------------------------------
  // Priority 3：提示過度依賴
  // -------------------------------------------------------------------------
  {
    ruleId: 'AD-07',
    priority: 3,
    category: 'HINT_REGULATION',

    condition:
      'IF hintDependency >= 0.65',

    test: model =>
      model.hintDependency >=
      THRESHOLDS.highHintDependency,

    matchingScore: model =>
      clamp(
        model.hintDependency,
      ),

    build: () => ({
      hintType: 'MOTIVATIONAL',
      hintTiming: 'DELAYED',
      hintDetailLevel: 'LOW',
      difficultyAdjustment: 0,
      recommendedSkillFocus:
        'workingMemory',
      action:
        'THEN 延遲提示並降低提示詳細度，先提出反思問題或選擇題式引導，要求學習者自行提出下一步，避免形成提示依賴。',
    }),
  },

  // -------------------------------------------------------------------------
  // Priority 4：低堅持、低投入或低動機
  // -------------------------------------------------------------------------
  {
    ruleId: 'AD-08',
    priority: 4,
    category: 'MOTIVATIONAL_SUPPORT',

    condition:
      'IF persistence < 0.40 OR engagement < 0.40 OR motivation < 0.40',

    test: model =>
      model.persistence <
        THRESHOLDS.lowPersistence ||
      model.engagement <
        THRESHOLDS.lowEngagement ||
      model.motivation <
        THRESHOLDS.lowMotivation,

    matchingScore: model => {
      const persistenceRisk =
        inverseScore(
          model.persistence,
        );

      const engagementRisk =
        inverseScore(
          model.engagement,
        );

      const motivationRisk =
        inverseScore(
          model.motivation,
        );

      return Math.max(
        persistenceRisk,
        engagementRisk,
        motivationRisk,
      );
    },

    build: model => {
      const weakestMotivationalFactor =
        [
          {
            ability: 'persistence' as AbilityKey,
            value: model.persistence,
          },
          {
            ability: 'planning' as AbilityKey,
            value: model.engagement,
          },
          {
            ability: 'persistence' as AbilityKey,
            value: model.motivation,
          },
        ].sort(
          (a, b) =>
            a.value - b.value,
        )[0];

      return {
        hintType: 'MOTIVATIONAL',
        hintTiming: 'IMMEDIATE',
        hintDetailLevel: 'LOW',
        difficultyAdjustment: -1,
        recommendedSkillFocus:
          weakestMotivationalFactor.ability,
        action:
          'THEN 提供具體鼓勵、顯示已完成的進度，並給予一個可立即完成的小步驟；下一關難度降低一級以恢復成功經驗。',
      };
    },
  },

  // -------------------------------------------------------------------------
  // Priority 4：低自信但具備一定能力
  // -------------------------------------------------------------------------
  {
    ruleId: 'AD-09',
    priority: 4,
    category: 'MOTIVATIONAL_SUPPORT',

    condition:
      'IF confidence < 0.40 AND masteryLevel >= 0.55',

    test: model =>
      model.confidence <
        THRESHOLDS.lowConfidence &&
      model.masteryLevel >=
        THRESHOLDS.moderateAbility,

    matchingScore: model =>
      clamp(
        inverseScore(
          model.confidence,
        ) *
          0.7 +
          model.masteryLevel *
            0.3,
      ),

    build: model => ({
      hintType: 'MOTIVATIONAL',
      hintTiming: 'DELAYED',
      hintDetailLevel: 'LOW',
      difficultyAdjustment: 0,
      recommendedSkillFocus:
        getStrongestAbility(model),
      action:
        'THEN 先肯定學習者已展現的正確策略與能力證據，不直接揭示答案，維持當前難度並鼓勵獨立完成。',
    }),
  },

  // -------------------------------------------------------------------------
  // Priority 5：衝動式操作
  // -------------------------------------------------------------------------
  {
    ruleId: 'AD-10',
    priority: 5,
    category: 'STRATEGY_SUPPORT',

    condition:
      'IF impulsiveness >= 0.70 AND planning < 0.60',

    test: model =>
      model.impulsiveness >=
        THRESHOLDS.highImpulsiveness &&
      model.planning <
        THRESHOLDS.moderateAbility,

    matchingScore: model =>
      clamp(
        model.impulsiveness * 0.65 +
          inverseScore(model.planning) *
            0.35,
      ),

    build: () => ({
      hintType: 'PLANNING',
      hintTiming: 'IMMEDIATE',
      hintDetailLevel: 'LOW',
      difficultyAdjustment: 0,
      recommendedSkillFocus:
        'planning',
      action:
        'THEN 在下一次放置前要求學習者先選擇建構位置並說明理由，以低細節規劃提示取代直接答案。',
    }),
  },

  // -------------------------------------------------------------------------
  // Priority 6：中度提示需求
  // -------------------------------------------------------------------------
  {
    ruleId: 'AD-11',
    priority: 6,
    category: 'HINT_REGULATION',

    condition:
      'IF hintDependency is between 0.45 and 0.65',

    test: model =>
      model.hintDependency >=
        THRESHOLDS.mediumHintDependency &&
      model.hintDependency <
        THRESHOLDS.highHintDependency,

    matchingScore: model =>
      clamp(
        model.hintDependency,
      ),

    build: model => ({
      hintType:
        model.planning <
        model.spatialVisualization
          ? 'PLANNING'
          : 'STRUCTURAL',
      hintTiming: 'DELAYED',
      hintDetailLevel: 'LOW',
      difficultyAdjustment: 0,
      recommendedSkillFocus:
        getWeakestAbility(model),
      action:
        'THEN 採漸進式提示：先給方向性問題，若仍無法完成再提供局部結構資訊，維持目前難度。',
    }),
  },

  // -------------------------------------------------------------------------
  // Priority 7：所有核心能力已達良好程度
  // -------------------------------------------------------------------------
  {
    ruleId: 'AD-12',
    priority: 7,
    category: 'CHALLENGE_INCREASE',

    condition:
      'IF all core spatial abilities >= 0.75 AND predictedSuccessRate >= 0.80 AND cognitiveLoad < 0.55',

    test: model =>
      CORE_SPATIAL_ABILITIES.every(
        ability =>
          getAbilityScore(
            model,
            ability,
          ) >=
          THRESHOLDS.strongAbility,
      ) &&
      model.predictedSuccessRate >=
        THRESHOLDS.highPredictedSuccess &&
      model.cognitiveLoad <
        THRESHOLDS.mediumCognitiveLoad,

    matchingScore: model => {
      const averageAbility =
        CORE_SPATIAL_ABILITIES.reduce(
          (sum, ability) =>
            sum +
            getAbilityScore(
              model,
              ability,
            ),
          0,
        ) /
        CORE_SPATIAL_ABILITIES.length;

      return clamp(
        averageAbility * 0.5 +
          model.predictedSuccessRate *
            0.3 +
          inverseScore(
            model.cognitiveLoad,
          ) *
            0.2,
      );
    },

    build: model => ({
      hintType: 'NONE',
      hintTiming: 'DELAYED',
      hintDetailLevel: 'LOW',
      difficultyAdjustment: 1,
      recommendedSkillFocus:
        getWeakestAbility(
          model,
          CORE_SPATIAL_ABILITIES,
        ),
      action:
        'THEN 暫不主動提供提示，將下一關難度提高一級，增加結構複雜度或視角轉換要求，以維持適當挑戰。',
    }),
  },

  // -------------------------------------------------------------------------
  // Priority 8：整體穩定，維持難度
  // -------------------------------------------------------------------------
  {
    ruleId: 'AD-13',
    priority: 8,
    category: 'MAINTAIN',

    condition:
      'IF predictedSuccessRate is between 0.60 and 0.80 AND no high-severity weakness exists',

    test: (model, diagnoses) =>
      model.predictedSuccessRate >=
        THRESHOLDS.mediumPredictedSuccess &&
      model.predictedSuccessRate <
        THRESHOLDS.highPredictedSuccess &&
      !diagnoses.some(
        diagnosis =>
          diagnosis.severity === 'high' &&
          isWeaknessDiagnosis(diagnosis),
      ),

    matchingScore: model =>
      clamp(
        1 -
          Math.abs(
            model.predictedSuccessRate -
              0.7,
          ),
      ),

    build: model => ({
      hintType:
        model.hintDependency >
        THRESHOLDS.mediumHintDependency
          ? 'MOTIVATIONAL'
          : 'STRUCTURAL',
      hintTiming: 'DELAYED',
      hintDetailLevel: 'LOW',
      difficultyAdjustment: 0,
      recommendedSkillFocus:
        getWeakestAbility(model),
      action:
        'THEN 維持目前難度，僅在學習者持續停滯或主動求助時提供低細節提示，並優先練習目前相對較弱的能力。',
    }),
  },

  // -------------------------------------------------------------------------
  // Default
  // -------------------------------------------------------------------------
  {
    ruleId: 'AD-DEFAULT',
    priority: 99,
    category: 'MAINTAIN',

    condition:
      'ELSE maintain current difficulty and provide moderate adaptive support',

    test: () => true,

    matchingScore: () => 0,

    build: model => ({
      hintType: 'STRUCTURAL',
      hintTiming: 'DELAYED',
      hintDetailLevel: 'MEDIUM',
      difficultyAdjustment: 0,
      recommendedSkillFocus:
        getWeakestAbility(model),
      action:
        'THEN 維持目前難度，提供一般性結構提示，並將下一關優先安排至目前分數最低的能力構面。',
    }),
  },
];

// ---------------------------------------------------------------------------
// 5. 決策評估
// ---------------------------------------------------------------------------

function inverseScore(value: number): number {
  return clamp(1 - value);
}

/**
 * 評估 Decision Table 中所有規則。
 */
export function evaluateDecisionTable(
  model: PlayerModel,
  diagnoses: CognitiveDiagnosis[],
  context: AdaptiveDecisionContext = {},
): DecisionRuleEvaluation[] {
  return DECISION_TABLE.map(rule => {
    let matched = false;
    let matchingScore = 0;

    try {
      matched = rule.test(
        model,
        diagnoses,
        context,
      );

      matchingScore = matched
        ? clamp(
            rule.matchingScore(
              model,
              diagnoses,
              context,
            ),
          )
        : 0;
    } catch {
      matched = false;
      matchingScore = 0;
    }

    return {
      ruleId: rule.ruleId,
      priority: rule.priority,
      category: rule.category,
      condition: rule.condition,
      matched,
      matchingScore,
    };
  });
}

/**
 * 從所有命中規則中選擇最適合的規則。
 */
function selectBestRule(
  evaluations: DecisionRuleEvaluation[],
): DecisionRuleEvaluation {
  const matchedRules =
    evaluations.filter(
      evaluation =>
        evaluation.matched,
    );

  if (matchedRules.length === 0) {
    const fallback =
      evaluations.find(
        evaluation =>
          evaluation.ruleId ===
          'AD-DEFAULT',
      );

    if (!fallback) {
      throw new Error(
        'AdaptiveDecisionEngine：找不到預設決策規則。',
      );
    }

    return fallback;
  }

  return [...matchedRules].sort(
    (evaluationA, evaluationB) => {
      if (
        evaluationA.priority !==
        evaluationB.priority
      ) {
        return (
          evaluationA.priority -
          evaluationB.priority
        );
      }

      return (
        evaluationB.matchingScore -
        evaluationA.matchingScore
      );
    },
  )[0];
}

// ---------------------------------------------------------------------------
// 6. 主要決策函式
// ---------------------------------------------------------------------------

/**
 * 產生決策並回傳完整規則證據。
 */
export function decideWithEvidence(
  model: PlayerModel,
  diagnoses: CognitiveDiagnosis[],
  context: AdaptiveDecisionContext = {},
): AdaptiveDecisionResult {
  const evaluations =
    evaluateDecisionTable(
      model,
      diagnoses,
      context,
    );

  const selectedEvaluation =
    selectBestRule(
      evaluations,
    );

  const selectedRule =
    DECISION_TABLE.find(
      rule =>
        rule.ruleId ===
        selectedEvaluation.ruleId,
    );

  if (!selectedRule) {
    throw new Error(
      `AdaptiveDecisionEngine：找不到規則 ${selectedEvaluation.ruleId}。`,
    );
  }

  const decision: AdaptiveDecision = {
    ruleId: selectedRule.ruleId,
    condition: selectedRule.condition,
    ...selectedRule.build(
      model,
      diagnoses,
      context,
    ),
  };

  return {
    decision,
    selectedRule:
      selectedEvaluation,
    evaluations,
    generatedAt: Date.now(),
  };
}

/**
 * 相容原本的呼叫方式。
 *
 * 只回傳 AdaptiveDecision。
 */
export function decide(
  model: PlayerModel,
  diagnoses: CognitiveDiagnosis[],
  context: AdaptiveDecisionContext = {},
): AdaptiveDecision {
  return decideWithEvidence(
    model,
    diagnoses,
    context,
  ).decision;
}

// ---------------------------------------------------------------------------
// 7. 下一關難度計算
// ---------------------------------------------------------------------------

/**
 * 根據 PlayerModel 與 AdaptiveDecision 計算目標難度。
 *
 * Level.difficulty 預設為 1～10。
 */
export function calculateTargetDifficulty(
  decision: AdaptiveDecision,
  model: PlayerModel,
  currentLevel?: Level,
): number {
  const suitableDifficulty =
    estimateSuitableDifficulty(
      model,
      decision.recommendedSkillFocus,
    );

  /**
   * 若有當前關卡，將模型估計難度與當前難度混合，
   * 避免關卡難度突然大幅跳動。
   */
  const baseDifficulty =
    currentLevel
      ? currentLevel.difficulty * 0.45 +
        suitableDifficulty * 0.55
      : suitableDifficulty;

  return clampDifficulty(
    baseDifficulty +
      decision.difficultyAdjustment,
  );
}

// ---------------------------------------------------------------------------
// 8. 下一關選擇
// ---------------------------------------------------------------------------

interface LevelSelectionScore {
  level: Level;
  totalScore: number;
  skillMatchScore: number;
  difficultyMatchScore: number;
  noveltyScore: number;
}

/**
 * 對候選關卡評分。
 *
 * 分數越高越適合。
 */
function scoreLevelCandidate(
  level: Level,
  decision: AdaptiveDecision,
  targetDifficulty: number,
): LevelSelectionScore {
  const skillMatchScore =
    level.primarySkill ===
    decision.recommendedSkillFocus
      ? 1
      : 0.35;

  const difficultyDistance =
    Math.abs(
      level.difficulty -
        targetDifficulty,
    );

  const difficultyMatchScore =
    clamp(
      1 - difficultyDistance / 9,
    );

  /**
   * 同分時略微偏好較接近中間難度者，
   * 避免無其他資訊時總是挑最極端關卡。
   */
  const noveltyScore =
    clamp(
      1 -
        Math.abs(
          level.difficulty - 5.5,
        ) /
          5.5,
    );

  const totalScore =
    skillMatchScore * 0.55 +
    difficultyMatchScore * 0.4 +
    noveltyScore * 0.05;

  return {
    level,
    totalScore,
    skillMatchScore,
    difficultyMatchScore,
    noveltyScore,
  };
}

/**
 * 根據 Decision Table 結果選擇下一關。
 */
export function selectNextLevel(
  decision: AdaptiveDecision,
  model: PlayerModel,
  levelPool: Level[],
  completedLevels: string[],
  currentLevel?: Level,
): Level | null {
  const completedSet =
    new Set(completedLevels);

  const availableLevels =
    levelPool.filter(
      level =>
        !completedSet.has(level.id) &&
        level.id !== currentLevel?.id,
    );

  if (availableLevels.length === 0) {
    return null;
  }

  const targetDifficulty =
    calculateTargetDifficulty(
      decision,
      model,
      currentLevel,
    );

  const scoredLevels =
    availableLevels.map(level =>
      scoreLevelCandidate(
        level,
        decision,
        targetDifficulty,
      ),
    );

  scoredLevels.sort(
    (candidateA, candidateB) => {
      if (
        candidateA.totalScore !==
        candidateB.totalScore
      ) {
        return (
          candidateB.totalScore -
          candidateA.totalScore
        );
      }

      const difficultyDistanceA =
        Math.abs(
          candidateA.level.difficulty -
            targetDifficulty,
        );

      const difficultyDistanceB =
        Math.abs(
          candidateB.level.difficulty -
            targetDifficulty,
        );

      if (
        difficultyDistanceA !==
        difficultyDistanceB
      ) {
        return (
          difficultyDistanceA -
          difficultyDistanceB
        );
      }

      return candidateA.level.id.localeCompare(
        candidateB.level.id,
      );
    },
  );

  return scoredLevels[0].level;
}

// ---------------------------------------------------------------------------
// 9. 候選關卡排名
// ---------------------------------------------------------------------------

/**
 * 回傳完整候選關卡排名。
 *
 * 適合教師面板顯示：
 * 「AI 為什麼推薦這一關？」
 */
export function rankNextLevels(
  decision: AdaptiveDecision,
  model: PlayerModel,
  levelPool: Level[],
  completedLevels: string[],
  currentLevel?: Level,
): LevelSelectionScore[] {
  const completedSet =
    new Set(completedLevels);

  const availableLevels =
    levelPool.filter(
      level =>
        !completedSet.has(level.id) &&
        level.id !== currentLevel?.id,
    );

  const targetDifficulty =
    calculateTargetDifficulty(
      decision,
      model,
      currentLevel,
    );

  return availableLevels
    .map(level =>
      scoreLevelCandidate(
        level,
        decision,
        targetDifficulty,
      ),
    )
    .sort(
      (candidateA, candidateB) =>
        candidateB.totalScore -
        candidateA.totalScore,
    );
}

// ---------------------------------------------------------------------------
// 10. 決策摘要
// ---------------------------------------------------------------------------

/**
 * 建立供 XAI 或教師面板使用的決策摘要。
 */
export function buildDecisionSummary(
  decision: AdaptiveDecision,
  model: PlayerModel,
): string {
  const ability =
    decision.recommendedSkillFocus;

  const abilityScore =
    getAbilityScore(
      model,
      ability,
    );

  const difficultyText =
    decision.difficultyAdjustment === -1
      ? '降低一級'
      : decision.difficultyAdjustment === 1
        ? '提高一級'
        : '維持不變';

  return (
    `規則 ${decision.ruleId} 命中。` +
    `目前建議優先訓練 ${ability}，` +
    `該能力模型分數為 ${formatPercent(
      abilityScore,
    )}。` +
    `提示方式為${getHintTypeDescription(
      decision.hintType,
    )}，` +
    `提示時間為${
      decision.hintTiming ===
      'IMMEDIATE'
        ? '立即'
        : '延遲'
    }，` +
    `下一關難度${difficultyText}。`
  );
}