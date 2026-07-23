import { BehaviorPattern, BehaviorFeatures, CognitiveDiagnosis, PatternId } from '../types';

// ============================================================================
// Cognitive Diagnosis Engine — 定義能力診斷規則
// 對應「程式碼還需改進方向.docx」：
//   Behavior Pattern Recognition → Cognitive Diagnosis → Player Model Update
// 規則格式：IF <觸發模式組合 + 特徵門檻> THEN <能力診斷 + 嚴重度 + 信心>
// ============================================================================

interface DiagnosisRule {
  ruleId: string;
  requiredPatterns: PatternId[]; // 至少命中其中一個即可觸發（OR）
  ability: CognitiveDiagnosis['ability'];
  label: string;
  severityFn: (features: BehaviorFeatures, patterns: BehaviorPattern[]) => 'low' | 'medium' | 'high';
  confidenceFn: (features: BehaviorFeatures, patterns: BehaviorPattern[]) => number;
  evidenceFn: (features: BehaviorFeatures, patterns: BehaviorPattern[]) => string;
}

const RULES: DiagnosisRule[] = [
  {
    ruleId: 'CD-01',
    requiredPatterns: ['REPEATED_ROTATION', 'INSUFFICIENT_VIEW_CHECK'],
    ability: 'mentalRotation',
    label: 'Mental Rotation Weak（心理旋轉能力偏弱）',
    severityFn: (f) => (f.rotationFrequency > 15 ? 'high' : f.rotationFrequency > 8 ? 'medium' : 'low'),
    confidenceFn: (f, p) => Math.min(95, 55 + (p.find(x => x.id === 'REPEATED_ROTATION')?.strength ?? 0) * 40),
    evidenceFn: (f) => `視角旋轉頻率 ${f.rotationFrequency.toFixed(1)} 次/分，且反覆調整角度後仍需多次嘗試才能定位方塊。`,
  },
  {
    ruleId: 'CD-02',
    requiredPatterns: ['REPEATED_TRIAL_ERROR', 'RAPID_TRIAL_ERROR', 'BOTTOM_UP_STRATEGY'],
    ability: 'spatialVisualization',
    label: 'Spatial Visualization Weak（空間視覺化能力偏弱）',
    severityFn: (f) => (f.errorRate > 0.5 ? 'high' : f.errorRate > 0.25 ? 'medium' : 'low'),
    confidenceFn: (f) => Math.min(95, 50 + f.errorRate * 80),
    evidenceFn: (f) => `建構錯誤率達 ${(f.errorRate * 100).toFixed(0)}%，顯示對目標形狀的 3D 心理表徵掌握不完整。`,
  },
  {
    ruleId: 'CD-03',
    requiredPatterns: ['HESITATION_IDLE'],
    ability: 'planning',
    label: 'Planning Weakness（規劃能力不足）',
    severityFn: (f) => (f.planningTime < 3 && f.errorRate > 0.4 ? 'high' : 'medium'),
    confidenceFn: (f) => Math.min(90, 45 + (f.idleTime > 30 ? 25 : 10)),
    evidenceFn: (f) => `初始規劃時間僅 ${f.planningTime.toFixed(1)} 秒即開始放置，且中途出現長時間停滯（${f.idleTime.toFixed(1)}s），顯示缺乏事先拆解結構的策略。`,
  },
  {
    ruleId: 'CD-04',
    requiredPatterns: ['SYSTEMATIC_PLANNING'],
    ability: 'planning',
    label: 'Planning Strength（規劃能力良好）',
    severityFn: () => 'low',
    confidenceFn: (f) => Math.min(95, 60 + f.constructionOrderScore * 30),
    evidenceFn: (f) => `建構順序分數 ${(f.constructionOrderScore * 100).toFixed(0)}%，採取由下而上的系統化建構策略。`,
  },
  {
    ruleId: 'CD-05',
    requiredPatterns: ['HINT_OVERRELIANCE'],
    ability: 'workingMemory',
    label: 'Hint Dependency / Working Memory Load（提示依賴 / 工作記憶負荷）',
    severityFn: (f) => (f.hintDependencyRate > 0.3 ? 'high' : 'medium'),
    confidenceFn: (f) => Math.min(90, 50 + f.hintDependencyRate * 100),
    evidenceFn: (f) => `提示請求比例達 ${(f.hintDependencyRate * 100).toFixed(0)}%，可能反映工作記憶負荷過高，難以同時保存目標結構與操作步驟。`,
  },
  {
    ruleId: 'CD-06',
    requiredPatterns: ['HESITATION_IDLE'],
    ability: 'persistence',
    label: 'Persistence Decline（堅持度下降）',
    severityFn: (f) => (f.idleTime > 45 ? 'high' : 'medium'),
    confidenceFn: (f) => Math.min(90, 40 + f.idleTime),
    evidenceFn: (f) => `最長閒置時間達 ${f.idleTime.toFixed(1)} 秒，可能顯示動機或堅持度下降。`,
  },
  {
    ruleId: 'CD-07',
    requiredPatterns: ['INSUFFICIENT_VIEW_CHECK'],
    ability: 'perspectiveTaking',
    label: 'Perspective Taking Weak（視角轉換能力偏弱）',
    severityFn: (f) => (f.errorRate > 0.4 ? 'high' : 'medium'),
    confidenceFn: (f) => Math.min(90, 50 + f.errorRate * 70),
    evidenceFn: (f) => `旋轉頻率僅 ${f.rotationFrequency.toFixed(1)} 次/分但錯誤率達 ${(f.errorRate * 100).toFixed(0)}%，顯示缺乏多角度驗證習慣。`,
  },
];

/**
 * 由 Behavior Pattern 推論 Cognitive Diagnosis
 * IF 命中規則所需模式（OR） THEN 產生對應能力診斷
 */
export function diagnose(
  patterns: BehaviorPattern[],
  features: BehaviorFeatures
): CognitiveDiagnosis[] {
  const patternIds = new Set(patterns.map(p => p.id));
  const results: CognitiveDiagnosis[] = [];

  for (const rule of RULES) {
    const triggered = rule.requiredPatterns.filter(p => patternIds.has(p));
    if (triggered.length === 0) continue;
    results.push({
      ruleId: rule.ruleId,
      ability: rule.ability,
      label: rule.label,
      severity: rule.severityFn(features, patterns),
      confidence: Math.round(rule.confidenceFn(features, patterns)),
      triggeredBy: triggered,
      evidenceSummary: rule.evidenceFn(features, patterns),
    });
  }

  return results.sort((a, b) => b.confidence - a.confidence);
}
