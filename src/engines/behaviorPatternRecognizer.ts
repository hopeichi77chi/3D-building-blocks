import {
  EventLog,
  BehaviorFeatures,
  BehaviorVector,
} from '../types';

// ============================================================================
// Behavior Vector Engine
// Explainable AI-based Adaptive Spatial Reasoning Intelligent Tutoring System
//
// Learning Analytics Pipeline：
//
// Event Logs
//   ↓
// Behavior Feature Extraction
//   ↓
// Behavior Vector Recognition
//   ↓
// Cognitive Diagnosis
//   ↓
// Player Model Update
//
// 舊版：
//   將學習者分類為固定模式，例如：
//   - REPEATED_ROTATION
//   - RAPID_TRIAL_ERROR
//   - HINT_OVERRELIANCE
//
// 新版：
//   不再強制將學習者歸類為單一標籤，而是輸出連續型行為向量：
//   - exploration
//   - planning
//   - persistence
//   - confidence
//   - impulsiveness
//   - efficiency
//   - helpSeeking
//   - reflection
//
// 所有向量值皆為 0～1。
// ============================================================================

const RECENT_WINDOW = 20;

/**
 * 行為向量各構面使用的權重。
 *
 * 每一個構面的權重加總原則上應為 1。
 * 可於正式研究前依據專家效度、前導實驗或統計分析調整。
 */
const VECTOR_WEIGHTS = {
  exploration: {
    featureScore: 0.45,
    perspectiveDiversity: 0.25,
    targetChecking: 0.15,
    sequenceEvidence: 0.15,
  },

  planning: {
    featureScore: 0.4,
    orderScore: 0.2,
    sequenceConsistency: 0.2,
    preActionObservation: 0.2,
  },

  persistence: {
    featureScore: 0.45,
    recoveryBehavior: 0.25,
    continuationAfterError: 0.2,
    completionRate: 0.1,
  },

  confidence: {
    featureScore: 0.4,
    successRate: 0.25,
    independentPerformance: 0.2,
    stableInteraction: 0.15,
  },

  impulsiveness: {
    rapidAction: 0.3,
    trialAndError: 0.25,
    insufficientObservation: 0.2,
    lowPlanning: 0.15,
    errorPressure: 0.1,
  },

  efficiency: {
    featureScore: 0.5,
    successRate: 0.2,
    completionRate: 0.15,
    correctionEfficiency: 0.15,
  },

  helpSeeking: {
    featureScore: 0.45,
    errorResponsiveHelp: 0.25,
    hintReadingEngagement: 0.2,
    appropriateFrequency: 0.1,
  },

  reflection: {
    reflectionAnswerEvidence: 0.35,
    targetRechecking: 0.2,
    hintReadingEvidence: 0.15,
    correctionAfterObservation: 0.2,
    lowImpulsiveness: 0.1,
  },
} as const;

/**
 * 將數值限制在指定範圍。
 */
function clamp(value: number, min = 0, max = 1): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

/**
 * 安全除法，避免 denominator 為 0。
 */
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

/**
 * 將數值依參考最大值正規化至 0～1。
 */
function normalize(value: number, referenceMaximum: number): number {
  if (referenceMaximum <= 0) {
    return 0;
  }

  return clamp(value / referenceMaximum);
}

/**
 * 判斷 payload 是否為一般物件。
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * 從事件 payload 讀取布林值。
 */
function readPayloadBoolean(
  log: EventLog,
  keys: string[],
): boolean | undefined {
  if (!isRecord(log.payload)) {
    return undefined;
  }

  for (const key of keys) {
    const value = log.payload[key];

    if (typeof value === 'boolean') {
      return value;
    }
  }

  return undefined;
}

/**
 * 從事件 payload 讀取數值。
 */
function readPayloadNumber(
  log: EventLog,
  keys: string[],
  fallback = 0,
): number {
  if (!isRecord(log.payload)) {
    return fallback;
  }

  for (const key of keys) {
    const value = log.payload[key];

    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }

  return fallback;
}

/**
 * 依 timestamp 由舊到新排序。
 *
 * 不假設輸入陣列一定為新到舊或舊到新，
 * 因此即使 App.tsx 改變事件儲存順序也不會影響結果。
 */
function sortChronologically(logs: EventLog[]): EventLog[] {
  return [...logs].sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * 取得目前 Session 的事件。
 *
 * 先由舊到新排序，再找出最後一筆 SESSION_START，
 * 僅保留該 Session 的事件。
 */
function getCurrentSessionLogs(logs: EventLog[]): EventLog[] {
  if (logs.length === 0) {
    return [];
  }

  const chronologicalLogs = sortChronologically(logs);

  let latestSessionStartIndex = -1;

  for (
    let index = chronologicalLogs.length - 1;
    index >= 0;
    index--
  ) {
    if (chronologicalLogs[index].type === 'SESSION_START') {
      latestSessionStartIndex = index;
      break;
    }
  }

  if (latestSessionStartIndex === -1) {
    return chronologicalLogs;
  }

  return chronologicalLogs.slice(latestSessionStartIndex);
}

/**
 * 只取得近期事件視窗。
 *
 * 事件已經由舊到新排序，因此取最後 N 筆。
 */
function getRecentLogs(logs: EventLog[]): EventLog[] {
  if (logs.length <= RECENT_WINDOW) {
    return logs;
  }

  return logs.slice(logs.length - RECENT_WINDOW);
}

/**
 * 判斷是否為錯誤事件。
 */
function isErrorEvent(log: EventLog): boolean {
  if (log.type === 'ERROR' || log.type === 'PLACE_FAIL') {
    return true;
  }

  if (log.type === 'PLACE_BLOCK' || log.type === 'SUBMIT') {
    const success = readPayloadBoolean(log, [
      'success',
      'isSuccess',
    ]);

    const correct = readPayloadBoolean(log, [
      'correct',
      'isCorrect',
    ]);

    return success === false || correct === false;
  }

  return false;
}

/**
 * 判斷是否為成功事件。
 */
function isSuccessEvent(log: EventLog): boolean {
  if (log.type === 'PLACE_SUCCESS') {
    return true;
  }

  if (log.type === 'PLACE_BLOCK' || log.type === 'SUBMIT') {
    const success = readPayloadBoolean(log, [
      'success',
      'isSuccess',
    ]);

    const correct = readPayloadBoolean(log, [
      'correct',
      'isCorrect',
    ]);

    return success === true || correct === true;
  }

  return false;
}

/**
 * 判斷是否為建構操作。
 */
function isConstructionEvent(log: EventLog): boolean {
  return (
    log.type === 'SELECT_BLOCK' ||
    log.type === 'PLACE_BLOCK' ||
    log.type === 'PLACE_SUCCESS' ||
    log.type === 'PLACE_FAIL' ||
    log.type === 'MOVE_BLOCK' ||
    log.type === 'ROTATE_BLOCK' ||
    log.type === 'REMOVE_BLOCK' ||
    log.type === 'UNDO' ||
    log.type === 'REDO' ||
    log.type === 'RESET'
  );
}

/**
 * 判斷是否為觀察行為。
 */
function isObservationEvent(log: EventLog): boolean {
  return (
    log.type === 'ROTATE_CAMERA' ||
    log.type === 'ZOOM_CAMERA' ||
    log.type === 'MOVE_CAMERA' ||
    log.type === 'VIEW_TARGET'
  );
}

/**
 * 判斷是否為提示相關行為。
 */
function isHintEvent(log: EventLog): boolean {
  return (
    log.type === 'HINT_REQUEST' ||
    log.type === 'HINT_READ'
  );
}

/**
 * 計算觀察行為多樣性。
 *
 * 學習者是否同時使用：
 * - 攝影機旋轉
 * - 縮放
 * - 移動
 * - 查看目標
 *
 * 若四種皆使用，分數為 1。
 */
function calculatePerspectiveDiversity(logs: EventLog[]): number {
  const usedTypes = new Set<string>();

  for (const log of logs) {
    if (log.type === 'ROTATE_CAMERA') {
      usedTypes.add('ROTATE');
    }

    if (log.type === 'ZOOM_CAMERA') {
      usedTypes.add('ZOOM');
    }

    if (log.type === 'MOVE_CAMERA') {
      usedTypes.add('MOVE');
    }

    if (log.type === 'VIEW_TARGET') {
      usedTypes.add('TARGET');
    }
  }

  return clamp(usedTypes.size / 4);
}

/**
 * 計算近期事件中的探索證據。
 *
 * 高分表示近期操作中具有適度的觀察與視角變換。
 * 為避免「大量無目的旋轉」得到過高分數，
 * 當旋轉過度且錯誤率高時會受到扣分。
 */
function calculateExplorationSequenceEvidence(
  recentLogs: EventLog[],
  features: BehaviorFeatures,
): number {
  if (recentLogs.length === 0) {
    return 0;
  }

  const observationCount =
    recentLogs.filter(isObservationEvent).length;

  const observationRatio = clamp(
    safeDivide(observationCount, recentLogs.length),
  );

  const excessiveRotationPenalty =
    features.rotationFrequency > 20 &&
    features.errorRate > 0.4
      ? normalize(features.rotationFrequency - 20, 20) * 0.4
      : 0;

  return clamp(
    observationRatio * 1.5 - excessiveRotationPenalty,
  );
}

/**
 * 計算開始建構前是否先進行觀察。
 *
 * 若第一次建構操作前有查看目標或切換視角，
 * 代表具有先觀察、後行動的規劃傾向。
 */
function calculatePreActionObservationScore(
  logs: EventLog[],
): number {
  const firstConstructionIndex =
    logs.findIndex(isConstructionEvent);

  if (firstConstructionIndex === -1) {
    return 0.5;
  }

  if (firstConstructionIndex === 0) {
    return 0;
  }

  const eventsBeforeConstruction =
    logs.slice(0, firstConstructionIndex);

  const observationCount =
    eventsBeforeConstruction.filter(isObservationEvent).length;

  const targetViewCount =
    eventsBeforeConstruction.filter(
      log => log.type === 'VIEW_TARGET',
    ).length;

  return clamp(
    normalize(observationCount, 4) * 0.65 +
      normalize(targetViewCount, 2) * 0.35,
  );
}

/**
 * 計算錯誤後的恢復行為。
 *
 * 錯誤後若出現：
 * - 重新觀察
 * - 移除積木
 * - Undo
 * - 重新放置
 *
 * 代表學習者有進行策略修正。
 */
function calculateRecoveryBehaviorScore(
  logs: EventLog[],
): number {
  const errorIndices: number[] = [];

  logs.forEach((log, index) => {
    if (isErrorEvent(log)) {
      errorIndices.push(index);
    }
  });

  if (errorIndices.length === 0) {
    return 0.75;
  }

  let recoveryCount = 0;

  for (const errorIndex of errorIndices) {
    const recoveryWindow = logs.slice(
      errorIndex + 1,
      errorIndex + 6,
    );

    const recovered = recoveryWindow.some(log =>
      isObservationEvent(log) ||
      log.type === 'REMOVE_BLOCK' ||
      log.type === 'UNDO' ||
      log.type === 'REDO' ||
      log.type === 'PLACE_BLOCK' ||
      log.type === 'PLACE_SUCCESS',
    );

    if (recovered) {
      recoveryCount++;
    }
  }

  return clamp(
    safeDivide(recoveryCount, errorIndices.length),
  );
}

/**
 * 計算錯誤後是否仍持續投入。
 */
function calculateContinuationAfterErrorScore(
  logs: EventLog[],
): number {
  const lastErrorIndex = (() => {
    for (let index = logs.length - 1; index >= 0; index--) {
      if (isErrorEvent(logs[index])) {
        return index;
      }
    }

    return -1;
  })();

  if (lastErrorIndex === -1) {
    return 0.75;
  }

  const eventsAfterError = logs.slice(lastErrorIndex + 1);

  if (eventsAfterError.length === 0) {
    return 0;
  }

  const constructiveActions =
    eventsAfterError.filter(log =>
      isConstructionEvent(log) ||
      isObservationEvent(log) ||
      isHintEvent(log),
    ).length;

  const logoutImmediately =
    eventsAfterError.length <= 2 &&
    eventsAfterError.some(log => log.type === 'LOGOUT');

  const resetImmediately =
    eventsAfterError.length <= 2 &&
    eventsAfterError.some(log => log.type === 'RESET');

  const abandonmentPenalty =
    logoutImmediately || resetImmediately ? 0.5 : 0;

  return clamp(
    normalize(constructiveActions, 5) -
      abandonmentPenalty,
  );
}

/**
 * 計算提示是否主要出現在錯誤之後。
 *
 * 若提示請求是在發生困難後出現，
 * 通常比一開始立即索取提示更接近適當求助。
 */
function calculateErrorResponsiveHelpScore(
  logs: EventLog[],
): number {
  const hintIndices: number[] = [];

  logs.forEach((log, index) => {
    if (log.type === 'HINT_REQUEST') {
      hintIndices.push(index);
    }
  });

  if (hintIndices.length === 0) {
    return 0;
  }

  let responsiveHintCount = 0;

  for (const hintIndex of hintIndices) {
    const precedingWindow = logs.slice(
      Math.max(0, hintIndex - 5),
      hintIndex,
    );

    const difficultyObserved =
      precedingWindow.some(isErrorEvent) ||
      precedingWindow.some(
        log =>
          log.type === 'REMOVE_BLOCK' ||
          log.type === 'UNDO' ||
          log.type === 'REDO',
      );

    if (difficultyObserved) {
      responsiveHintCount++;
    }
  }

  return clamp(
    safeDivide(responsiveHintCount, hintIndices.length),
  );
}

/**
 * 計算提示閱讀投入程度。
 *
 * 每次提示平均閱讀約 8 秒以上可視為有閱讀，
 * 超過 20 秒不再額外增加分數。
 */
function calculateHintReadingEngagement(
  features: BehaviorFeatures,
): number {
  if (features.hintRequestCount === 0) {
    return 0;
  }

  const averageReadingTime = safeDivide(
    features.hintReadingTime,
    features.hintRequestCount,
  );

  return clamp(averageReadingTime / 12);
}

/**
 * 計算求助頻率是否適當。
 *
 * 過低：
 * 發生大量錯誤仍完全不求助。
 *
 * 過高：
 * 每少量操作就立即要求提示。
 *
 * 中間區間分數較高。
 */
function calculateAppropriateHelpFrequency(
  features: BehaviorFeatures,
): number {
  const hintRate = features.hintDependencyRate;

  if (
    features.totalErrors >= 3 &&
    features.hintRequestCount === 0
  ) {
    return 0.2;
  }

  if (hintRate <= 0.02) {
    return features.totalErrors === 0 ? 0.65 : 0.35;
  }

  if (hintRate <= 0.12) {
    return 1;
  }

  if (hintRate <= 0.2) {
    return 0.7;
  }

  return clamp(1 - (hintRate - 0.2) * 3);
}

/**
 * 計算快速操作傾向。
 *
 * constructionSpeed 的定義是：
 * 每放置一個積木所需秒數。
 *
 * 數值越低表示操作越快。
 */
function calculateRapidActionScore(
  features: BehaviorFeatures,
): number {
  if (features.blockPlacementCount === 0) {
    return 0;
  }

  if (features.constructionSpeed <= 1) {
    return 1;
  }

  if (features.constructionSpeed <= 2) {
    return 0.85;
  }

  if (features.constructionSpeed <= 4) {
    return 0.6;
  }

  if (features.constructionSpeed <= 7) {
    return 0.35;
  }

  return 0.1;
}

/**
 * 計算視角確認不足。
 *
 * 錯誤率高、操作多，但很少查看目標或旋轉視角，
 * 可能代表學習者過早採取行動。
 */
function calculateInsufficientObservationScore(
  logs: EventLog[],
  features: BehaviorFeatures,
): number {
  const observationCount =
    logs.filter(isObservationEvent).length;

  const constructionCount =
    logs.filter(isConstructionEvent).length;

  if (constructionCount === 0) {
    return 0;
  }

  const observationPerConstruction =
    safeDivide(observationCount, constructionCount);

  const lowObservation =
    clamp(1 - observationPerConstruction * 2);

  return clamp(
    lowObservation * 0.55 +
      features.errorRate * 0.3 +
      features.retryRate * 0.15,
  );
}

/**
 * 計算互動穩定度。
 *
 * 使用事件時間間隔的變異程度，
 * 間隔越穩定，分數越高。
 */
function calculateInteractionStability(
  logs: EventLog[],
): number {
  if (logs.length < 3) {
    return 0.5;
  }

  const gaps: number[] = [];

  for (let index = 1; index < logs.length; index++) {
    const gapSeconds = Math.max(
      0,
      (logs[index].timestamp -
        logs[index - 1].timestamp) /
        1000,
    );

    /*
     * 將單次間隔限制在 60 秒，
     * 避免使用者切換分頁造成極端離群值。
     */
    gaps.push(Math.min(gapSeconds, 60));
  }

  const mean = safeDivide(
    gaps.reduce((sum, gap) => sum + gap, 0),
    gaps.length,
  );

  if (mean === 0) {
    return 0.5;
  }

  const variance = safeDivide(
    gaps.reduce(
      (sum, gap) => sum + Math.pow(gap - mean, 2),
      0,
    ),
    gaps.length,
  );

  const standardDeviation = Math.sqrt(variance);
  const coefficientOfVariation =
    safeDivide(standardDeviation, mean);

  return clamp(1 - coefficientOfVariation / 2);
}

/**
 * 計算錯誤修正效率。
 *
 * 若修正操作很多但成功率仍低，效率較差；
 * 若少量修正即可恢復成功，效率較高。
 */
function calculateCorrectionEfficiency(
  features: BehaviorFeatures,
): number {
  const correctionCount =
    features.blockRemovalCount +
    features.blockReplacementCount +
    features.undoCount +
    features.redoCount;

  if (correctionCount === 0) {
    return features.errorRate === 0
      ? 1
      : 0.35;
  }

  const correctionsPerSuccess = safeDivide(
    correctionCount,
    Math.max(
      features.successRate *
        Math.max(features.blockPlacementCount, 1),
      1,
    ),
  );

  return clamp(
    1 - correctionsPerSuccess / 3,
  );
}

/**
 * 計算獨立作業表現。
 *
 * 成功率高且提示依賴低時，分數較高。
 */
function calculateIndependentPerformance(
  features: BehaviorFeatures,
): number {
  const hintIndependence =
    clamp(1 - features.hintDependencyRate * 4);

  return clamp(
    features.successRate * 0.55 +
      hintIndependence * 0.45,
  );
}

/**
 * 計算目標重新確認程度。
 *
 * 查看目標圖片不是越多越好。
 * 1～4 次通常可視為合理確認；
 * 過度查看可能代表困惑。
 */
function calculateTargetRecheckingScore(
  logs: EventLog[],
): number {
  const targetViewCount =
    logs.filter(log => log.type === 'VIEW_TARGET').length;

  if (targetViewCount === 0) {
    return 0;
  }

  if (targetViewCount <= 4) {
    return clamp(targetViewCount / 3);
  }

  return clamp(1 - (targetViewCount - 4) * 0.1);
}

/**
 * 計算觀察後修正的反思行為。
 *
 * 典型序列：
 * ERROR → VIEW/ROTATE → REMOVE/UNDO → PLACE
 */
function calculateCorrectionAfterObservationScore(
  logs: EventLog[],
): number {
  let correctionOpportunityCount = 0;
  let reflectiveCorrectionCount = 0;

  for (let index = 0; index < logs.length; index++) {
    if (!isErrorEvent(logs[index])) {
      continue;
    }

    correctionOpportunityCount++;

    const subsequentWindow =
      logs.slice(index + 1, index + 8);

    const observationIndex =
      subsequentWindow.findIndex(isObservationEvent);

    if (observationIndex === -1) {
      continue;
    }

    const eventsAfterObservation =
      subsequentWindow.slice(observationIndex + 1);

    const hasCorrection =
      eventsAfterObservation.some(
        log =>
          log.type === 'REMOVE_BLOCK' ||
          log.type === 'UNDO' ||
          log.type === 'REDO' ||
          log.type === 'MOVE_BLOCK' ||
          log.type === 'PLACE_BLOCK' ||
          log.type === 'PLACE_SUCCESS',
      );

    if (hasCorrection) {
      reflectiveCorrectionCount++;
    }
  }

  if (correctionOpportunityCount === 0) {
    return 0.6;
  }

  return clamp(
    safeDivide(
      reflectiveCorrectionCount,
      correctionOpportunityCount,
    ),
  );
}

/**
 * 計算 REFLECTION_ANSWER 的有效程度。
 *
 * 若 payload 有 answerLength、wordCount 或 confidence，
 * 則進一步估算回答投入程度。
 */
function calculateReflectionAnswerEvidence(
  logs: EventLog[],
): number {
  const reflectionLogs = logs.filter(
    log => log.type === 'REFLECTION_ANSWER',
  );

  if (reflectionLogs.length === 0) {
    return 0;
  }

  const scores = reflectionLogs.map(log => {
    const answerLength = readPayloadNumber(
      log,
      ['answerLength', 'characterCount', 'length'],
      0,
    );

    const wordCount = readPayloadNumber(
      log,
      ['wordCount'],
      0,
    );

    const confidence = readPayloadNumber(
      log,
      ['confidence'],
      -1,
    );

    const contentScore =
      answerLength > 0
        ? normalize(answerLength, 40)
        : wordCount > 0
          ? normalize(wordCount, 15)
          : 0.65;

    const confidenceScore =
      confidence >= 0
        ? clamp(
            confidence > 1
              ? confidence / 100
              : confidence,
          )
        : 0.5;

    return clamp(
      contentScore * 0.75 +
        confidenceScore * 0.25,
    );
  });

  return safeDivide(
    scores.reduce((sum, score) => sum + score, 0),
    scores.length,
  );
}

/**
 * 計算探索向量。
 */
function calculateExplorationVector(
  logs: EventLog[],
  recentLogs: EventLog[],
  features: BehaviorFeatures,
): number {
  const perspectiveDiversity =
    calculatePerspectiveDiversity(logs);

  const targetChecking =
    normalize(
      logs.filter(log => log.type === 'VIEW_TARGET').length,
      4,
    );

  const sequenceEvidence =
    calculateExplorationSequenceEvidence(
      recentLogs,
      features,
    );

  const weights = VECTOR_WEIGHTS.exploration;

  return clamp(
    features.explorationScore * weights.featureScore +
      perspectiveDiversity *
        weights.perspectiveDiversity +
      targetChecking * weights.targetChecking +
      sequenceEvidence * weights.sequenceEvidence,
  );
}

/**
 * 計算規劃向量。
 */
function calculatePlanningVector(
  logs: EventLog[],
  features: BehaviorFeatures,
): number {
  const preActionObservation =
    calculatePreActionObservationScore(logs);

  const weights = VECTOR_WEIGHTS.planning;

  return clamp(
    features.planningScore * weights.featureScore +
      features.constructionOrderScore *
        weights.orderScore +
      features.sequenceConsistency *
        weights.sequenceConsistency +
      preActionObservation *
        weights.preActionObservation,
  );
}

/**
 * 計算堅持向量。
 */
function calculatePersistenceVector(
  logs: EventLog[],
  features: BehaviorFeatures,
): number {
  const recoveryBehavior =
    calculateRecoveryBehaviorScore(logs);

  const continuationAfterError =
    calculateContinuationAfterErrorScore(logs);

  const weights = VECTOR_WEIGHTS.persistence;

  return clamp(
    features.persistenceScore *
      weights.featureScore +
      recoveryBehavior *
        weights.recoveryBehavior +
      continuationAfterError *
        weights.continuationAfterError +
      features.completionRate *
        weights.completionRate,
  );
}

/**
 * 計算自信向量。
 */
function calculateConfidenceVector(
  logs: EventLog[],
  features: BehaviorFeatures,
): number {
  const independentPerformance =
    calculateIndependentPerformance(features);

  const interactionStability =
    calculateInteractionStability(logs);

  const weights = VECTOR_WEIGHTS.confidence;

  return clamp(
    features.confidenceScore *
      weights.featureScore +
      features.successRate *
        weights.successRate +
      independentPerformance *
        weights.independentPerformance +
      interactionStability *
        weights.stableInteraction,
  );
}

/**
 * 計算衝動性向量。
 */
function calculateImpulsivenessVector(
  logs: EventLog[],
  features: BehaviorFeatures,
): number {
  const rapidAction =
    calculateRapidActionScore(features);

  const trialAndError =
    clamp(
      features.retryRate * 0.6 +
        features.errorRate * 0.4,
    );

  const insufficientObservation =
    calculateInsufficientObservationScore(
      logs,
      features,
    );

  const lowPlanning =
    clamp(1 - features.planningScore);

  const errorPressure =
    clamp(
      features.errorRate * 0.65 +
        features.cognitiveLoadEstimate * 0.35,
    );

  const weights = VECTOR_WEIGHTS.impulsiveness;

  return clamp(
    rapidAction * weights.rapidAction +
      trialAndError * weights.trialAndError +
      insufficientObservation *
        weights.insufficientObservation +
      lowPlanning * weights.lowPlanning +
      errorPressure * weights.errorPressure,
  );
}

/**
 * 計算效率向量。
 */
function calculateEfficiencyVector(
  features: BehaviorFeatures,
): number {
  const correctionEfficiency =
    calculateCorrectionEfficiency(features);

  const weights = VECTOR_WEIGHTS.efficiency;

  return clamp(
    features.efficiencyScore *
      weights.featureScore +
      features.successRate *
        weights.successRate +
      features.completionRate *
        weights.completionRate +
      correctionEfficiency *
        weights.correctionEfficiency,
  );
}

/**
 * 計算求助行為向量。
 *
 * 注意：
 * helpSeeking 高不代表提示依賴高。
 *
 * 此構面衡量的是：
 * - 是否在真正遇到困難後求助
 * - 是否閱讀提示
 * - 使用提示頻率是否合理
 */
function calculateHelpSeekingVector(
  logs: EventLog[],
  features: BehaviorFeatures,
): number {
  const errorResponsiveHelp =
    calculateErrorResponsiveHelpScore(logs);

  const hintReadingEngagement =
    calculateHintReadingEngagement(features);

  const appropriateFrequency =
    calculateAppropriateHelpFrequency(features);

  const weights = VECTOR_WEIGHTS.helpSeeking;

  return clamp(
    features.helpSeekingScore *
      weights.featureScore +
      errorResponsiveHelp *
        weights.errorResponsiveHelp +
      hintReadingEngagement *
        weights.hintReadingEngagement +
      appropriateFrequency *
        weights.appropriateFrequency,
  );
}

/**
 * 計算反思向量。
 */
function calculateReflectionVector(
  logs: EventLog[],
  features: BehaviorFeatures,
  impulsiveness: number,
): number {
  const reflectionAnswerEvidence =
    calculateReflectionAnswerEvidence(logs);

  const targetRechecking =
    calculateTargetRecheckingScore(logs);

  const hintReadingEvidence =
    calculateHintReadingEngagement(features);

  const correctionAfterObservation =
    calculateCorrectionAfterObservationScore(logs);

  const lowImpulsiveness =
    clamp(1 - impulsiveness);

  const weights = VECTOR_WEIGHTS.reflection;

  return clamp(
    reflectionAnswerEvidence *
      weights.reflectionAnswerEvidence +
      targetRechecking *
        weights.targetRechecking +
      hintReadingEvidence *
        weights.hintReadingEvidence +
      correctionAfterObservation *
        weights.correctionAfterObservation +
      lowImpulsiveness *
        weights.lowImpulsiveness,
  );
}

/**
 * 建立中性行為向量。
 *
 * 沒有足夠事件資料時不應全部回傳 0，
 * 因為 0 容易被誤判為能力極差。
 *
 * 以 0.5 表示「目前證據不足／中性狀態」。
 * helpSeeking 則在未觀察到行為時設為 0。
 */
function createNeutralBehaviorVector(): BehaviorVector {
  return {
    exploration: 0.5,
    planning: 0.5,
    persistence: 0.5,
    confidence: 0.5,
    impulsiveness: 0.5,
    efficiency: 0.5,
    helpSeeking: 0,
    reflection: 0.5,
  };
}

/**
 * 將所有向量值四捨五入至小數點後四位。
 *
 * 可避免 UI 顯示過長的小數，
 * 同時保留足夠研究分析精度。
 */
function roundBehaviorVector(
  vector: BehaviorVector,
): BehaviorVector {
  const round = (value: number): number =>
    Number(clamp(value).toFixed(4));

  return {
    exploration: round(vector.exploration),
    planning: round(vector.planning),
    persistence: round(vector.persistence),
    confidence: round(vector.confidence),
    impulsiveness: round(vector.impulsiveness),
    efficiency: round(vector.efficiency),
    helpSeeking: round(vector.helpSeeking),
    reflection: round(vector.reflection),
  };
}

/**
 * 主要函式：事件紀錄與行為特徵 → Behavior Vector。
 *
 * @param logs 所有事件紀錄，可為新到舊或舊到新排序。
 * @param features behaviorFeatureExtractor.ts 產生的行為特徵。
 */
export function recognizeBehaviorVector(
  logs: EventLog[],
  features: BehaviorFeatures,
): BehaviorVector {
  const sessionLogs = getCurrentSessionLogs(logs);

  /*
   * 僅有 SESSION_START，尚無實際行為證據。
   */
  const meaningfulLogs = sessionLogs.filter(
    log =>
      log.type !== 'SESSION_START' &&
      log.type !== 'LOGOUT',
  );

  if (meaningfulLogs.length === 0) {
    return createNeutralBehaviorVector();
  }

  const recentLogs = getRecentLogs(meaningfulLogs);

  const exploration =
    calculateExplorationVector(
      meaningfulLogs,
      recentLogs,
      features,
    );

  const planning =
    calculatePlanningVector(
      meaningfulLogs,
      features,
    );

  const persistence =
    calculatePersistenceVector(
      meaningfulLogs,
      features,
    );

  const confidence =
    calculateConfidenceVector(
      meaningfulLogs,
      features,
    );

  const impulsiveness =
    calculateImpulsivenessVector(
      meaningfulLogs,
      features,
    );

  const efficiency =
    calculateEfficiencyVector(features);

  const helpSeeking =
    calculateHelpSeekingVector(
      meaningfulLogs,
      features,
    );

  /*
   * reflection 會使用 impulsiveness，
   * 因此必須在 impulsiveness 計算後執行。
   */
  const reflection =
    calculateReflectionVector(
      meaningfulLogs,
      features,
      impulsiveness,
    );

  return roundBehaviorVector({
    exploration,
    planning,
    persistence,
    confidence,
    impulsiveness,
    efficiency,
    helpSeeking,
    reflection,
  });
}

/**
 * 向下相容函式。
 *
 * 舊版 App.tsx 可能仍呼叫：
 *
 * recognizePatterns(logs, features)
 *
 * 為避免整個專案立即出錯，暫時保留相同函式名稱，
 * 但現在回傳的是 BehaviorVector，不再是 BehaviorPattern[]。
 *
 * 建議後續將 App.tsx 正式改用 recognizeBehaviorVector。
 */
export function recognizePatterns(
  logs: EventLog[],
  features: BehaviorFeatures,
): BehaviorVector {
  return recognizeBehaviorVector(logs, features);
}