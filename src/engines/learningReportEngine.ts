import { PlayerModel, CognitiveDiagnosis, LearningReport, AbilityKey, EventLog } from '../types';

// ============================================================================
// Learning Report Generator — 對應「想法.md」第 14 節
// ============================================================================

const ABILITY_KEYS: AbilityKey[] = ['mentalRotation', 'spatialVisualization', 'perspectiveTaking', 'planning', 'workingMemory', 'persistence'];

export function generateLearningReport(
  model: PlayerModel,
  diagnoses: CognitiveDiagnosis[],
  completedLevels: string[],
  logs: EventLog[]
): LearningReport {
  const sorted = [...ABILITY_KEYS].sort((a, b) => (model as any)[b] - (model as any)[a]);
  const strengths = sorted.slice(0, 2);
  const weaknesses = sorted.slice(-2).reverse();

  const weakestLabel = weaknesses[0];
  const recommendation = `建議優先加強「${weakestLabel}」相關訓練，系統將於下一階段提高該能力對應關卡的推薦權重。`;

  return {
    generatedAt: Date.now(),
    playerModel: model,
    diagnoses,
    strengths,
    weaknesses,
    levelsCompleted: completedLevels.length,
    totalEvents: logs.length,
    recommendation,
  };
}
