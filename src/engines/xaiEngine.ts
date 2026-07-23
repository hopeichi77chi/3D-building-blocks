import {
  AbilityKey,
  AdaptiveDecision,
  BehaviorFeatures,
  BehaviorVector,
  CognitiveDiagnosis,
  HintType,
  PlayerModel,
  XAIFeedback,
  XAIResult,
} from '../types';

// ============================================================================
// Explainable AI Engine
// Explainable AI-based Adaptive Spatial Reasoning Intelligent Tutoring System
//
// 功能：
// 1. 整合 BehaviorFeatures、BehaviorVector、CognitiveDiagnosis。
// 2. 整合 PlayerModel 與 AdaptiveDecision。
// 3. 提供多筆行為證據，而非只顯示單一診斷文字。
// 4. 顯示模型估計信心值。
// 5. 顯示 Decision Table 命中規則。
// 6. 提供替代策略與反事實解釋。
// 7. 提供下一關預測成功率與預期改善。
// 8. 同時支援舊版 XAIFeedback 與新版 XAIResult。
//
// Pipeline：
//
// Behavior Features
//       +
// Behavior Vector
//       +
// Cognitive Diagnosis
//       +
// Player Model
//       +
// Adaptive Decision
//       ↓
// Explainable AI Feedback
// ============================================================================

// ---------------------------------------------------------------------------
// 1. 型別定義
// ---------------------------------------------------------------------------

/**
 * XAI 產生時可額外傳入的情境。
 */
export interface XAIContext {
  /**
   * 本次關卡是否完成。
   */
  levelCompleted?: boolean;

  /**
   * 當前關卡 ID。
   */
  currentLevelId?: string;

  /**
   * 當前關卡名稱。
   */
  currentLevelName?: string;

  /**
   * 當前難度，建議為 1～10。
   */
  currentDifficulty?: number;

  /**
   * 下一關預計難度。
   */
  nextDifficulty?: number;

  /**
   * 推薦下一關 ID。
   */
  recommendedLevelId?: string;

  /**
   * 推薦下一關名稱。
   */
  recommendedLevelName?: string;

  /**
   * Decision Table 規則匹配度，0～1。
   */
  decisionMatchingScore?: number;

  /**
   * 玩家模型整體推論信心，0～1。
   */
  playerModelConfidence?: number;

  /**
   * 是否使用 Knowledge Tracing。
   */
  knowledgeTracingEnabled?: boolean;
}

/**
 * 完整 XAI 內部結果。
 */
export interface DetailedXAIResult {
  /**
   * 舊版 UI 相容輸出。
   */
  feedback: XAIFeedback;

  /**
   * 新版研究用完整 XAI 結果。
   */
  result: XAIResult;

  /**
   * 結構化補充資料。
   */
  details: {
    primaryDiagnosis?: CognitiveDiagnosis;

    relatedAbility: AbilityKey;

    relatedAbilityLabel: string;

    abilityScore: number;

    modelConfidence: number;

    diagnosticConfidence: number;

    decisionConfidence: number;

    combinedConfidence: number;

    currentPredictedSuccessRate: number;

    predictedSuccessAfterIntervention: number;

    expectedImprovementRate: number;

    evidenceItems: string[];

    counterfactualExplanation: string;

    decisionExplanation: string;

    predictionExplanation: string;

    generatedAt: number;
  };
}

// ---------------------------------------------------------------------------
// 2. 常數
// ---------------------------------------------------------------------------

const ABILITY_LABEL: Record<AbilityKey, string> = {
  mentalRotation:
    '心理旋轉（Mental Rotation）',

  spatialVisualization:
    '空間視覺化（Spatial Visualization）',

  perspectiveTaking:
    '視角轉換（Perspective Taking）',

  planning:
    '邏輯規劃（Planning）',

  workingMemory:
    '工作記憶（Working Memory）',

  persistence:
    '堅持度（Persistence）',
};

const ABILITY_SHORT_LABEL: Record<
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

const HINT_TYPE_LABEL: Record<
  HintType,
  string
> = {
  STRUCTURAL: '結構分解提示',
  PERSPECTIVE: '視角轉換提示',
  PLANNING: '規劃策略提示',
  MOTIVATIONAL: '鼓勵與動機提示',
  NONE: '不主動提供提示',
};

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

  return Math.min(
    max,
    Math.max(min, value),
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
    values.reduce(
      (sum, value) => sum + value,
      0,
    ),
    values.length,
  );
}

function round(
  value: number,
  decimals = 4,
): number {
  const factor = Math.pow(10, decimals);

  return (
    Math.round(value * factor) /
    factor
  );
}

function formatPercent(
  value: number,
): string {
  return `${Math.round(clamp(value) * 100)}%`;
}

function formatSeconds(
  value: number,
): string {
  if (!Number.isFinite(value)) {
    return '0 秒';
  }

  return `${value.toFixed(1)} 秒`;
}

function formatFrequency(
  value: number,
): string {
  if (!Number.isFinite(value)) {
    return '0 次／分';
  }

  return `${value.toFixed(1)} 次／分`;
}

function normalizeConfidence(
  confidence: number,
): number {
  if (!Number.isFinite(confidence)) {
    return 0.5;
  }

  return confidence > 1
    ? clamp(confidence / 100)
    : clamp(confidence);
}

function isWeaknessDiagnosis(
  diagnosis: CognitiveDiagnosis,
): boolean {
  const label =
    diagnosis.label.toLowerCase();

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

function getAbilityScore(
  model: PlayerModel,
  ability: AbilityKey,
): number {
  return clamp(model[ability]);
}

function getDifficultyText(
  adjustment: -1 | 0 | 1,
): string {
  if (adjustment > 0) {
    return '提高一級';
  }

  if (adjustment < 0) {
    return '降低一級';
  }

  return '維持不變';
}

/**
 * 選擇主要診斷。
 *
 * 優先順序：
 * 1. 與 Decision 推薦能力相同。
 * 2. 弱點診斷優先。
 * 3. 信心值高者優先。
 */
function selectPrimaryDiagnosis(
  diagnoses: CognitiveDiagnosis[],
  decision: AdaptiveDecision,
): CognitiveDiagnosis | undefined {
  if (diagnoses.length === 0) {
    return undefined;
  }

  return [...diagnoses].sort(
    (diagnosisA, diagnosisB) => {
      const abilityMatchA =
        diagnosisA.ability ===
        decision.recommendedSkillFocus
          ? 1
          : 0;

      const abilityMatchB =
        diagnosisB.ability ===
        decision.recommendedSkillFocus
          ? 1
          : 0;

      if (abilityMatchA !== abilityMatchB) {
        return abilityMatchB - abilityMatchA;
      }

      const weaknessA =
        isWeaknessDiagnosis(diagnosisA)
          ? 1
          : 0;

      const weaknessB =
        isWeaknessDiagnosis(diagnosisB)
          ? 1
          : 0;

      if (weaknessA !== weaknessB) {
        return weaknessB - weaknessA;
      }

      return (
        diagnosisB.confidence -
        diagnosisA.confidence
      );
    },
  )[0];
}

// ---------------------------------------------------------------------------
// 4. Hint 產生
// ---------------------------------------------------------------------------

function generateStructuralHint(
  features: BehaviorFeatures,
  decision: AdaptiveDecision,
): string {
  const detailPrefix =
    decision.hintDetailLevel === 'HIGH'
      ? '請依序完成以下步驟：'
      : decision.hintDetailLevel ===
            'MEDIUM'
        ? '請先進行局部結構檢查：'
        : '先檢查一個最可能出錯的位置。';

  const errorInformation =
    features.errorRate > 0
      ? `目前建構錯誤率約為 ${formatPercent(
          features.errorRate,
        )}，`
      : '';

  const retryInformation =
    features.blockReplacementCount > 0
      ? `你已重新放置 ${features.blockReplacementCount} 次方塊，`
      : '';

  return (
    `${detailPrefix}` +
    `${errorInformation}` +
    `${retryInformation}` +
    '先比對目標模型與目前作品的底層輪廓，' +
    '確認每一個位置是否存在「缺少方塊、多餘方塊或高度錯誤」，' +
    '再從最底層開始修正。'
  );
}

function generatePerspectiveHint(
  features: BehaviorFeatures,
  decision: AdaptiveDecision,
): string {
  const rotationInformation =
    features.rotationFrequency < 2
      ? '你目前的視角切換次數偏少，'
      : features.rotationFrequency > 15
        ? '你目前旋轉視角的頻率偏高，可能尚未建立固定參考方向，'
        : '';

  const detailInstruction =
    decision.hintDetailLevel === 'HIGH'
      ? '請依序切換至正視圖、側視圖與頂視圖，分別確認寬度、深度與高度，再回到立體視角。'
      : decision.hintDetailLevel ===
            'MEDIUM'
        ? '請至少切換至頂視圖與側視圖各確認一次。'
        : '先換一個與目前垂直的視角進行確認。';

  return (
    rotationInformation +
    detailInstruction +
    '每次切換視角後，先選定一個固定方塊作為方向基準，避免反覆旋轉後失去空間定位。'
  );
}

function generatePlanningHint(
  features: BehaviorFeatures,
  decision: AdaptiveDecision,
): string {
  const planningInformation =
    features.planningTime < 3
      ? '你在很短時間內就開始建構，'
      : features.planningTime > 45
        ? '你在開始前花了較長時間觀察，'
        : '';

  const detailInstruction =
    decision.hintDetailLevel === 'HIGH'
      ? '請將目標拆成「底層輪廓、垂直支柱、上層結構」三個部分，完成一個部分後再進入下一部分。'
      : decision.hintDetailLevel ===
            'MEDIUM'
        ? '先確認底層需要哪些方塊，再逐層往上建構。'
        : '放置下一個方塊前，先說出它應位於哪一層。';

  return (
    planningInformation +
    detailInstruction +
    `目前建構順序分數為 ${formatPercent(
      features.constructionOrderScore,
    )}，建議使用由下而上的固定建構順序。`
  );
}

function generateMotivationalHint(
  features: BehaviorFeatures,
  decision: AdaptiveDecision,
): string {
  if (
    decision.hintDetailLevel === 'LOW'
  ) {
    return (
      '你不需要一次完成整個結構。' +
      '先選擇最容易確認的一個底層方塊，完成後再處理下一個位置。' +
      '系統會保留你的目前進度。'
    );
  }

  return (
    `你目前已完成約 ${formatPercent(
      features.completionRate,
    )} 的任務。` +
    '先完成一個可以確定的位置，再利用這個位置作為其他方塊的參考點。'
  );
}

function generateHint(
  hintType: HintType,
  features: BehaviorFeatures,
  decision: AdaptiveDecision,
): string {
  switch (hintType) {
    case 'STRUCTURAL':
      return generateStructuralHint(
        features,
        decision,
      );

    case 'PERSPECTIVE':
      return generatePerspectiveHint(
        features,
        decision,
      );

    case 'PLANNING':
      return generatePlanningHint(
        features,
        decision,
      );

    case 'MOTIVATIONAL':
      return generateMotivationalHint(
        features,
        decision,
      );

    case 'NONE':
    default:
      return (
        '目前表現穩定，系統暫不主動提供解答。' +
        '請依照自己的策略完成下一步，並在放置後自行切換視角驗證。'
      );
  }
}

// ---------------------------------------------------------------------------
// 5. 替代策略
// ---------------------------------------------------------------------------

function generateAlternativeStrategy(
  hintType: HintType,
  ability: AbilityKey,
): string {
  switch (hintType) {
    case 'STRUCTURAL':
      return (
        '替代策略：將目標結構依高度切成數個水平切面，' +
        '逐層計算每一層需要的方塊位置，再依切面完成建構。'
      );

    case 'PERSPECTIVE':
      return (
        '替代策略：不要持續自由旋轉模型，' +
        '改用固定的正視、側視與頂視三個方向逐一比對，' +
        '並以同一個角落作為方向基準。'
      );

    case 'PLANNING':
      return (
        '替代策略：先不要直接放置方塊，' +
        '先列出建構順序，例如「底層左側、底層右側、第二層、頂層」，' +
        '再依序執行。'
      );

    case 'MOTIVATIONAL':
      return (
        '替代策略：將目前任務縮小為一個可在短時間內完成的小目標，' +
        '例如先完成底層或先找到中央參考點。'
      );

    case 'NONE':
    default:
      return (
        `替代策略：嘗試以不同方法挑戰${ABILITY_SHORT_LABEL[ability]}，` +
        '例如限制旋轉次數、減少提示或縮短完成時間，以驗證能力是否穩定。'
      );
  }
}

// ---------------------------------------------------------------------------
// 6. 行為證據建立
// ---------------------------------------------------------------------------

interface EvidenceCandidate {
  text: string;
  relevance: number;
}

function buildFeatureEvidence(
  features: BehaviorFeatures,
  vector: BehaviorVector | undefined,
  ability: AbilityKey,
): string[] {
  const candidates: EvidenceCandidate[] =
    [];

  const addEvidence = (
    text: string,
    relevance: number,
  ): void => {
    candidates.push({
      text,
      relevance: clamp(relevance),
    });
  };

  switch (ability) {
    case 'mentalRotation':
      addEvidence(
        `視角旋轉頻率為 ${formatFrequency(
          features.rotationFrequency,
        )}。`,
        Math.max(
          normalizeRotationRisk(
            features.rotationFrequency,
          ),
          features.errorRate,
        ),
      );

      addEvidence(
        `本關攝影機旋轉 ${features.cameraRotationCount} 次，平均旋轉角度為 ${features.averageRotationAngle.toFixed(
          1,
        )} 度。`,
        clamp(
          features.cameraRotationCount /
            15,
        ),
      );

      addEvidence(
        `操作錯誤率為 ${formatPercent(
          features.errorRate,
        )}，重試率為 ${formatPercent(
          features.retryRate,
        )}。`,
        Math.max(
          features.errorRate,
          features.retryRate,
        ),
      );
      break;

    case 'spatialVisualization':
      addEvidence(
        `建構成功率為 ${formatPercent(
          features.successRate,
        )}，完成率為 ${formatPercent(
          features.completionRate,
        )}。`,
        Math.max(
          1 - features.successRate,
          1 - features.completionRate,
        ),
      );

      addEvidence(
        `建構順序分數為 ${formatPercent(
          features.constructionOrderScore,
        )}，序列一致性為 ${formatPercent(
          features.sequenceConsistency,
        )}。`,
        Math.max(
          1 -
            features.constructionOrderScore,
          1 -
            features.sequenceConsistency,
        ),
      );

      addEvidence(
        `本關移除方塊 ${features.blockRemovalCount} 次，重新放置 ${features.blockReplacementCount} 次。`,
        clamp(
          (
            features.blockRemovalCount +
            features.blockReplacementCount
          ) / 10,
        ),
      );
      break;

    case 'perspectiveTaking':
      addEvidence(
        `視角切換頻率為 ${formatFrequency(
          features.viewSwitchFrequency,
        )}，總視角變換次數為 ${features.perspectiveChangeCount} 次。`,
        Math.max(
          features.errorRate,
          clamp(
            1 -
              features.perspectiveChangeCount /
                8,
          ),
        ),
      );

      addEvidence(
        `目標查看與注意力切換共出現 ${features.attentionSwitchCount} 次。`,
        clamp(
          features.attentionSwitchCount /
            20,
        ),
      );

      if (vector) {
        addEvidence(
          `探索行為向量為 ${formatPercent(
            vector.exploration,
          )}。`,
          1 - vector.exploration,
        );
      }
      break;

    case 'planning':
      addEvidence(
        `開始建構前的規劃時間為 ${formatSeconds(
          features.planningTime,
        )}。`,
        features.planningTime < 3
          ? 1
          : features.planningTime > 45
            ? 0.8
            : 0.4,
      );

      addEvidence(
        `規劃分數為 ${formatPercent(
          features.planningScore,
        )}，建構順序分數為 ${formatPercent(
          features.constructionOrderScore,
        )}。`,
        Math.max(
          1 - features.planningScore,
          1 -
            features.constructionOrderScore,
        ),
      );

      if (vector) {
        addEvidence(
          `規劃行為向量為 ${formatPercent(
            vector.planning,
          )}，衝動操作向量為 ${formatPercent(
            vector.impulsiveness,
          )}。`,
          Math.max(
            1 - vector.planning,
            vector.impulsiveness,
          ),
        );
      }
      break;

    case 'workingMemory':
      addEvidence(
        `行為式認知負荷估計為 ${formatPercent(
          features.cognitiveLoadEstimate,
        )}。`,
        features.cognitiveLoadEstimate,
      );

      addEvidence(
        `提示依賴率為 ${formatPercent(
          features.hintDependencyRate,
        )}，共請求提示 ${features.hintRequestCount} 次。`,
        clamp(
          features.hintDependencyRate *
            4,
        ),
      );

      addEvidence(
        `Undo、Redo 與重新放置合計 ${
          features.undoCount +
          features.redoCount +
          features.blockReplacementCount
        } 次。`,
        clamp(
          (
            features.undoCount +
            features.redoCount +
            features.blockReplacementCount
          ) / 10,
        ),
      );
      break;

    case 'persistence':
      addEvidence(
        `累積閒置時間為 ${formatSeconds(
          features.idleTime,
        )}，關卡完成率為 ${formatPercent(
          features.completionRate,
        )}。`,
        Math.max(
          clamp(features.idleTime / 60),
          1 - features.completionRate,
        ),
      );

      addEvidence(
        `堅持行為分數為 ${formatPercent(
          features.persistenceScore,
        )}，總重試次數為 ${features.totalRetries} 次。`,
        1 - features.persistenceScore,
      );

      if (vector) {
        addEvidence(
          `堅持行為向量為 ${formatPercent(
            vector.persistence,
          )}，反思向量為 ${formatPercent(
            vector.reflection,
          )}。`,
          Math.max(
            1 - vector.persistence,
            1 - vector.reflection,
          ),
        );
      }
      break;
  }

  return candidates
    .sort(
      (candidateA, candidateB) =>
        candidateB.relevance -
        candidateA.relevance,
    )
    .slice(0, 4)
    .map(candidate => candidate.text);
}

function normalizeRotationRisk(
  frequency: number,
): number {
  if (frequency < 2) {
    return clamp(
      1 - frequency / 2,
    );
  }

  if (frequency <= 12) {
    return 0.2;
  }

  return clamp(
    (frequency - 12) / 12,
  );
}

/**
 * 建立完整證據清單。
 */
function buildEvidenceItems(params: {
  primaryDiagnosis?: CognitiveDiagnosis;
  features: BehaviorFeatures;
  vector?: BehaviorVector;
  model: PlayerModel;
  decision: AdaptiveDecision;
  relatedAbility: AbilityKey;
}): string[] {
  const {
    primaryDiagnosis,
    features,
    vector,
    model,
    decision,
    relatedAbility,
  } = params;

  const evidence: string[] = [];

  if (primaryDiagnosis) {
    evidence.push(
      `認知診斷：${primaryDiagnosis.evidenceSummary}`,
    );

    if (
      primaryDiagnosis.triggeredBy.length >
      0
    ) {
      evidence.push(
        `診斷關聯模式：${primaryDiagnosis.triggeredBy.join(
          '、',
        )}。`,
      );
    }
  }

  evidence.push(
    ...buildFeatureEvidence(
      features,
      vector,
      relatedAbility,
    ),
  );

  evidence.push(
    `${ABILITY_SHORT_LABEL[relatedAbility]}玩家模型分數為 ${formatPercent(
      getAbilityScore(
        model,
        relatedAbility,
      ),
    )}。`,
  );

  evidence.push(
    `目前整體知識掌握度為 ${formatPercent(
      model.masteryLevel,
    )}，下一關預測成功率為 ${formatPercent(
      model.predictedSuccessRate,
    )}。`,
  );

  evidence.push(
    `Decision Table 命中規則 ${decision.ruleId}：${decision.condition}。`,
  );

  return Array.from(
    new Set(evidence),
  );
}

// ---------------------------------------------------------------------------
// 7. 信心值計算
// ---------------------------------------------------------------------------

function calculateDiagnosticConfidence(
  diagnosis?: CognitiveDiagnosis,
): number {
  if (!diagnosis) {
    return 0.4;
  }

  return normalizeConfidence(
    diagnosis.confidence,
  );
}

function calculateDecisionConfidence(
  decision: AdaptiveDecision,
  model: PlayerModel,
  context: XAIContext,
): number {
  if (
    context.decisionMatchingScore !==
    undefined
  ) {
    return clamp(
      context.decisionMatchingScore,
    );
  }

  const abilityWeakness =
    1 -
    getAbilityScore(
      model,
      decision.recommendedSkillFocus,
    );

  const predictionEvidence =
    decision.difficultyAdjustment < 0
      ? 1 - model.predictedSuccessRate
      : decision.difficultyAdjustment > 0
        ? model.predictedSuccessRate
        : 1 -
          Math.abs(
            model.predictedSuccessRate -
              0.7,
          );

  return clamp(
    abilityWeakness * 0.55 +
      predictionEvidence * 0.45,
  );
}

function calculateModelConfidence(
  model: PlayerModel,
  context: XAIContext,
): number {
  if (
    context.playerModelConfidence !==
    undefined
  ) {
    return clamp(
      context.playerModelConfidence,
    );
  }

  const abilityScores = [
    model.mentalRotation,
    model.spatialVisualization,
    model.perspectiveTaking,
    model.planning,
    model.workingMemory,
    model.persistence,
  ];

  const scoreClarity =
    average(
      abilityScores.map(
        score =>
          Math.abs(score - 0.5) * 2,
      ),
    );

  const knowledgeEvidence =
    model.knowledgeMastery.length > 0
      ? 0.75
      : 0.45;

  const trendEvidence =
    model.learningTrend === 'STABLE'
      ? 0.65
      : 0.8;

  return clamp(
    scoreClarity * 0.35 +
      knowledgeEvidence * 0.4 +
      trendEvidence * 0.25,
  );
}

function calculateCombinedConfidence(
  diagnosticConfidence: number,
  modelConfidence: number,
  decisionConfidence: number,
  hasDiagnosis: boolean,
): number {
  if (!hasDiagnosis) {
    return clamp(
      modelConfidence * 0.55 +
        decisionConfidence * 0.45,
    );
  }

  return clamp(
    diagnosticConfidence * 0.45 +
      modelConfidence * 0.3 +
      decisionConfidence * 0.25,
  );
}

// ---------------------------------------------------------------------------
// 8. 預測與預期改善
// ---------------------------------------------------------------------------

function calculateInterventionEffect(
  decision: AdaptiveDecision,
  model: PlayerModel,
): number {
  const abilityScore =
    getAbilityScore(
      model,
      decision.recommendedSkillFocus,
    );

  const improvementCapacity =
    1 - abilityScore;

  const hintEffect: Record<
    HintType,
    number
  > = {
    STRUCTURAL: 0.1,
    PERSPECTIVE: 0.09,
    PLANNING: 0.08,
    MOTIVATIONAL: 0.06,
    NONE: 0.02,
  };

  const detailEffect =
    decision.hintDetailLevel === 'HIGH'
      ? 0.04
      : decision.hintDetailLevel ===
            'MEDIUM'
        ? 0.025
        : 0.01;

  const difficultyEffect =
    decision.difficultyAdjustment < 0
      ? 0.05
      : decision.difficultyAdjustment > 0
        ? -0.025
        : 0;

  const dependencyPenalty =
    decision.hintType !== 'NONE'
      ? model.hintDependency * 0.035
      : 0;

  return clamp(
    improvementCapacity *
      (
        hintEffect[decision.hintType] +
        detailEffect +
        difficultyEffect
      ) -
      dependencyPenalty,
    0,
    0.2,
  );
}

function predictSuccessAfterIntervention(
  decision: AdaptiveDecision,
  model: PlayerModel,
): {
  predictedSuccess: number;
  expectedImprovement: number;
} {
  const currentPrediction =
    clamp(
      model.predictedSuccessRate,
    );

  const expectedImprovement =
    calculateInterventionEffect(
      decision,
      model,
    );

  const predictedSuccess =
    clamp(
      currentPrediction +
        expectedImprovement,
    );

  return {
    predictedSuccess,
    expectedImprovement,
  };
}

function buildPredictionExplanation(params: {
  currentPrediction: number;
  predictedSuccess: number;
  expectedImprovement: number;
  decision: AdaptiveDecision;
}): string {
  const {
    currentPrediction,
    predictedSuccess,
    expectedImprovement,
    decision,
  } = params;

  if (
    decision.difficultyAdjustment > 0
  ) {
    return (
      `目前預測成功率為 ${formatPercent(
        currentPrediction,
      )}。` +
      `由於下一關難度將提高，系統預估成功率約為 ${formatPercent(
        predictedSuccess,
      )}；此調整主要用於增加挑戰，而非追求短期成功率最大化。`
    );
  }

  return (
    `目前預測成功率為 ${formatPercent(
      currentPrediction,
    )}。` +
    `套用${HINT_TYPE_LABEL[
      decision.hintType
    ]}及難度調整後，` +
    `模型預估下一次相似任務成功率約為 ${formatPercent(
      predictedSuccess,
    )}，預期增加約 ${formatPercent(
      expectedImprovement,
    )}。`
  );
}

// ---------------------------------------------------------------------------
// 9. Reasoning 與反事實解釋
// ---------------------------------------------------------------------------

function buildReasoning(params: {
  primaryDiagnosis?: CognitiveDiagnosis;
  decision: AdaptiveDecision;
  relatedAbility: AbilityKey;
  abilityScore: number;
  diagnosticConfidence: number;
  modelConfidence: number;
  decisionConfidence: number;
}): string {
  const {
    primaryDiagnosis,
    decision,
    relatedAbility,
    abilityScore,
    diagnosticConfidence,
    modelConfidence,
    decisionConfidence,
  } = params;

  const diagnosisReason =
    primaryDiagnosis
      ? (
          `系統先依據規則 ${primaryDiagnosis.ruleId}，` +
          `將多項行為特徵整合為「${primaryDiagnosis.label}」診斷，` +
          `診斷信心值為 ${formatPercent(
            diagnosticConfidence,
          )}。`
        )
      : (
          '目前沒有任何認知診斷超過輸出門檻，' +
          '因此系統主要依據玩家模型與 Knowledge Tracing 結果進行決策。'
        );

  const modelReason =
    `${ABILITY_SHORT_LABEL[relatedAbility]}模型分數為 ${formatPercent(
      abilityScore,
    )}，玩家模型推論信心約為 ${formatPercent(
      modelConfidence,
    )}。`;

  const decisionReason =
    `Decision Table 規則 ${decision.ruleId} 命中，` +
    `規則匹配信心約為 ${formatPercent(
      decisionConfidence,
    )}，因此系統選擇${HINT_TYPE_LABEL[
      decision.hintType
    ]}，並將難度${getDifficultyText(
      decision.difficultyAdjustment,
    )}。`;

  return (
    `${diagnosisReason}${modelReason}${decisionReason}` +
    '此結果是由多筆行為資料綜合推論，而不是由單一操作直接判定。'
  );
}

function buildCounterfactualExplanation(
  decision: AdaptiveDecision,
  model: PlayerModel,
): string {
  const ability =
    decision.recommendedSkillFocus;

  const score =
    getAbilityScore(model, ability);

  switch (decision.hintType) {
    case 'PERSPECTIVE':
      return (
        `反事實說明：若${ABILITY_SHORT_LABEL[ability]}分數高於 65%，` +
        '且視角切換後的錯誤率降低，系統將不再立即提供視角提示，' +
        '而會改為延遲或取消提示。'
      );

    case 'STRUCTURAL':
      return (
        '反事實說明：若建構成功率提高、移除與重新放置次數下降，' +
        '系統將降低結構提示詳細度，並維持或提高下一關難度。'
      );

    case 'PLANNING':
      return (
        `反事實說明：若規劃能力由目前 ${formatPercent(
          score,
        )} 提高至 65% 以上，` +
        '且建構順序更具一致性，系統將不再要求先進行結構拆解。'
      );

    case 'MOTIVATIONAL':
      return (
        '反事實說明：若堅持度、投入度與自信維持在 60% 以上，' +
        '系統將停止主動鼓勵，改由學習者獨立完成任務。'
      );

    case 'NONE':
    default:
      return (
        '反事實說明：若預測成功率下降、認知負荷上升，' +
        '或任一核心能力出現高信心弱點診斷，系統將恢復提供自適應提示。'
      );
  }
}

// ---------------------------------------------------------------------------
// 10. 下一步建議
// ---------------------------------------------------------------------------

function buildNextRecommendation(
  decision: AdaptiveDecision,
  context: XAIContext,
): string {
  const abilityLabel =
    ABILITY_LABEL[
      decision.recommendedSkillFocus
    ];

  const levelText =
    context.recommendedLevelName
      ? `建議下一步進入「${context.recommendedLevelName}」`
      : context.recommendedLevelId
        ? `建議下一步進入關卡 ${context.recommendedLevelId}`
        : `建議下一步進行「${abilityLabel}」相關訓練關卡`;

  const difficultyText =
    context.nextDifficulty !== undefined
      ? `，預計難度為 ${context.nextDifficulty}`
      : `，難度將${getDifficultyText(
          decision.difficultyAdjustment,
        )}`;

  const hintText =
    decision.hintTiming === 'IMMEDIATE'
      ? '。若再次出現相同困難，系統會立即介入'
      : '。系統會先保留自主嘗試時間，再視需要介入';

  return (
    `${levelText}${difficultyText}${hintText}。`
  );
}

// ---------------------------------------------------------------------------
// 11. 完整 XAI 產生
// ---------------------------------------------------------------------------

/**
 * 產生完整 XAI 解釋。
 */
export function generateDetailedXAI(params: {
  diagnoses: CognitiveDiagnosis[];
  decision: AdaptiveDecision;
  features: BehaviorFeatures;
  model: PlayerModel;
  behaviorVector?: BehaviorVector;
  context?: XAIContext;
}): DetailedXAIResult {
  const {
    diagnoses,
    decision,
    features,
    model,
    behaviorVector,
    context = {},
  } = params;

  const primaryDiagnosis =
    selectPrimaryDiagnosis(
      diagnoses,
      decision,
    );

  const relatedAbility =
    primaryDiagnosis?.ability ??
    decision.recommendedSkillFocus;

  const relatedAbilityLabel =
    ABILITY_LABEL[relatedAbility];

  const abilityScore =
    getAbilityScore(
      model,
      relatedAbility,
    );

  const diagnosticConfidence =
    calculateDiagnosticConfidence(
      primaryDiagnosis,
    );

  const modelConfidence =
    calculateModelConfidence(
      model,
      context,
    );

  const decisionConfidence =
    calculateDecisionConfidence(
      decision,
      model,
      context,
    );

  const combinedConfidence =
    calculateCombinedConfidence(
      diagnosticConfidence,
      modelConfidence,
      decisionConfidence,
      Boolean(primaryDiagnosis),
    );

  const evidenceItems =
    buildEvidenceItems({
      primaryDiagnosis,
      features,
      vector: behaviorVector,
      model,
      decision,
      relatedAbility,
    });

  const reasoning =
    buildReasoning({
      primaryDiagnosis,
      decision,
      relatedAbility,
      abilityScore,
      diagnosticConfidence,
      modelConfidence,
      decisionConfidence,
    });

  const hint =
    generateHint(
      decision.hintType,
      features,
      decision,
    );

  const alternativeStrategy =
    generateAlternativeStrategy(
      decision.hintType,
      relatedAbility,
    );

  const prediction =
    predictSuccessAfterIntervention(
      decision,
      model,
    );

  const predictionExplanation =
    buildPredictionExplanation({
      currentPrediction:
        model.predictedSuccessRate,
      predictedSuccess:
        prediction.predictedSuccess,
      expectedImprovement:
        prediction.expectedImprovement,
      decision,
    });

  const counterfactualExplanation =
    buildCounterfactualExplanation(
      decision,
      model,
    );

  const nextRecommendation =
    buildNextRecommendation(
      decision,
      context,
    );

  const diagnosisLabel =
    primaryDiagnosis
      ? primaryDiagnosis.label
      : '目前未偵測到達診斷門檻的明確能力弱點';

  const expectedImprovement =
    (
      `系統預期此介入可使下一次相似任務的成功率由 ` +
      `${formatPercent(
        model.predictedSuccessRate,
      )} 調整至約 ${formatPercent(
        prediction.predictedSuccess,
      )}。` +
      `此為模型估計值，並非保證結果。`
    );

  const decisionExplanation =
    (
      `規則 ${decision.ruleId} 的條件為「${decision.condition}」。` +
      `系統因此選擇${HINT_TYPE_LABEL[
        decision.hintType
      ]}、` +
      `${
        decision.hintTiming ===
        'IMMEDIATE'
          ? '立即'
          : '延遲'
      }介入、` +
      `${decision.hintDetailLevel} 細節層級，` +
      `下一關難度${getDifficultyText(
        decision.difficultyAdjustment,
      )}。`
    );

  const feedback: XAIFeedback = {
    diagnosis: diagnosisLabel,

    evidence:
      evidenceItems.join(' '),

    reason: reasoning,

    confidence:
      Math.round(
        combinedConfidence * 100,
      ),

    relatedAbility:
      relatedAbilityLabel,

    hint,

    alternativeStrategy,

    expectedImprovement,

    nextRecommendation,
  };

  const result: XAIResult = {
    diagnosis: diagnosisLabel,

    evidence: evidenceItems,

    reasoning,

    confidence:
      Math.round(
        combinedConfidence * 100,
      ),

    decisionRule:
      `${decision.ruleId}：${decision.condition}`,

    alternativeStrategy:
      `${alternativeStrategy} ${counterfactualExplanation}`,

    recommendation:
      `${hint} ${nextRecommendation}`,

    prediction:
      predictionExplanation,
  };

  return {
    feedback,
    result,

    details: {
      primaryDiagnosis,

      relatedAbility,

      relatedAbilityLabel,

      abilityScore:
        round(abilityScore),

      modelConfidence:
        round(modelConfidence),

      diagnosticConfidence:
        round(
          diagnosticConfidence,
        ),

      decisionConfidence:
        round(
          decisionConfidence,
        ),

      combinedConfidence:
        round(
          combinedConfidence,
        ),

      currentPredictedSuccessRate:
        round(
          model.predictedSuccessRate,
        ),

      predictedSuccessAfterIntervention:
        round(
          prediction.predictedSuccess,
        ),

      expectedImprovementRate:
        round(
          prediction.expectedImprovement,
        ),

      evidenceItems,

      counterfactualExplanation,

      decisionExplanation,

      predictionExplanation,

      generatedAt:
        Date.now(),
    },
  };
}

// ---------------------------------------------------------------------------
// 12. 舊版相容函式
// ---------------------------------------------------------------------------

/**
 * 保留原本 generateXAI() 呼叫方式。
 *
 * 回傳 XAIFeedback，避免現有 UI 立即報錯。
 */
export function generateXAI(
  diagnoses: CognitiveDiagnosis[],
  decision: AdaptiveDecision,
  features: BehaviorFeatures,
  model: PlayerModel,
  behaviorVector?: BehaviorVector,
  context: XAIContext = {},
): XAIFeedback {
  return generateDetailedXAI({
    diagnoses,
    decision,
    features,
    model,
    behaviorVector,
    context,
  }).feedback;
}

// ---------------------------------------------------------------------------
// 13. 新版 XAIResult 函式
// ---------------------------------------------------------------------------

/**
 * 回傳研究版完整 XAIResult。
 */
export function generateXAIResult(
  diagnoses: CognitiveDiagnosis[],
  decision: AdaptiveDecision,
  features: BehaviorFeatures,
  model: PlayerModel,
  behaviorVector?: BehaviorVector,
  context: XAIContext = {},
): XAIResult {
  return generateDetailedXAI({
    diagnoses,
    decision,
    features,
    model,
    behaviorVector,
    context,
  }).result;
}

// ---------------------------------------------------------------------------
// 14. 教師面板專用摘要
// ---------------------------------------------------------------------------

/**
 * 建立適合教師面板顯示的完整文字摘要。
 */
export function buildXAITeacherSummary(
  detailedResult: DetailedXAIResult,
): string {
  const {
    feedback,
    details,
  } = detailedResult;

  return [
    `【診斷】${feedback.diagnosis}`,
    `【相關能力】${feedback.relatedAbility}`,
    `【綜合信心】${feedback.confidence}%`,
    `【能力分數】${formatPercent(
      details.abilityScore,
    )}`,
    `【診斷信心】${formatPercent(
      details.diagnosticConfidence,
    )}`,
    `【玩家模型信心】${formatPercent(
      details.modelConfidence,
    )}`,
    `【決策信心】${formatPercent(
      details.decisionConfidence,
    )}`,
    `【行為證據】${details.evidenceItems.join(
      ' ',
    )}`,
    `【推論理由】${feedback.reason}`,
    `【命中決策】${details.decisionExplanation}`,
    `【提示內容】${feedback.hint}`,
    `【替代策略】${feedback.alternativeStrategy}`,
    `【反事實說明】${details.counterfactualExplanation}`,
    `【預測】${details.predictionExplanation}`,
    `【下一步】${feedback.nextRecommendation}`,
  ].join('\n');
}