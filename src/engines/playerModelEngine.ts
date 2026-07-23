import {
  AbilityKey,
  BehaviorFeatures,
  CognitiveDiagnosis,
  ModelUpdateEvidence,
  PlayerModel,
} from '../types';

// ============================================================================
// Player Model Update Engine
// Evidence → Feature → Formula → Dynamic Player Model
// ============================================================================

/**
 * 玩家模型預設值。
 *
 * 所有量尺皆採 0～100：
 * - 能力／學習特徵：越高代表表現越好或特徵越明顯。
 * - hintDependency、impulsiveness、cognitiveLoad：越高代表風險越高。
 */
export const INITIAL_PLAYER_MODEL: PlayerModel = {
  // Spatial ability
  mentalRotation: 50,
  spatialVisualization: 50,
  perspectiveTaking: 50,
  planning: 50,
  workingMemory: 50,
  persistence: 60,

  // Learning profile
  confidence: 20,
  hintDependency: 10,
  exploration: 50,
  efficiency: 50,
  helpSeeking: 30,
  reflection: 40,
  impulsiveness: 30,
  selfRegulation: 50,
  cognitiveLoad: 50,
  engagement: 50,
  motivation: 60,

  // Knowledge tracing compatibility
  knowledgeMastery: [50, 50, 50, 50, 50, 60],
  masteryLevel: 52,
  predictedSuccessRate: 50,
  learningTrend: 'STABLE',
};

const LEARNING_RATE = 6;
const PROFILE_SMOOTHING_RATE = 0.3;

function clamp(value: number, min = 0, max = 100): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function normalize(value: number, referenceMaximum: number): number {
  if (!Number.isFinite(value) || referenceMaximum <= 0) return 0;
  return clamp01(value / referenceMaximum);
}

function safeFeature(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function smooth(current: number, target: number, rate = PROFILE_SMOOTHING_RATE): number {
  return clamp(current + (clamp(target) - current) * clamp01(rate));
}

function average(values: number[]): number {
  const valid = values.filter(Number.isFinite);
  if (valid.length === 0) return 0;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function diagnosisAdjustment(
  diagnoses: CognitiveDiagnosis[],
  ability: AbilityKey,
): number {
  const relevant = diagnoses.filter(diagnosis => diagnosis.ability === ability);
  if (relevant.length === 0) return 0;

  const adjustments = relevant.map(diagnosis => {
    const label = diagnosis.label.toLowerCase();
    const isStrength =
      label.includes('strength') ||
      label.includes('良好') ||
      label.includes('優勢') ||
      label.includes('良好能力');

    const direction = isStrength ? 1 : -1;
    const severityWeight =
      diagnosis.severity === 'high'
        ? 1
        : diagnosis.severity === 'medium'
          ? 0.6
          : 0.3;

    const confidence = clamp(diagnosis.confidence) / 100;
    return direction * severityWeight * confidence * LEARNING_RATE;
  });

  return average(adjustments);
}

function determineLearningTrend(
  previousMastery: number,
  currentMastery: number,
): PlayerModel['learningTrend'] {
  const difference = currentMastery - previousMastery;

  if (difference >= 1.5) return 'UP';
  if (difference <= -1.5) return 'DOWN';
  return 'STABLE';
}

/**
 * 使用行為特徵與認知診斷更新玩家模型。
 *
 * 注意：此函式保留舊版呼叫介面，讓既有 Pipeline 可直接使用。
 * Knowledge Tracing 的更完整狀態可由 knowledgeTracingEngine.ts 管理；
 * 本檔仍同步維護 PlayerModel 中的相容欄位。
 */
export function updatePlayerModel(
  previousModel: PlayerModel,
  features: BehaviorFeatures,
  diagnoses: CognitiveDiagnosis[],
  sessionEventCount: number,
): { model: PlayerModel; evidenceTrail: ModelUpdateEvidence[] } {
  const previous: PlayerModel = {
    ...INITIAL_PLAYER_MODEL,
    ...previousModel,
    knowledgeMastery:
      Array.isArray(previousModel.knowledgeMastery) &&
      previousModel.knowledgeMastery.length > 0
        ? previousModel.knowledgeMastery
        : INITIAL_PLAYER_MODEL.knowledgeMastery,
  };

  const next: PlayerModel = { ...previous };
  const evidenceTrail: ModelUpdateEvidence[] = [];

  const errorRate = clamp01(safeFeature(features.errorRate));
  const retryRate = clamp01(safeFeature(features.retryRate));
  const hintDependencyRate = clamp01(
    safeFeature(features.hintDependencyRate),
  );
  const constructionOrderScore = clamp01(
    safeFeature(features.constructionOrderScore),
  );

  const applyAbilityUpdate = (
    ability: AbilityKey,
    formula: string,
    rawDelta: number,
    contributions: ModelUpdateEvidence['contributions'],
  ): void => {
    const before = next[ability];
    const diagnosisDelta = diagnosisAdjustment(diagnoses, ability);
    const after = clamp(before + rawDelta + diagnosisDelta);

    next[ability] = after;
    evidenceTrail.push({
      ability,
      formula,
      contributions: [
        ...contributions,
        ...(diagnosisDelta !== 0
          ? [
              {
                feature: 'diagnosis' as const,
                weight: 1,
                rawValue: diagnosisDelta,
                contribution: diagnosisDelta,
              },
            ]
          : []),
      ],
      delta: after - before,
      before,
      after,
    });
  };

  // -------------------------------------------------------------------------
  // 1. Planning
  // -------------------------------------------------------------------------
  {
    const planningTimeScore = normalize(
      safeFeature(features.planningTime),
      15,
    );
    const errorControlScore = 1 - errorRate;
    const orderScore = constructionOrderScore;

    const weightedScore =
      0.4 * planningTimeScore +
      0.3 * errorControlScore +
      0.3 * orderScore;
    const delta = (weightedScore * 2 - 1) * LEARNING_RATE;

    applyAbilityUpdate(
      'planning',
      'Planning = 0.4·norm(planningTime) + 0.3·(1-errorRate) + 0.3·constructionOrderScore',
      delta,
      [
        {
          feature: 'planningTime',
          weight: 0.4,
          rawValue: safeFeature(features.planningTime),
          contribution: 0.4 * planningTimeScore,
        },
        {
          feature: 'errorRate',
          weight: 0.3,
          rawValue: errorRate,
          contribution: 0.3 * errorControlScore,
        },
        {
          feature: 'constructionOrderScore',
          weight: 0.3,
          rawValue: constructionOrderScore,
          contribution: 0.3 * orderScore,
        },
      ],
    );
  }

  // -------------------------------------------------------------------------
  // 2. Mental Rotation
  // -------------------------------------------------------------------------
  {
    const rotationEngagement = normalize(
      safeFeature(features.rotationFrequency),
      20,
    );
    const accuracyScore = 1 - errorRate;
    const weightedScore = 0.5 * rotationEngagement + 0.5 * accuracyScore;
    const delta = (weightedScore * 2 - 1) * LEARNING_RATE;

    applyAbilityUpdate(
      'mentalRotation',
      'MentalRotation = 0.5·norm(rotationFrequency) + 0.5·(1-errorRate)',
      delta,
      [
        {
          feature: 'rotationFrequency',
          weight: 0.5,
          rawValue: safeFeature(features.rotationFrequency),
          contribution: 0.5 * rotationEngagement,
        },
        {
          feature: 'errorRate',
          weight: 0.5,
          rawValue: errorRate,
          contribution: 0.5 * accuracyScore,
        },
      ],
    );
  }

  // -------------------------------------------------------------------------
  // 3. Spatial Visualization
  // -------------------------------------------------------------------------
  {
    const accuracyScore = 1 - errorRate;
    const retryControlScore = 1 - retryRate;
    const weightedScore = 0.6 * accuracyScore + 0.4 * retryControlScore;
    const delta = (weightedScore * 2 - 1) * LEARNING_RATE;

    applyAbilityUpdate(
      'spatialVisualization',
      'SpatialVisualization = 0.6·(1-errorRate) + 0.4·(1-retryRate)',
      delta,
      [
        {
          feature: 'errorRate',
          weight: 0.6,
          rawValue: errorRate,
          contribution: 0.6 * accuracyScore,
        },
        {
          feature: 'retryRate',
          weight: 0.4,
          rawValue: retryRate,
          contribution: 0.4 * retryControlScore,
        },
      ],
    );
  }

  // -------------------------------------------------------------------------
  // 4. Perspective Taking
  // -------------------------------------------------------------------------
  {
    const viewSwitchScore = normalize(
      safeFeature(features.viewSwitchFrequency),
      12,
    );
    const perspectiveChangeScore = normalize(
      safeFeature(features.perspectiveChangeCount),
      10,
    );
    const accuracyScore = 1 - errorRate;
    const weightedScore =
      0.35 * viewSwitchScore +
      0.25 * perspectiveChangeScore +
      0.4 * accuracyScore;
    const delta = (weightedScore * 2 - 1) * LEARNING_RATE;

    applyAbilityUpdate(
      'perspectiveTaking',
      'PerspectiveTaking = 0.35·norm(viewSwitchFrequency) + 0.25·norm(perspectiveChangeCount) + 0.4·(1-errorRate)',
      delta,
      [
        {
          feature: 'viewSwitchFrequency',
          weight: 0.35,
          rawValue: safeFeature(features.viewSwitchFrequency),
          contribution: 0.35 * viewSwitchScore,
        },
        {
          feature: 'perspectiveChangeCount',
          weight: 0.25,
          rawValue: safeFeature(features.perspectiveChangeCount),
          contribution: 0.25 * perspectiveChangeScore,
        },
        {
          feature: 'errorRate',
          weight: 0.4,
          rawValue: errorRate,
          contribution: 0.4 * accuracyScore,
        },
      ],
    );
  }

  // -------------------------------------------------------------------------
  // 5. Working Memory
  // -------------------------------------------------------------------------
  {
    const independentScore = 1 - hintDependencyRate;
    const idleControlScore =
      1 - normalize(safeFeature(features.idleTime), 60);
    const sequenceScore = clamp01(
      safeFeature(features.sequenceConsistency),
    );
    const weightedScore =
      0.45 * independentScore +
      0.25 * idleControlScore +
      0.3 * sequenceScore;
    const delta = (weightedScore * 2 - 1) * LEARNING_RATE;

    applyAbilityUpdate(
      'workingMemory',
      'WorkingMemory = 0.45·(1-hintDependencyRate) + 0.25·(1-norm(idleTime)) + 0.3·sequenceConsistency',
      delta,
      [
        {
          feature: 'hintDependencyRate',
          weight: 0.45,
          rawValue: hintDependencyRate,
          contribution: 0.45 * independentScore,
        },
        {
          feature: 'idleTime',
          weight: 0.25,
          rawValue: safeFeature(features.idleTime),
          contribution: 0.25 * idleControlScore,
        },
        {
          feature: 'sequenceConsistency',
          weight: 0.3,
          rawValue: sequenceScore,
          contribution: 0.3 * sequenceScore,
        },
      ],
    );
  }

  // -------------------------------------------------------------------------
  // 6. Persistence
  // -------------------------------------------------------------------------
  {
    const featurePersistence = clamp01(
      safeFeature(features.persistenceScore),
    );
    const idleControlScore =
      1 - normalize(safeFeature(features.idleTime), 60);
    const retryToleranceScore = 1 - retryRate * 0.5;
    const weightedScore =
      0.5 * featurePersistence +
      0.3 * idleControlScore +
      0.2 * retryToleranceScore;
    const delta = (weightedScore * 2 - 1) * LEARNING_RATE;

    applyAbilityUpdate(
      'persistence',
      'Persistence = 0.5·persistenceScore + 0.3·(1-norm(idleTime)) + 0.2·(1-0.5·retryRate)',
      delta,
      [
        {
          feature: 'persistenceScore',
          weight: 0.5,
          rawValue: featurePersistence,
          contribution: 0.5 * featurePersistence,
        },
        {
          feature: 'idleTime',
          weight: 0.3,
          rawValue: safeFeature(features.idleTime),
          contribution: 0.3 * idleControlScore,
        },
        {
          feature: 'retryRate',
          weight: 0.2,
          rawValue: retryRate,
          contribution: 0.2 * retryToleranceScore,
        },
      ],
    );
  }

  // -------------------------------------------------------------------------
  // 7. Hint dependency
  // -------------------------------------------------------------------------
  {
    const before = next.hintDependency;
    const target = clamp(
      hintDependencyRate * 70 +
        normalize(safeFeature(features.hintRequestCount), 8) * 30,
    );
    const after = smooth(before, target);

    next.hintDependency = after;
    evidenceTrail.push({
      ability: 'hintDependency',
      formula:
        'HintDependency = smooth(0.7·hintDependencyRate + 0.3·norm(hintRequestCount))',
      contributions: [
        {
          feature: 'hintDependencyRate',
          weight: 0.7,
          rawValue: hintDependencyRate,
          contribution: hintDependencyRate * 70,
        },
        {
          feature: 'hintRequestCount',
          weight: 0.3,
          rawValue: safeFeature(features.hintRequestCount),
          contribution:
            normalize(safeFeature(features.hintRequestCount), 8) * 30,
        },
      ],
      delta: after - before,
      before,
      after,
    });
  }

  // -------------------------------------------------------------------------
  // 8. Extended learning profile
  // -------------------------------------------------------------------------
  next.exploration = smooth(
    previous.exploration,
    clamp01(safeFeature(features.explorationScore)) * 100,
  );

  next.efficiency = smooth(
    previous.efficiency,
    clamp01(safeFeature(features.efficiencyScore)) * 100,
  );

  next.helpSeeking = smooth(
    previous.helpSeeking,
    clamp01(safeFeature(features.helpSeekingScore)) * 100,
  );

  const reflectionTarget = clamp(
    45 * clamp01(safeFeature(features.sequenceConsistency)) +
      30 * (1 - retryRate) +
      25 * (1 - normalize(safeFeature(features.averageResponseTime), 30)),
  );
  next.reflection = smooth(previous.reflection, reflectionTarget);

  const impulsivenessTarget = clamp(
    45 * normalize(safeFeature(features.constructionSpeed), 20) +
      35 * retryRate +
      20 * errorRate,
  );
  next.impulsiveness = smooth(previous.impulsiveness, impulsivenessTarget);

  next.cognitiveLoad = smooth(
    previous.cognitiveLoad,
    clamp01(safeFeature(features.cognitiveLoadEstimate)) * 100,
  );

  const engagementTarget = clamp(
    35 * clamp01(safeFeature(features.completionRate)) +
      30 * clamp01(safeFeature(features.persistenceScore)) +
      20 * clamp01(safeFeature(features.explorationScore)) +
      15 * (1 - normalize(safeFeature(features.idleTime), 60)),
  );
  next.engagement = smooth(previous.engagement, engagementTarget);

  const selfRegulationTarget = clamp(
    0.25 * next.planning +
      0.2 * next.persistence +
      0.2 * next.reflection +
      0.15 * next.efficiency +
      0.1 * (100 - next.hintDependency) +
      0.1 * (100 - next.impulsiveness),
  );
  next.selfRegulation = smooth(
    previous.selfRegulation,
    selfRegulationTarget,
  );

  const evidenceConfidence = clamp(20 + Math.max(0, sessionEventCount) * 1.2);
  const behavioralConfidence = clamp01(
    safeFeature(features.confidenceScore),
  ) * 100;
  next.confidence = smooth(
    previous.confidence,
    0.55 * evidenceConfidence + 0.45 * behavioralConfidence,
    0.4,
  );

  const motivationTarget = clamp(
    0.4 * next.engagement +
      0.25 * next.persistence +
      0.2 * next.confidence +
      0.15 * (100 - next.cognitiveLoad),
  );
  next.motivation = smooth(previous.motivation, motivationTarget);

  // -------------------------------------------------------------------------
  // 9. Knowledge-tracing-compatible summary fields
  // -------------------------------------------------------------------------
  const masteryVector = [
    next.mentalRotation,
    next.spatialVisualization,
    next.perspectiveTaking,
    next.planning,
    next.workingMemory,
    next.persistence,
  ].map(value => clamp(value));

  next.knowledgeMastery = masteryVector;

  const previousMastery = clamp(previous.masteryLevel);
  next.masteryLevel = clamp(average(masteryVector));

  next.predictedSuccessRate = clamp(
    0.55 * next.masteryLevel +
      0.15 * next.confidence +
      0.1 * next.efficiency +
      0.1 * next.selfRegulation +
      0.1 * (100 - next.cognitiveLoad),
  );

  next.learningTrend = determineLearningTrend(
    previousMastery,
    next.masteryLevel,
  );

  return {
    model: next,
    evidenceTrail,
  };
}