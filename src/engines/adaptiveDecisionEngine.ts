import { PlayerModel, CognitiveDiagnosis, AdaptiveDecision, AbilityKey, Level } from '../types';

// ============================================================================
// Adaptive Decision Engine — 定義推薦下一關、提示方式等決策規則
// 對應「程式碼還需改進方向.docx」第 3 點：需要 Decision Table，而非黑箱推薦
// ============================================================================

interface DecisionRule {
  ruleId: string;
  condition: string;
  test: (model: PlayerModel, diagnoses: CognitiveDiagnosis[]) => boolean;
  build: (model: PlayerModel, diagnoses: CognitiveDiagnosis[]) => Omit<AdaptiveDecision, 'ruleId' | 'condition'>;
}

// Decision Table：由上而下依序檢查，第一個命中的規則生效（優先序 = 表格順序）
const DECISION_TABLE: DecisionRule[] = [
  {
    ruleId: 'AD-01',
    condition: 'IF mentalRotation < 55 AND severity(mentalRotation) = high',
    test: (m, d) => m.mentalRotation < 55 && !!d.find(x => x.ability === 'mentalRotation' && x.severity === 'high'),
    build: () => ({
      hintType: 'PERSPECTIVE', hintTiming: 'IMMEDIATE', hintDetailLevel: 'HIGH',
      difficultyAdjustment: -1, recommendedSkillFocus: 'mentalRotation',
      action: 'THEN 立即給予高細節「視角轉換」提示，並降低下一關難度、推薦心理旋轉訓練關卡',
    }),
  },
  {
    ruleId: 'AD-02',
    condition: 'IF planning < 55 AND idleTime pattern detected',
    test: (m, d) => m.planning < 55 && !!d.find(x => x.ability === 'planning' && x.label.includes('Weakness')),
    build: () => ({
      hintType: 'PLANNING', hintTiming: 'DELAYED', hintDetailLevel: 'MEDIUM',
      difficultyAdjustment: -1, recommendedSkillFocus: 'planning',
      action: 'THEN 延遲提供「結構分解」提示（先鼓勵自行嘗試 10 秒），推薦規劃訓練關卡',
    }),
  },
  {
    ruleId: 'AD-03',
    condition: 'IF hintDependency > 60',
    test: (m) => m.hintDependency > 60,
    build: () => ({
      hintType: 'MOTIVATIONAL', hintTiming: 'DELAYED', hintDetailLevel: 'LOW',
      difficultyAdjustment: 0, recommendedSkillFocus: 'workingMemory',
      action: 'THEN 降低提示詳細度並延遲給予，改以反思問題引導學習者先行嘗試，避免提示依賴惡化',
    }),
  },
  {
    ruleId: 'AD-04',
    condition: 'IF spatialVisualization < 55',
    test: (m) => m.spatialVisualization < 55,
    build: () => ({
      hintType: 'STRUCTURAL', hintTiming: 'IMMEDIATE', hintDetailLevel: 'HIGH',
      difficultyAdjustment: -1, recommendedSkillFocus: 'spatialVisualization',
      action: 'THEN 給予結構性提示（指出多餘/缺少方塊位置），推薦空間視覺化訓練關卡',
    }),
  },
  {
    ruleId: 'AD-05',
    condition: 'IF persistence < 45 (idle detected)',
    test: (m) => m.persistence < 45,
    build: () => ({
      hintType: 'MOTIVATIONAL', hintTiming: 'IMMEDIATE', hintDetailLevel: 'LOW',
      difficultyAdjustment: -1, recommendedSkillFocus: 'persistence',
      action: 'THEN 給予鼓勵性提示與簡化的第一步建議，降低任務難度以重啟動機',
    }),
  },
  {
    ruleId: 'AD-06',
    condition: 'IF all abilities >= 70 (mastery)',
    test: (m) => (['mentalRotation', 'spatialVisualization', 'perspectiveTaking', 'planning'] as AbilityKey[])
      .every(k => (m as any)[k] >= 70),
    build: () => ({
      hintType: 'NONE', hintTiming: 'DELAYED', hintDetailLevel: 'LOW',
      difficultyAdjustment: 1, recommendedSkillFocus: 'planning',
      action: 'THEN 不主動提供提示，提高下一關難度以維持適當挑戰（Zone of Proximal Development）',
    }),
  },
  {
    ruleId: 'AD-DEFAULT',
    condition: 'ELSE（無規則命中，維持現況）',
    test: () => true,
    build: (m) => ({
      hintType: 'STRUCTURAL', hintTiming: 'IMMEDIATE', hintDetailLevel: 'MEDIUM',
      difficultyAdjustment: 0, recommendedSkillFocus: 'planning',
      action: 'THEN 提供一般性結構提示，維持目前難度',
    }),
  },
];

export function decide(model: PlayerModel, diagnoses: CognitiveDiagnosis[]): AdaptiveDecision {
  const rule = DECISION_TABLE.find(r => r.test(model, diagnoses))!;
  return { ruleId: rule.ruleId, condition: rule.condition, ...rule.build(model, diagnoses) };
}

/** 依據決策之 recommendedSkillFocus 與 difficultyAdjustment，從未完成關卡中挑選下一關 */
export function selectNextLevel(
  decision: AdaptiveDecision,
  model: PlayerModel,
  levelPool: Level[],
  completedLevels: string[]
): Level | null {
  const available = levelPool.filter(l => !completedLevels.includes(l.id));
  if (available.length === 0) return null;

  const currentSkillScore = (model as any)[decision.recommendedSkillFocus] ?? 50;
  const baseDifficulty = Math.max(1, Math.min(10, Math.floor(currentSkillScore / 10) + 2));
  const targetDifficulty = clampDifficulty(baseDifficulty + decision.difficultyAdjustment);

  const sorted = [...available].sort((a, b) => {
    const aMatch = a.primarySkill === decision.recommendedSkillFocus ? 0 : 1;
    const bMatch = b.primarySkill === decision.recommendedSkillFocus ? 0 : 1;
    if (aMatch !== bMatch) return aMatch - bMatch;
    return Math.abs(a.difficulty - targetDifficulty) - Math.abs(b.difficulty - targetDifficulty);
  });
  return sorted[0];
}

function clampDifficulty(v: number): number {
  return Math.max(1, Math.min(10, v));
}

export { DECISION_TABLE };
