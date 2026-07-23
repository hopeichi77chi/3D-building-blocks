import {
  AbilityGrowthSummary,
  AbilityKey,
  AdaptiveDecisionHistoryEntry,
  CognitiveDiagnosis,
  EventLog,
  HintEffectSummary,
  LearningReport,
  PlayerModel,
  PlayerModelSnapshot,
  TutorInterventionWindow,
} from '../types';

// ============================================================================
// Learning Report Engine
// ----------------------------------------------------------------------------
// 產生同時可供學習者檢視與研究分析使用的學習報告。
//
// 相容兩種呼叫方式：
// 1. 舊版：generateLearningReport(model, diagnoses, completedLevels, logs)
// 2. 新版：generateLearningReport({ ...完整歷程資料 })
// ============================================================================

const ABILITY_KEYS: readonly AbilityKey[] = [
  'mentalRotation',
  'spatialVisualization',
  'perspectiveTaking',
  'planning',
  'workingMemory',
  'persistence',
] as const;

const ABILITY_LABELS: Record<AbilityKey, string> = {
  mentalRotation: '心理旋轉',
  spatialVisualization: '空間視覺化',
  perspectiveTaking: '視角轉換',
  planning: '規劃能力',
  workingMemory: '工作記憶',
  persistence: '持續力',
};

export interface GenerateLearningReportInput {
  finalModel: PlayerModel;
  diagnoses?: CognitiveDiagnosis[];
  completedLevels?: string[];
  logs?: EventLog[];
  modelHistory?: PlayerModelSnapshot[];
  tutorInterventions?: TutorInterventionWindow[];
  decisionHistory?: AdaptiveDecisionHistoryEntry[];
  knowledgeState?: unknown;
}

function isGenerateLearningReportInput(
  value: PlayerModel | GenerateLearningReportInput,
): value is GenerateLearningReportInput {
  return 'finalModel' in value;
}

function safeNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, safeNumber(value)));
}

function average(values: number[]): number {
  const valid = values.filter(Number.isFinite);
  if (valid.length === 0) return 0;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function countMostFrequent(values: string[]): string | undefined {
  if (values.length === 0) return undefined;

  const counts = new Map<string, number>();
  values.forEach((value) => {
    if (!value) return;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  });

  let selected: string | undefined;
  let highest = -1;

  counts.forEach((count, value) => {
    if (count > highest) {
      selected = value;
      highest = count;
    }
  });

  return selected;
}

function sortSnapshots(history: PlayerModelSnapshot[]): PlayerModelSnapshot[] {
  return [...history].sort((a, b) => a.timestamp - b.timestamp);
}

function getInitialModel(
  finalModel: PlayerModel,
  history: PlayerModelSnapshot[],
): PlayerModel {
  const sorted = sortSnapshots(history);
  return sorted[0]?.model ?? finalModel;
}

function getMetricConfidence(
  ability: AbilityKey,
  history: PlayerModelSnapshot[],
): number {
  const sorted = sortSnapshots(history);

  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const state = sorted[index].metricStates[ability];
    if (state) return clamp01(state.confidence);
  }

  return 0;
}

function createAbilityGrowthSummary(
  finalModel: PlayerModel,
  history: PlayerModelSnapshot[],
): AbilityGrowthSummary[] {
  const initialModel = getInitialModel(finalModel, history);

  return ABILITY_KEYS.map((ability) => {
    const initialValue = clamp01(initialModel[ability]);
    const finalValue = clamp01(finalModel[ability]);
    const change = finalValue - initialValue;

    return {
      ability,
      initialValue,
      finalValue,
      change,
      confidence: getMetricConfidence(ability, history),
      trend: change > 0.02 ? 'UP' : change < -0.02 ? 'DOWN' : 'STABLE',
    };
  });
}

function createHintEffectSummary(
  interventions: TutorInterventionWindow[],
): HintEffectSummary {
  const completed = interventions.filter(
    (item) => item.objectiveResult !== undefined,
  );

  const successfulInterventions = completed.filter(
    (item) => item.objectiveResult === 'SUCCESS',
  ).length;

  const partiallyEffectiveInterventions = completed.filter(
    (item) => item.objectiveResult === 'PARTIAL',
  ).length;

  const ineffectiveInterventions = completed.filter(
    (item) => item.objectiveResult === 'NO_IMPROVEMENT',
  ).length;

  const effectiveCount =
    successfulInterventions + partiallyEffectiveInterventions;

  return {
    totalInterventions: completed.length,
    successfulInterventions,
    partiallyEffectiveInterventions,
    ineffectiveInterventions,
    effectivenessRate:
      completed.length === 0 ? 0 : effectiveCount / completed.length,
    averageImprovementScore: average(
      completed.map((item) => safeNumber(item.improvementScore)),
    ),
  };
}

function selectStrengthsAndWeaknesses(
  model: PlayerModel,
): { strengths: AbilityKey[]; weaknesses: AbilityKey[] } {
  const sorted = [...ABILITY_KEYS].sort(
    (a, b) => safeNumber(model[b]) - safeNumber(model[a]),
  );

  return {
    strengths: sorted.slice(0, 2),
    weaknesses: sorted.slice(-2).reverse(),
  };
}

function buildRecommendation(
  model: PlayerModel,
  weaknesses: AbilityKey[],
  hintSummary: HintEffectSummary,
  diagnoses: CognitiveDiagnosis[],
): string {
  const weakest = weaknesses[0];
  const weakestLabel = weakest ? ABILITY_LABELS[weakest] : '空間推理';
  const weakestValue = weakest ? clamp01(model[weakest]) : 0;

  const diagnosis = [...diagnoses]
    .sort((a, b) => b.confidence - a.confidence)
    .find((item) => item.ability === weakest);

  const diagnosisText = diagnosis
    ? `目前主要診斷為「${diagnosis.label}」`
    : `目前「${weakestLabel}」是相對較需加強的能力`;

  if (hintSummary.totalInterventions > 0) {
    if (hintSummary.effectivenessRate >= 0.7) {
      return `${diagnosisText}。建議延續目前有效的漸進式提示策略，並安排更多「${weakestLabel}」相關關卡，以逐步提高能力穩定度。`;
    }

    if (hintSummary.ineffectiveInterventions >= 2) {
      return `${diagnosisText}。目前提示介入效果有限，建議改用更具體的步驟示範、視角對照或分段任務，並降低單次任務的資訊量。`;
    }
  }

  if (weakestValue < 0.4) {
    return `${diagnosisText}。建議先從低複雜度的「${weakestLabel}」訓練開始，搭配即時回饋與具體操作提示，再逐步提升關卡難度。`;
  }

  return `${diagnosisText}。建議優先增加「${weakestLabel}」相關訓練，並持續追蹤提示依賴、完成效率與能力趨勢。`;
}

function normalizeInput(
  modelOrInput: PlayerModel | GenerateLearningReportInput,
  diagnoses: CognitiveDiagnosis[] = [],
  completedLevels: string[] = [],
  logs: EventLog[] = [],
): Required<
  Pick<
    GenerateLearningReportInput,
    | 'finalModel'
    | 'diagnoses'
    | 'completedLevels'
    | 'logs'
    | 'modelHistory'
    | 'tutorInterventions'
    | 'decisionHistory'
  >
> &
  Pick<GenerateLearningReportInput, 'knowledgeState'> {
  if (isGenerateLearningReportInput(modelOrInput)) {
    return {
      finalModel: modelOrInput.finalModel,
      diagnoses: modelOrInput.diagnoses ?? [],
      completedLevels: modelOrInput.completedLevels ?? [],
      logs: modelOrInput.logs ?? [],
      modelHistory: modelOrInput.modelHistory ?? [],
      tutorInterventions: modelOrInput.tutorInterventions ?? [],
      decisionHistory: modelOrInput.decisionHistory ?? [],
      knowledgeState: modelOrInput.knowledgeState,
    };
  }

  return {
    finalModel: modelOrInput,
    diagnoses,
    completedLevels,
    logs,
    modelHistory: [],
    tutorInterventions: [],
    decisionHistory: [],
    knowledgeState: undefined,
  };
}

/**
 * 產生學習報告。
 *
 * 保留舊版四參數呼叫方式，並支援新版完整物件輸入。
 */
export function generateLearningReport(
  model: PlayerModel,
  diagnoses: CognitiveDiagnosis[],
  completedLevels: string[],
  logs: EventLog[],
): LearningReport;
export function generateLearningReport(
  input: GenerateLearningReportInput,
): LearningReport;
export function generateLearningReport(
  modelOrInput: PlayerModel | GenerateLearningReportInput,
  diagnoses: CognitiveDiagnosis[] = [],
  completedLevels: string[] = [],
  logs: EventLog[] = [],
): LearningReport {
  const input = normalizeInput(
    modelOrInput,
    diagnoses,
    completedLevels,
    logs,
  );

  const { strengths, weaknesses } = selectStrengthsAndWeaknesses(
    input.finalModel,
  );

  const abilityGrowth = createAbilityGrowthSummary(
    input.finalModel,
    input.modelHistory,
  );

  const hintEffectSummary = createHintEffectSummary(
    input.tutorInterventions,
  );

  const diagnosisRuleIds = [
    ...input.diagnoses.map((item) => item.ruleId),
    ...input.modelHistory.flatMap((snapshot) =>
      snapshot.diagnoses.map((item) => item.ruleId),
    ),
  ];

  const decisionRuleIds = [
    ...input.decisionHistory.map((item) => item.decision.ruleId),
    ...input.modelHistory
      .map((snapshot) => snapshot.decisionRuleId)
      .filter((value): value is string => Boolean(value)),
  ];

  return {
    generatedAt: Date.now(),
    playerModel: input.finalModel,
    diagnoses: input.diagnoses,
    strengths,
    weaknesses,
    levelsCompleted: new Set(input.completedLevels).size,
    totalEvents: input.logs.length,
    recommendation: buildRecommendation(
      input.finalModel,
      weaknesses,
      hintEffectSummary,
      input.diagnoses,
    ),
    abilityGrowth,
    hintEffectSummary,
    mostFrequentDiagnosisRuleId: countMostFrequent(diagnosisRuleIds),
    mostFrequentDecisionRuleId: countMostFrequent(decisionRuleIds),
  };
}

/**
 * 將能力代碼轉換為中文顯示名稱。
 */
export function getAbilityLabel(ability: AbilityKey): string {
  return ABILITY_LABELS[ability];
}

/**
 * 取得報告中成長幅度最大的能力。
 */
export function getMostImprovedAbility(
  report: LearningReport,
): AbilityGrowthSummary | undefined {
  return report.abilityGrowth
    ? [...report.abilityGrowth].sort((a, b) => b.change - a.change)[0]
    : undefined;
}

/**
 * 取得報告中退步幅度最大的能力。
 */
export function getMostDeclinedAbility(
  report: LearningReport,
): AbilityGrowthSummary | undefined {
  return report.abilityGrowth
    ? [...report.abilityGrowth].sort((a, b) => a.change - b.change)[0]
    : undefined;
}