import { CognitiveDiagnosis, AdaptiveDecision, BehaviorFeatures, XAIFeedback, PlayerModel } from '../types';

// ============================================================================
// Explainable AI Engine — 整合 Diagnosis + Decision，產生八要素回饋
// Diagnosis / Evidence / Reason / Confidence / Related Skill / Hint /
// Alternative Strategy / Expected Improvement （「想法.md」第 9 節規格）
// ============================================================================

const ABILITY_LABEL: Record<string, string> = {
  mentalRotation: '心理旋轉 (Mental Rotation)',
  spatialVisualization: '空間視覺化 (Spatial Visualization)',
  perspectiveTaking: '視角轉換 (Perspective Taking)',
  planning: '邏輯規劃 (Planning)',
  workingMemory: '工作記憶 (Working Memory)',
  persistence: '堅持度 (Persistence)',
};

const HINT_TEMPLATES: Record<string, (f: BehaviorFeatures) => string> = {
  STRUCTURAL: (f) => `請重新檢視目前的結構：留意是否有多餘或缺漏的方塊。你的建構錯誤率為 ${(f.errorRate * 100).toFixed(0)}%，建議先移除明顯偏離目標的方塊。`,
  PERSPECTIVE: (f) => `請嘗試將視角旋轉到「正上方」與「正側面」分別觀察一次，再回到立體視角建構，避免因單一角度誤判深度。`,
  PLANNING: (f) => `建議採取「由下而上」策略：先完成最底層，再逐層往上建構，減少工作記憶負擔。`,
  MOTIVATIONAL: (f) => `別擔心，先從最簡單的第一步開始：在正中央放置一個方塊作為參考點，逐步建立信心。`,
  NONE: () => `目前表現穩定，系統暫不主動提示，鼓勵你自行嘗試挑戰更高難度的結構。`,
};

const ALT_STRATEGY: Record<string, string> = {
  STRUCTURAL: '可切換至「三視圖」或「透明模式」比對目標模型的正確輪廓。',
  PERSPECTIVE: '每放置 2-3 個方塊就旋轉一次視角驗證，養成多角度確認的習慣。',
  PLANNING: '在動手前，先在腦中或紙上將目標形狀拆解為「底層、支柱、頂層」等子結構。',
  MOTIVATIONAL: '將大目標拆解為小步驟，每完成一小步就給自己肯定，降低任務的壓迫感。',
  NONE: '嘗試在時間限制下完成建構，挑戰自己的建構效率。',
};

export function generateXAI(
  diagnoses: CognitiveDiagnosis[],
  decision: AdaptiveDecision,
  features: BehaviorFeatures,
  model: PlayerModel
): XAIFeedback {
  const topDiagnosis = diagnoses[0];
  const diagnosisLabel = topDiagnosis ? topDiagnosis.label : '持續觀察中';
  const relatedAbility = topDiagnosis ? ABILITY_LABEL[topDiagnosis.ability] : ABILITY_LABEL[decision.recommendedSkillFocus];
  const confidence = topDiagnosis ? topDiagnosis.confidence : Math.round(model.confidence);

  const evidence = topDiagnosis
    ? topDiagnosis.evidenceSummary
    : `目前累積事件尚不足以形成高信心診斷（系統信心指數 ${model.confidence.toFixed(0)}%），將持續觀察行為特徵。`;

  const reason = topDiagnosis
    ? `此診斷由行為模式「${topDiagnosis.triggeredBy.join(', ')}」觸發（規則 ${topDiagnosis.ruleId}），並非單一事件的直接推論，而是跨多筆行為特徵的綜合推理結果。`
    : '系統尚在累積足夠的行為證據以進行跨事件的模式推論。';

  return {
    diagnosis: diagnosisLabel,
    evidence,
    reason,
    confidence,
    relatedAbility,
    hint: HINT_TEMPLATES[decision.hintType](features),
    alternativeStrategy: ALT_STRATEGY[decision.hintType],
    expectedImprovement: `依決策規則 ${decision.ruleId}（${decision.condition}），系統預期此介入可提升「${ABILITY_LABEL[decision.recommendedSkillFocus]}」表現，並將下一關難度${decision.difficultyAdjustment > 0 ? '提高' : decision.difficultyAdjustment < 0 ? '降低' : '維持'}以符合你目前的能力水準。`,
    nextRecommendation: `系統建議下一步進行「${ABILITY_LABEL[decision.recommendedSkillFocus]}」相關訓練關卡。`,
  };
}
