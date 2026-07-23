import { PlayerModel, BehaviorFeatures, CognitiveDiagnosis, ModelUpdateEvidence, AbilityKey } from '../types';

// ============================================================================
// Player Model Update Engine — 公式化能力更新（回應「沒有能力更新依據」的缺口）
// 對應「程式碼還需改進方向.docx」第 2 點：
//   Evidence → Feature → Formula → Player Model
// 每一能力更新皆可回溯至具體公式與特徵貢獻度，而非黑箱式 +1/-1。
// ============================================================================

export const INITIAL_PLAYER_MODEL: PlayerModel = {
  mentalRotation: 50,
  spatialVisualization: 50,
  perspectiveTaking: 50,
  planning: 50,
  workingMemory: 50,
  persistence: 60,
  hintDependency: 10,
  confidence: 20,
};

// clamp helper
const clamp = (v: number, min = 0, max = 100) => Math.max(min, Math.min(max, v));

/**
 * 更新公式（每次事件觸發後執行一次）：
 *
 * Planning        = 0.4×norm(planningTime) + 0.3×(1-errorRate) + 0.3×constructionOrderScore
 * MentalRotation  = 0.5×(1-norm(rotationFrequency 過高懲罰)) + 0.5×(1-errorRate)   [配合旋轉但低錯誤 → 加分]
 * SpatialVis      = 0.6×(1-errorRate) + 0.4×(1-retryRate)
 * PerspectiveTak  = 0.5×norm(rotationFrequency) + 0.5×(1-errorRate)
 * WorkingMemory   = 0.6×(1-hintDependencyRate) + 0.4×(1-idle 正規化)
 * Persistence     = 0.7×(1-idle 正規化) + 0.3×(1-errorRate)
 * HintDependency  = 直接以 hintDependencyRate 為主要依據（越高則依賴度越高）
 *
 * 每次更新幅度以 LEARNING_RATE 控制，避免單一事件造成劇烈震盪；
 * 診斷結果（CognitiveDiagnosis）作為額外加權修正（severity 越高，修正力道越大）。
 */
const LEARNING_RATE = 6; // 每次評估最大調整幅度（分）

function norm(value: number, max: number): number {
  return clamp(value / max, 0, 1);
}

export function updatePlayerModel(
  prev: PlayerModel,
  features: BehaviorFeatures,
  diagnoses: CognitiveDiagnosis[],
  sessionEventCount: number
): { model: PlayerModel; evidenceTrail: ModelUpdateEvidence[] } {
  const evidenceTrail: ModelUpdateEvidence[] = [];
  const next: PlayerModel = { ...prev };

  const diagBoost = (ability: AbilityKey): number => {
    const d = diagnoses.find(x => x.ability === ability);
    if (!d) return 0;
    const dir = d.label.includes('Strength') || d.label.includes('良好') ? 1 : -1;
    const sevWeight = d.severity === 'high' ? 1 : d.severity === 'medium' ? 0.6 : 0.3;
    return dir * sevWeight * LEARNING_RATE * (d.confidence / 100);
  };

  const applyUpdate = (
    ability: AbilityKey,
    formula: string,
    rawScoreDelta: number,
    contributions: ModelUpdateEvidence['contributions']
  ) => {
    const before = next[ability];
    const boosted = rawScoreDelta + diagBoost(ability);
    const after = clamp(before + boosted);
    (next as any)[ability] = after;
    evidenceTrail.push({ ability, formula, contributions, delta: after - before, before, after });
  };

  // --- Planning ---
  {
    const a = 0.4 * norm(features.planningTime, 15);
    const b = 0.3 * (1 - features.errorRate);
    const c = 0.3 * features.constructionOrderScore;
    const score = (a + b + c) * LEARNING_RATE * 2 - LEARNING_RATE; // 映射至 [-LR, +LR] 區間
    applyUpdate('planning',
      'Planning = 0.4·norm(planningTime) + 0.3·(1-errorRate) + 0.3·constructionOrderScore',
      score,
      [
        { feature: 'planningTime', weight: 0.4, rawValue: features.planningTime, contribution: a },
        { feature: 'errorRate', weight: 0.3, rawValue: features.errorRate, contribution: b },
        { feature: 'constructionOrderScore', weight: 0.3, rawValue: features.constructionOrderScore, contribution: c },
      ]);
  }

  // --- Mental Rotation ---
  {
    const rotEngagement = norm(features.rotationFrequency, 20);
    const a = 0.5 * rotEngagement;
    const b = 0.5 * (1 - features.errorRate);
    const score = (a + b) * LEARNING_RATE * 2 - LEARNING_RATE;
    applyUpdate('mentalRotation',
      'MentalRotation = 0.5·norm(rotationFrequency) + 0.5·(1-errorRate)',
      score,
      [
        { feature: 'rotationFrequency', weight: 0.5, rawValue: features.rotationFrequency, contribution: a },
        { feature: 'errorRate', weight: 0.5, rawValue: features.errorRate, contribution: b },
      ]);
  }

  // --- Spatial Visualization ---
  {
    const a = 0.6 * (1 - features.errorRate);
    const b = 0.4 * (1 - features.retryRate);
    const score = (a + b) * LEARNING_RATE * 2 - LEARNING_RATE;
    applyUpdate('spatialVisualization',
      'SpatialVisualization = 0.6·(1-errorRate) + 0.4·(1-retryRate)',
      score,
      [
        { feature: 'errorRate', weight: 0.6, rawValue: features.errorRate, contribution: a },
        { feature: 'retryRate', weight: 0.4, rawValue: features.retryRate, contribution: b },
      ]);
  }

  // --- Perspective Taking ---
  {
    const a = 0.5 * norm(features.rotationFrequency, 20);
    const b = 0.5 * (1 - features.errorRate);
    const score = (a + b) * LEARNING_RATE * 2 - LEARNING_RATE;
    applyUpdate('perspectiveTaking',
      'PerspectiveTaking = 0.5·norm(rotationFrequency) + 0.5·(1-errorRate)',
      score,
      [
        { feature: 'rotationFrequency', weight: 0.5, rawValue: features.rotationFrequency, contribution: a },
        { feature: 'errorRate', weight: 0.5, rawValue: features.errorRate, contribution: b },
      ]);
  }

  // --- Working Memory ---
  {
    const a = 0.6 * (1 - features.hintDependencyRate);
    const b = 0.4 * (1 - norm(features.idleTime, 60));
    const score = (a + b) * LEARNING_RATE * 2 - LEARNING_RATE;
    applyUpdate('workingMemory',
      'WorkingMemory = 0.6·(1-hintDependencyRate) + 0.4·(1-norm(idleTime))',
      score,
      [
        { feature: 'hintDependencyRate', weight: 0.6, rawValue: features.hintDependencyRate, contribution: a },
        { feature: 'idleTime', weight: 0.4, rawValue: features.idleTime, contribution: b },
      ]);
  }

  // --- Persistence ---
  {
    const a = 0.7 * (1 - norm(features.idleTime, 60));
    const b = 0.3 * (1 - features.errorRate);
    const score = (a + b) * LEARNING_RATE * 2 - LEARNING_RATE;
    applyUpdate('persistence',
      'Persistence = 0.7·(1-norm(idleTime)) + 0.3·(1-errorRate)',
      score,
      [
        { feature: 'idleTime', weight: 0.7, rawValue: features.idleTime, contribution: a },
        { feature: 'errorRate', weight: 0.3, rawValue: features.errorRate, contribution: b },
      ]);
  }

  // --- Hint Dependency（獨立指標，非能力值，越高代表越依賴） ---
  {
    const before = next.hintDependency;
    const target = clamp(features.hintDependencyRate * 200); // 映射到 0-100
    const after = clamp(before + (target - before) * 0.3);
    next.hintDependency = after;
    evidenceTrail.push({
      ability: 'hintDependency',
      formula: 'HintDependency ← HintDependency + 0.3·(100·hintDependencyRate·2 - HintDependency)',
      contributions: [{ feature: 'hintDependencyRate', weight: 1, rawValue: features.hintDependencyRate, contribution: target }],
      delta: after - before, before, after,
    });
  }

  // --- 系統信心指數：隨累積事件數增加而提升 ---
  next.confidence = clamp(20 + sessionEventCount * 1.2, 0, 100);

  return { model: next, evidenceTrail };
}
