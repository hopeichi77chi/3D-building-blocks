import {
  AdaptiveDecisionHistoryEntry,
  AssessmentItem,
  AssessmentResult,
  DynamicMetricState,
  EventLog,
  GroupAssignment,
  PlayerModel,
  PlayerModelMetricKey,
  PlayerModelSnapshot,
  ResearchSessionData,
  TutorInterventionWindow,
} from '../types';

// ============================================================================
// Research Module
// XAI-ASRITS Research Edition
//
// Responsibilities:
// 1. Experimental group assignment
// 2. Pre-/post-assessment scoring
// 3. Research data normalization and validation
// 4. CSV / JSON export
// 5. Browser-side file download
//
// Important:
// ASSESSMENT_ITEMS are placeholders only. Replace them with an authorized,
// validated spatial ability instrument before conducting a formal experiment.
// ============================================================================

export const RESEARCH_SCHEMA_VERSION = '3.0';

export const ASSESSMENT_ITEMS: AssessmentItem[] = [
  {
    id: 'Q1',
    question: '下列哪一個立體圖形，是將範例圖形旋轉後的結果？',
    imageHint: '[示意：三方塊 L 形立體圖，旋轉 90 度]',
    options: [
      '選項 A（正確旋轉）',
      '選項 B（鏡像）',
      '選項 C（不同形狀）',
      '選項 D（比例錯誤）',
    ],
    correctIndex: 0,
  },
  {
    id: 'Q2',
    question: '從正上方觀察此立體結構，下列哪一個俯視圖是正確的？',
    imageHint: '[示意：階梯狀立體結構]',
    options: ['俯視圖 A', '俯視圖 B（正確）', '俯視圖 C', '俯視圖 D'],
    correctIndex: 1,
  },
  {
    id: 'Q3',
    question: '若將此結構沿垂直軸旋轉 180 度，哪一個選項會是結果？',
    imageHint: '[示意：不對稱立體結構]',
    options: ['選項 A', '選項 B', '選項 C（正確）', '選項 D'],
    correctIndex: 2,
  },
  {
    id: 'Q4',
    question: '下列哪一個立體圖形無法由範例圖形透過旋轉得到（即為鏡像而非旋轉）？',
    imageHint: '[示意：多方塊組合圖形]',
    options: ['選項 A', '選項 B（鏡像，正確答案）', '選項 C', '選項 D'],
    correctIndex: 1,
  },
  {
    id: 'Q5',
    question: '此立體結構最少需要幾個方塊才能建構完成？',
    imageHint: '[示意：多層鏤空立體結構]',
    options: ['6 個', '7 個（正確）', '8 個', '9 個'],
    correctIndex: 1,
  },
];

const PLAYER_MODEL_METRIC_KEYS: PlayerModelMetricKey[] = [
  'mentalRotation',
  'spatialVisualization',
  'perspectiveTaking',
  'planning',
  'workingMemory',
  'persistence',
  'confidence',
  'hintDependency',
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

function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, finiteNumber(value)));
}

function safeJsonStringify(value: unknown): string {
  const seen = new WeakSet<object>();

  return JSON.stringify(value, (_key, currentValue: unknown) => {
    if (typeof currentValue === 'number' && !Number.isFinite(currentValue)) {
      return null;
    }

    if (typeof currentValue === 'bigint') {
      return currentValue.toString();
    }

    if (typeof currentValue === 'object' && currentValue !== null) {
      if (seen.has(currentValue)) {
        return '[Circular]';
      }
      seen.add(currentValue);
    }

    return currentValue;
  });
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  let text: string;
  if (typeof value === 'string') {
    text = value;
  } else if (typeof value === 'number' || typeof value === 'boolean') {
    text = String(value);
  } else {
    text = safeJsonStringify(value);
  }

  return `"${text.replace(/"/g, '""')}"`;
}

function csvRow(values: unknown[]): string {
  return values.map(csvCell).join(',');
}

function toIsoTimestamp(timestamp: number | undefined): string {
  if (!timestamp || !Number.isFinite(timestamp)) {
    return '';
  }

  return new Date(timestamp).toISOString();
}

function downloadSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof document !== 'undefined' &&
    typeof Blob !== 'undefined' &&
    typeof URL !== 'undefined' &&
    typeof URL.createObjectURL === 'function'
  );
}

/**
 * Deterministic participant assignment.
 * The same participant ID always receives the same group.
 */
export function assignGroup(participantId: string): GroupAssignment {
  const normalizedId = participantId.trim();
  let hash = 2166136261;

  for (let index = 0; index < normalizedId.length; index += 1) {
    hash ^= normalizedId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0) % 2 === 0 ? 'CONTROL' : 'EXPERIMENTAL';
}

export function scoreAssessment(
  answers: Array<number | null>,
  phase: 'PRE' | 'POST',
): AssessmentResult {
  const correctItems = ASSESSMENT_ITEMS.reduce((correct, item, index) => {
    return correct + (answers[index] === item.correctIndex ? 1 : 0);
  }, 0);

  const totalItems = ASSESSMENT_ITEMS.length;
  const score = totalItems === 0 ? 0 : Math.round((correctItems / totalItems) * 100);

  return {
    phase,
    score,
    totalItems,
    correctItems,
    timestamp: Date.now(),
  };
}

/**
 * Raw event log export. Payload is preserved as JSON in a single CSV cell.
 */
export function exportEventsToCSV(logs: EventLog[]): string {
  const headers = [
    'id',
    'timestamp',
    'timestamp_iso',
    'participant_id',
    'session_id',
    'level_id',
    'intervention_id',
    'tutor_cycle',
    'event_type',
    'payload_json',
  ];

  const chronologicalLogs = [...logs].sort((a, b) => a.timestamp - b.timestamp);
  const rows = chronologicalLogs.map((log) =>
    csvRow([
      log.id,
      log.timestamp,
      toIsoTimestamp(log.timestamp),
      log.participantId,
      log.sessionId,
      log.levelId,
      log.interventionId,
      log.tutorCycle,
      log.type,
      log.payload,
    ]),
  );

  return [csvRow(headers), ...rows].join('\n');
}

function metricStateFor(
  snapshot: PlayerModelSnapshot,
  metric: PlayerModelMetricKey,
): DynamicMetricState | undefined {
  return snapshot.metricStates[metric];
}

/**
 * One row per player-model snapshot. Suitable for SPSS, R, Python or Excel.
 */
export function exportPlayerModelHistoryToCSV(
  snapshots: PlayerModelSnapshot[],
): string {
  const baseHeaders = [
    'snapshot_id',
    'timestamp',
    'timestamp_iso',
    'participant_id',
    'session_id',
    'level_id',
    'trigger_event_id',
    'trigger_type',
    'intervention_id',
    'decision_rule_id',
    'overall_confidence',
    'previous_mastery',
    'current_mastery',
    'mastery_change',
    'learning_trend',
    'knowledge_mastery_json',
    'diagnosis_rule_ids',
    'diagnosis_labels',
    'behavior_features_json',
    'behavior_vector_json',
  ];

  const metricHeaders = PLAYER_MODEL_METRIC_KEYS.flatMap((metric) => [
    metric,
    `${metric}_confidence`,
    `${metric}_change`,
    `${metric}_trend`,
    `${metric}_observations`,
    `${metric}_evidence_ids`,
  ]);

  const rows = [...snapshots]
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((snapshot) => {
      const metricValues = PLAYER_MODEL_METRIC_KEYS.flatMap((metric) => {
        const state = metricStateFor(snapshot, metric);
        const modelValue = snapshot.model[metric];

        return [
          typeof modelValue === 'number' ? modelValue : state?.value,
          state?.confidence,
          state?.change,
          state?.trend,
          state?.observations,
          state?.evidenceIds.join('|'),
        ];
      });

      return csvRow([
        snapshot.id,
        snapshot.timestamp,
        toIsoTimestamp(snapshot.timestamp),
        snapshot.participantId,
        snapshot.sessionId,
        snapshot.levelId,
        snapshot.triggerEventId,
        snapshot.triggerType,
        snapshot.interventionId,
        snapshot.decisionRuleId,
        clamp01(snapshot.overallConfidence),
        clamp01(snapshot.previousMastery),
        clamp01(snapshot.currentMastery),
        finiteNumber(snapshot.masteryChange),
        snapshot.model.learningTrend,
        snapshot.model.knowledgeMastery,
        snapshot.diagnoses.map((diagnosis) => diagnosis.ruleId).join('|'),
        snapshot.diagnoses.map((diagnosis) => diagnosis.label).join('|'),
        snapshot.behaviorFeatures,
        snapshot.behaviorVector,
        ...metricValues,
      ]);
    });

  return [csvRow([...baseHeaders, ...metricHeaders]), ...rows].join('\n');
}

/**
 * One row per tutor intervention. Subjective and objective outcomes remain
 * separate to preserve research validity.
 */
export function exportTutorInterventionsToCSV(
  interventions: TutorInterventionWindow[],
): string {
  const headers = [
    'intervention_id',
    'level_id',
    'cycle',
    'hint_level',
    'hint_type',
    'hint',
    'started_at',
    'started_at_iso',
    'ended_at',
    'ended_at_iso',
    'duration_ms',
    'start_event_index',
    'end_event_index',
    'self_reported_result',
    'objective_result',
    'improvement_score',
    'before_completion_rate',
    'after_completion_rate',
    'completion_gain',
    'before_precision',
    'after_precision',
    'correct_block_gain',
    'incorrect_block_change',
    'missing_block_change',
    'before_error_rate',
    'after_error_rate',
    'error_rate_change',
    'before_efficiency',
    'after_efficiency',
    'efficiency_change',
    'player_model_snapshot_before_id',
    'player_model_snapshot_after_id',
    'evidence',
  ];

  const rows = [...interventions]
    .sort((a, b) => a.startedAt - b.startedAt)
    .map((intervention) => {
      const before = intervention.beforeEvaluation;
      const after = intervention.afterEvaluation;
      const duration = intervention.endedAt
        ? Math.max(0, intervention.endedAt - intervention.startedAt)
        : undefined;

      return csvRow([
        intervention.id,
        intervention.levelId,
        intervention.cycle,
        intervention.hintLevel,
        intervention.hintType,
        intervention.hint,
        intervention.startedAt,
        toIsoTimestamp(intervention.startedAt),
        intervention.endedAt,
        toIsoTimestamp(intervention.endedAt),
        duration,
        intervention.startEventIndex,
        intervention.endEventIndex,
        intervention.selfReportedResult,
        intervention.objectiveResult,
        intervention.improvementScore,
        before?.completionRate,
        after?.completionRate,
        before && after ? after.completionRate - before.completionRate : undefined,
        before?.precision,
        after?.precision,
        before && after ? after.correctBlocks - before.correctBlocks : undefined,
        before && after ? after.incorrectBlocks - before.incorrectBlocks : undefined,
        before && after ? after.missingBlocks - before.missingBlocks : undefined,
        intervention.beforeFeatures.errorRate,
        intervention.afterFeatures?.errorRate,
        intervention.afterFeatures
          ? intervention.beforeFeatures.errorRate - intervention.afterFeatures.errorRate
          : undefined,
        intervention.beforeFeatures.efficiencyScore,
        intervention.afterFeatures?.efficiencyScore,
        intervention.afterFeatures
          ? intervention.afterFeatures.efficiencyScore -
            intervention.beforeFeatures.efficiencyScore
          : undefined,
        intervention.playerModelSnapshotBeforeId,
        intervention.playerModelSnapshotAfterId,
        intervention.evidence?.join('|'),
      ]);
    });

  return [csvRow(headers), ...rows].join('\n');
}

export function exportDecisionHistoryToCSV(
  decisions: AdaptiveDecisionHistoryEntry[],
): string {
  const headers = [
    'decision_history_id',
    'timestamp',
    'timestamp_iso',
    'level_id',
    'rule_id',
    'condition',
    'action',
    'hint_type',
    'hint_timing',
    'hint_detail_level',
    'difficulty_adjustment',
    'recommended_skill_focus',
    'diagnosis_rule_ids',
    'player_model_snapshot_id',
    'intervention_id',
    'outcome',
  ];

  const rows = [...decisions]
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((entry) =>
      csvRow([
        entry.id,
        entry.timestamp,
        toIsoTimestamp(entry.timestamp),
        entry.levelId,
        entry.decision.ruleId,
        entry.decision.condition,
        entry.decision.action,
        entry.decision.hintType,
        entry.decision.hintTiming,
        entry.decision.hintDetailLevel,
        entry.decision.difficultyAdjustment,
        entry.decision.recommendedSkillFocus,
        entry.diagnosisRuleIds.join('|'),
        entry.playerModelSnapshotId,
        entry.interventionId,
        entry.outcome,
      ]),
    );

  return [csvRow(headers), ...rows].join('\n');
}

/**
 * Backward-compatible export used by earlier App.tsx versions.
 */
export function exportPlayerModelToJSON(
  model: PlayerModel,
  results: AssessmentResult[],
): string {
  return JSON.stringify(
    {
      schemaVersion: RESEARCH_SCHEMA_VERSION,
      exportedAt: Date.now(),
      exportedAtIso: new Date().toISOString(),
      playerModel: model,
      assessments: results,
    },
    null,
    2,
  );
}

export function createResearchSessionData(
  input: Omit<ResearchSessionData, 'schemaVersion' | 'exportedAt'> &
    Partial<Pick<ResearchSessionData, 'schemaVersion' | 'exportedAt'>>,
): ResearchSessionData {
  return {
    ...input,
    schemaVersion: input.schemaVersion ?? RESEARCH_SCHEMA_VERSION,
    exportedAt: input.exportedAt ?? Date.now(),
    events: [...input.events].sort((a, b) => a.timestamp - b.timestamp),
    assessments: [...input.assessments].sort((a, b) => a.timestamp - b.timestamp),
    playerModelHistory: [...input.playerModelHistory].sort(
      (a, b) => a.timestamp - b.timestamp,
    ),
    tutorInterventions: [...input.tutorInterventions].sort(
      (a, b) => a.startedAt - b.startedAt,
    ),
    decisionHistory: input.decisionHistory
      ? [...input.decisionHistory].sort((a, b) => a.timestamp - b.timestamp)
      : undefined,
    completedLevelIds: input.completedLevelIds
      ? [...new Set(input.completedLevelIds)]
      : undefined,
  };
}

export function validateResearchSessionData(data: ResearchSessionData): string[] {
  const errors: string[] = [];

  if (!data.participantId.trim()) {
    errors.push('participantId 不可為空白。');
  }

  if (!data.schemaVersion.trim()) {
    errors.push('schemaVersion 不可為空白。');
  }

  if (!Number.isFinite(data.exportedAt)) {
    errors.push('exportedAt 必須是有效時間戳記。');
  }

  if (!data.finalPlayerModel) {
    errors.push('缺少 finalPlayerModel。');
  }

  const duplicateEventIds = data.events
    .map((event) => event.id)
    .filter((id, index, ids) => ids.indexOf(id) !== index);

  if (duplicateEventIds.length > 0) {
    errors.push(`事件 ID 重複：${[...new Set(duplicateEventIds)].join(', ')}`);
  }

  const duplicateSnapshotIds = data.playerModelHistory
    .map((snapshot) => snapshot.id)
    .filter((id, index, ids) => ids.indexOf(id) !== index);

  if (duplicateSnapshotIds.length > 0) {
    errors.push(`玩家模型快照 ID 重複：${[...new Set(duplicateSnapshotIds)].join(', ')}`);
  }

  return errors;
}

export function exportResearchSessionToJSON(data: ResearchSessionData): string {
  const normalized = createResearchSessionData(data);
  const validationErrors = validateResearchSessionData(normalized);

  return JSON.stringify(
    {
      ...normalized,
      exportValidation: {
        valid: validationErrors.length === 0,
        errors: validationErrors,
      },
      exportedAtIso: toIsoTimestamp(normalized.exportedAt),
    },
    null,
    2,
  );
}

export interface ResearchExportBundle {
  eventsCsv: string;
  playerModelHistoryCsv: string;
  tutorInterventionsCsv: string;
  decisionHistoryCsv?: string;
  researchSessionJson: string;
}

export function createResearchExportBundle(
  data: ResearchSessionData,
): ResearchExportBundle {
  const normalized = createResearchSessionData(data);

  return {
    eventsCsv: exportEventsToCSV(normalized.events),
    playerModelHistoryCsv: exportPlayerModelHistoryToCSV(
      normalized.playerModelHistory,
    ),
    tutorInterventionsCsv: exportTutorInterventionsToCSV(
      normalized.tutorInterventions,
    ),
    decisionHistoryCsv: normalized.decisionHistory
      ? exportDecisionHistoryToCSV(normalized.decisionHistory)
      : undefined,
    researchSessionJson: exportResearchSessionToJSON(normalized),
  };
}

/**
 * Browser-side text download. Throws a descriptive error outside a browser.
 */
export function downloadTextFile(
  filename: string,
  content: string,
  mime = 'text/plain;charset=utf-8',
): void {
  if (!downloadSupported()) {
    throw new Error('downloadTextFile 只能在支援 Blob 與 DOM 的瀏覽器環境中執行。');
  }

  const safeFilename = filename.trim() || `xai-asrits-export-${Date.now()}.txt`;
  const shouldAddUtf8Bom =
    mime.includes('csv') || mime.includes('text/plain') || mime.includes('json');
  const fileContent = shouldAddUtf8Bom ? `\uFEFF${content}` : content;

  const blob = new Blob([fileContent], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  try {
    anchor.href = url;
    anchor.download = safeFilename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}