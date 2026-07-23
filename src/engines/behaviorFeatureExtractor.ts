import { EventLog, BehaviorFeatures, Position } from '../types';

// ============================================================================
// Learning Analytics Pipeline — 第 1 站：Event → Feature Extraction
// Explainable AI-based Adaptive Spatial Reasoning Intelligent Tutoring System
//
// 輸入：事件紀錄陣列
// 支援：
//   1. 新到舊排序：index 0 為最新事件
//   2. 舊到新排序：index 0 為最舊事件
//
// 輸出：BehaviorFeatures 行為特徵向量
//
// 注意：
// - 時間單位統一為秒。
// - 頻率統一為「每分鐘次數」。
// - Score、Rate、Estimate 原則上正規化至 0～1。
// - Count 類欄位保留原始次數。
// ============================================================================

const MILLISECONDS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;

/**
 * 若兩事件間隔超過此值，超出的時間視為明顯閒置。
 * 單位：秒。
 */
const IDLE_GAP_THRESHOLD_SECONDS = 5;

/**
 * 用於正規化行為頻率的參考上限。
 * 超過此數值仍會被限制在 1。
 */
const NORMALIZATION_REFERENCES = {
  planningTime: 30,
  idleRatio: 0.5,
  errorRate: 1,
  retryRate: 1,
  rotationPerMinute: 15,
  viewSwitchPerMinute: 20,
  placementPerMinute: 20,
  hintDependencyRate: 0.2,
  explorationActionsPerMinute: 20,
  attentionSwitchPerMinute: 20,
  dragDistance: 50,
  firstCorrectTime: 120,
} as const;

/**
 * 建立完全符合 BehaviorFeatures 的空白特徵。
 */
function createEmptyFeatures(): BehaviorFeatures {
  return {
    // 原始特徵
    planningTime: 0,
    idleTime: 0,
    errorRate: 0,
    retryRate: 0,
    rotationFrequency: 0,
    viewSwitchFrequency: 0,
    constructionSpeed: 0,
    hintDependencyRate: 0,
    constructionOrderScore: 0.5,

    // 擴充時間與表現特徵
    totalTime: 0,
    averageResponseTime: 0,
    firstCorrectTime: 0,
    totalErrors: 0,
    totalRetries: 0,
    successRate: 0,
    completionRate: 0,

    // 攝影機操作
    cameraRotationCount: 0,
    cameraZoomCount: 0,
    cameraMoveCount: 0,
    averageRotationAngle: 0,
    averageZoomDistance: 0,

    // 積木操作
    blockPlacementCount: 0,
    blockMoveCount: 0,
    blockRotationCount: 0,
    blockRemovalCount: 0,
    blockReplacementCount: 0,

    // 修正操作
    undoCount: 0,
    redoCount: 0,

    // 提示使用
    hintRequestCount: 0,
    hintReadingTime: 0,

    // 滑鼠與探索
    hoverTime: 0,
    dragDistance: 0,
    explorationDistance: 0,
    attentionSwitchCount: 0,
    perspectiveChangeCount: 0,

    // 高階行為分數
    sequenceConsistency: 0.5,
    planningScore: 0.5,
    explorationScore: 0.5,
    persistenceScore: 0.5,
    efficiencyScore: 0.5,
    confidenceScore: 0.5,
    helpSeekingScore: 0,
    cognitiveLoadEstimate: 0.5,
  };
}

/**
 * 將數值限制於指定範圍。
 */
function clamp(value: number, min = 0, max = 1): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/**
 * 安全取得數字。
 */
function toFiniteNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : fallback;
}

/**
 * 將時間差轉換為秒。
 */
function millisecondsToSeconds(milliseconds: number): number {
  return Math.max(0, milliseconds / MILLISECONDS_PER_SECOND);
}

/**
 * 安全除法，避免除以零。
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
 * 線性正規化至 0～1。
 */
function normalize(value: number, referenceMaximum: number): number {
  if (referenceMaximum <= 0) return 0;
  return clamp(value / referenceMaximum);
}

/**
 * 判斷 payload 是否為一般物件。
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * 從 payload 讀取數字欄位。
 */
function readPayloadNumber(
  log: EventLog,
  keys: string[],
  fallback = 0,
): number {
  if (!isRecord(log.payload)) return fallback;

  for (const key of keys) {
    const value = log.payload[key];

    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }

  return fallback;
}

/**
 * 從 payload 讀取布林欄位。
 */
function readPayloadBoolean(
  log: EventLog,
  keys: string[],
): boolean | undefined {
  if (!isRecord(log.payload)) return undefined;

  for (const key of keys) {
    const value = log.payload[key];

    if (typeof value === 'boolean') {
      return value;
    }
  }

  return undefined;
}

/**
 * 嘗試由 EventLog payload 取得座標。
 *
 * 支援：
 * payload.x / payload.y / payload.z
 * payload.position
 * payload.from
 * payload.to
 * payload.startPosition
 * payload.endPosition
 */
function readPositionFromValue(value: unknown): Position | null {
  if (!isRecord(value)) return null;

  const x = value.x;
  const y = value.y;
  const z = value.z;

  if (
    typeof x === 'number' &&
    Number.isFinite(x) &&
    typeof y === 'number' &&
    Number.isFinite(y) &&
    typeof z === 'number' &&
    Number.isFinite(z)
  ) {
    return { x, y, z };
  }

  return null;
}

function readPayloadPosition(
  log: EventLog,
  preferredKeys: string[] = [],
): Position | null {
  if (!isRecord(log.payload)) return null;

  for (const key of preferredKeys) {
    const nestedPosition = readPositionFromValue(log.payload[key]);

    if (nestedPosition) {
      return nestedPosition;
    }
  }

  return readPositionFromValue(log.payload);
}

/**
 * 計算三維座標間的歐氏距離。
 */
function calculateDistance(
  positionA: Position | null,
  positionB: Position | null,
): number {
  if (!positionA || !positionB) return 0;

  const dx = positionB.x - positionA.x;
  const dy = positionB.y - positionA.y;
  const dz = positionB.z - positionA.z;

  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * 依 timestamp 由舊到新排序。
 */
function sortChronologically(logs: EventLog[]): EventLog[] {
  return [...logs].sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * 取出目前關卡 Session。
 *
 * 實作方式：
 * 1. 先依 timestamp 由舊到新排序。
 * 2. 找出最後一筆 SESSION_START。
 * 3. 保留該 SESSION_START 至最新事件。
 *
 * 如沒有 SESSION_START，則使用全部事件。
 */
function getCurrentSessionLogs(logs: EventLog[]): EventLog[] {
  if (logs.length === 0) return [];

  const chronologicalLogs = sortChronologically(logs);

  let lastSessionStartIndex = -1;

  for (let index = chronologicalLogs.length - 1; index >= 0; index--) {
    if (chronologicalLogs[index].type === 'SESSION_START') {
      lastSessionStartIndex = index;
      break;
    }
  }

  if (lastSessionStartIndex === -1) {
    return chronologicalLogs;
  }

  return chronologicalLogs.slice(lastSessionStartIndex);
}

/**
 * 判斷是否為錯誤事件。
 *
 * 除 ERROR、PLACE_FAIL 外，也支援：
 * PLACE_BLOCK payload.success === false
 * PLACE_BLOCK payload.isCorrect === false
 * SUBMIT payload.success === false
 * SUBMIT payload.isCorrect === false
 */
function isErrorEvent(log: EventLog): boolean {
  if (log.type === 'ERROR' || log.type === 'PLACE_FAIL') {
    return true;
  }

  if (log.type === 'PLACE_BLOCK' || log.type === 'SUBMIT') {
    const success = readPayloadBoolean(log, ['success', 'isSuccess']);
    const isCorrect = readPayloadBoolean(log, ['isCorrect', 'correct']);

    if (success === false || isCorrect === false) {
      return true;
    }
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
    const success = readPayloadBoolean(log, ['success', 'isSuccess']);
    const isCorrect = readPayloadBoolean(log, ['isCorrect', 'correct']);

    return success === true || isCorrect === true;
  }

  return false;
}

/**
 * 判斷關卡是否完成。
 */
function isCompletionEvent(log: EventLog): boolean {
  if (log.type !== 'SUBMIT') return false;

  const completed = readPayloadBoolean(log, [
    'completed',
    'isCompleted',
    'levelCompleted',
    'success',
    'isCorrect',
  ]);

  // 若 SUBMIT 沒有明確結果，仍視為提交完成。
  return completed ?? true;
}

/**
 * 計算所有事件間的時間間隔。
 */
function calculateEventGaps(logs: EventLog[]): number[] {
  const gaps: number[] = [];

  for (let index = 1; index < logs.length; index++) {
    const gapSeconds = millisecondsToSeconds(
      logs[index].timestamp - logs[index - 1].timestamp,
    );

    gaps.push(gapSeconds);
  }

  return gaps;
}

/**
 * 計算閒置時間。
 *
 * 每段事件間隔若超過 IDLE_GAP_THRESHOLD_SECONDS，
 * 則超出的部分視為閒置時間。
 */
function calculateIdleTime(eventGaps: number[]): number {
  return eventGaps.reduce((total, gap) => {
    if (gap <= IDLE_GAP_THRESHOLD_SECONDS) return total;

    return total + (gap - IDLE_GAP_THRESHOLD_SECONDS);
  }, 0);
}

/**
 * 計算最大事件間隔。
 */
function calculateMaximumGap(eventGaps: number[]): number {
  if (eventGaps.length === 0) return 0;
  return Math.max(...eventGaps);
}

/**
 * 計算平均事件反應時間。
 *
 * 排除 SESSION_START，並限制單次間隔最多 60 秒，
 * 避免長時間離開頁面嚴重扭曲平均值。
 */
function calculateAverageResponseTime(eventGaps: number[]): number {
  if (eventGaps.length === 0) return 0;

  const cappedGaps = eventGaps.map(gap => Math.min(gap, 60));
  const total = cappedGaps.reduce((sum, gap) => sum + gap, 0);

  return safeDivide(total, cappedGaps.length);
}

/**
 * 計算提示閱讀時間。
 *
 * 優先使用 HINT_READ payload：
 * duration、readingTime、readDuration。
 *
 * 若沒有 duration，則使用：
 * HINT_REQUEST 到下一個非 HINT_READ 事件的時間差。
 */
function calculateHintReadingTime(logs: EventLog[]): number {
  let totalReadingTime = 0;

  const hintReadEvents = logs.filter(log => log.type === 'HINT_READ');

  for (const log of hintReadEvents) {
    totalReadingTime += readPayloadNumber(
      log,
      ['duration', 'readingTime', 'readDuration', 'durationSeconds'],
      0,
    );
  }

  if (totalReadingTime > 0) {
    return totalReadingTime;
  }

  for (let index = 0; index < logs.length; index++) {
    const currentLog = logs[index];

    if (currentLog.type !== 'HINT_REQUEST') continue;

    const nextRelevantEvent = logs
      .slice(index + 1)
      .find(log => log.type !== 'HINT_READ');

    if (!nextRelevantEvent) continue;

    const duration = millisecondsToSeconds(
      nextRelevantEvent.timestamp - currentLog.timestamp,
    );

    totalReadingTime += Math.min(duration, 60);
  }

  return totalReadingTime;
}

/**
 * 計算 Hover Time。
 *
 * 支援 payload：
 * hoverTime、duration、durationSeconds。
 */
function calculateHoverTime(logs: EventLog[]): number {
  return logs.reduce((total, log) => {
    return (
      total +
      readPayloadNumber(
        log,
        ['hoverTime', 'hoverDuration', 'durationSeconds'],
        0,
      )
    );
  }, 0);
}

/**
 * 計算拖曳距離。
 *
 * 支援：
 * payload.dragDistance
 * payload.distance
 * payload.from + payload.to
 * payload.startPosition + payload.endPosition
 */
function calculateDragDistance(logs: EventLog[]): number {
  return logs.reduce((total, log) => {
    if (
      log.type !== 'MOVE_BLOCK' &&
      log.type !== 'PLACE_BLOCK' &&
      log.type !== 'SELECT_BLOCK'
    ) {
      return total;
    }

    const directDistance = readPayloadNumber(
      log,
      ['dragDistance', 'distance'],
      0,
    );

    if (directDistance > 0) {
      return total + directDistance;
    }

    const fromPosition = readPayloadPosition(log, [
      'from',
      'start',
      'startPosition',
      'previousPosition',
    ]);

    const toPosition = readPayloadPosition(log, [
      'to',
      'end',
      'endPosition',
      'position',
      'newPosition',
    ]);

    return total + calculateDistance(fromPosition, toPosition);
  }, 0);
}

/**
 * 計算攝影機探索距離。
 *
 * 支援：
 * payload.distance
 * payload.moveDistance
 * payload.from + payload.to
 */
function calculateExplorationDistance(logs: EventLog[]): number {
  return logs.reduce((total, log) => {
    if (log.type !== 'MOVE_CAMERA' && log.type !== 'ROTATE_CAMERA') {
      return total;
    }

    const directDistance = readPayloadNumber(
      log,
      ['explorationDistance', 'moveDistance', 'distance'],
      0,
    );

    if (directDistance > 0) {
      return total + directDistance;
    }

    const fromPosition = readPayloadPosition(log, [
      'from',
      'start',
      'startPosition',
      'previousPosition',
    ]);

    const toPosition = readPayloadPosition(log, [
      'to',
      'end',
      'endPosition',
      'position',
      'newPosition',
    ]);

    return total + calculateDistance(fromPosition, toPosition);
  }, 0);
}

/**
 * 計算平均攝影機旋轉角度。
 */
function calculateAverageRotationAngle(rotationLogs: EventLog[]): number {
  if (rotationLogs.length === 0) return 0;

  const angles = rotationLogs
    .map(log =>
      Math.abs(
        readPayloadNumber(
          log,
          [
            'angle',
            'rotationAngle',
            'deltaAngle',
            'delta',
            'degrees',
          ],
          0,
        ),
      ),
    )
    .filter(angle => angle > 0);

  if (angles.length === 0) return 0;

  return safeDivide(
    angles.reduce((sum, angle) => sum + angle, 0),
    angles.length,
  );
}

/**
 * 計算平均縮放距離。
 */
function calculateAverageZoomDistance(zoomLogs: EventLog[]): number {
  if (zoomLogs.length === 0) return 0;

  const distances = zoomLogs
    .map(log =>
      Math.abs(
        readPayloadNumber(
          log,
          ['distance', 'zoomDistance', 'delta', 'deltaZoom', 'zoomDelta'],
          0,
        ),
      ),
    )
    .filter(distance => distance > 0);

  if (distances.length === 0) return 0;

  return safeDivide(
    distances.reduce((sum, distance) => sum + distance, 0),
    distances.length,
  );
}

/**
 * 計算重新放置次數。
 *
 * 規則：
 * 1. REMOVE_BLOCK 後，後續在相同座標 PLACE_BLOCK。
 * 2. MOVE_BLOCK 回到先前曾使用的座標。
 *
 * 相同座標優先比較 x、y、z；若資料缺少 y，則比較 x、z。
 */
function calculateReplacementCount(logs: EventLog[]): number {
  let replacementCount = 0;

  for (let index = 0; index < logs.length; index++) {
    const currentLog = logs[index];

    if (
      currentLog.type !== 'REMOVE_BLOCK' &&
      currentLog.type !== 'UNDO'
    ) {
      continue;
    }

    const removedPosition = readPayloadPosition(currentLog, [
      'position',
      'removedPosition',
      'from',
      'previousPosition',
    ]);

    if (!removedPosition) continue;

    const laterReplacement = logs.slice(index + 1).find(log => {
      if (
        log.type !== 'PLACE_BLOCK' &&
        log.type !== 'MOVE_BLOCK' &&
        log.type !== 'PLACE_SUCCESS'
      ) {
        return false;
      }

      const placedPosition = readPayloadPosition(log, [
        'position',
        'to',
        'newPosition',
      ]);

      if (!placedPosition) return false;

      return (
        placedPosition.x === removedPosition.x &&
        placedPosition.y === removedPosition.y &&
        placedPosition.z === removedPosition.z
      );
    });

    if (laterReplacement) {
      replacementCount++;
    }
  }

  return replacementCount;
}

/**
 * 計算由下而上建構程度。
 *
 * 1 代表完全依 y 軸由低到高建構。
 * 0 代表幾乎完全逆序。
 * 只有一個積木時使用中性值 0.5。
 */
function calculateConstructionOrderScore(
  placementLogs: EventLog[],
): number {
  const ySequence = placementLogs
    .map(log => readPayloadPosition(log, ['position', 'to', 'newPosition']))
    .filter((position): position is Position => position !== null)
    .map(position => position.y);

  if (ySequence.length <= 1) {
    return 0.5;
  }

  let nonDecreasingTransitions = 0;

  for (let index = 1; index < ySequence.length; index++) {
    if (ySequence[index] >= ySequence[index - 1]) {
      nonDecreasingTransitions++;
    }
  }

  return safeDivide(
    nonDecreasingTransitions,
    ySequence.length - 1,
    0.5,
  );
}

/**
 * 計算建構序列一致性。
 *
 * 綜合：
 * - 積木高度順序是否一致
 * - 是否頻繁移除／重做
 * - Undo 使用比例
 */
function calculateSequenceConsistency(
  constructionOrderScore: number,
  placementCount: number,
  removalCount: number,
  undoCount: number,
): number {
  if (placementCount === 0) {
    return 0.5;
  }

  const correctionRatio = clamp(
    safeDivide(removalCount + undoCount, placementCount),
  );

  return clamp(
    constructionOrderScore * 0.65 +
      (1 - correctionRatio) * 0.35,
  );
}

/**
 * 找出第一次成功所需時間。
 */
function calculateFirstCorrectTime(
  logs: EventLog[],
  startTime: number,
): number {
  const firstSuccess = logs.find(isSuccessEvent);

  if (!firstSuccess) return 0;

  return millisecondsToSeconds(firstSuccess.timestamp - startTime);
}

/**
 * 估算關卡完成率。
 *
 * 優先順序：
 * 1. SUBMIT payload.completionRate
 * 2. SUBMIT payload.completedBlocks / totalBlocks
 * 3. 最新事件 payload.currentBlocks / targetBlocks
 * 4. 已完成提交則為 1
 * 5. 否則以放置成功率作為近似值
 */
function calculateCompletionRate(
  logs: EventLog[],
  placementCount: number,
  successCount: number,
): number {
  const submitLogs = logs.filter(log => log.type === 'SUBMIT');
  const latestSubmit =
    submitLogs.length > 0
      ? submitLogs[submitLogs.length - 1]
      : undefined;


  if (latestSubmit) {
    const directCompletionRate = readPayloadNumber(
      latestSubmit,
      ['completionRate', 'progress'],
      -1,
    );

    if (directCompletionRate >= 0) {
      return clamp(
        directCompletionRate > 1
          ? directCompletionRate / 100
          : directCompletionRate,
      );
    }

    const completedBlocks = readPayloadNumber(
      latestSubmit,
      ['completedBlocks', 'correctBlocks', 'placedBlocks'],
      -1,
    );

    const totalBlocks = readPayloadNumber(
      latestSubmit,
      ['totalBlocks', 'targetBlocks', 'requiredBlocks'],
      -1,
    );

    if (completedBlocks >= 0 && totalBlocks > 0) {
      return clamp(completedBlocks / totalBlocks);
    }

    if (isCompletionEvent(latestSubmit)) {
      return 1;
    }
  }

  const latestLog =
  logs.length > 0
    ? logs[logs.length - 1]
    : undefined;

  if (latestLog) {
    const currentBlocks = readPayloadNumber(
      latestLog,
      ['currentBlocks', 'placedBlocks', 'completedBlocks'],
      -1,
    );

    const targetBlocks = readPayloadNumber(
      latestLog,
      ['targetBlocks', 'totalBlocks', 'requiredBlocks'],
      -1,
    );

    if (currentBlocks >= 0 && targetBlocks > 0) {
      return clamp(currentBlocks / targetBlocks);
    }
  }

  if (placementCount > 0) {
    return clamp(successCount / placementCount);
  }

  return 0;
}

/**
 * 計算注意力切換次數。
 *
 * 將操作分為四類：
 * TARGET、CAMERA、CONSTRUCTION、TUTOR。
 *
 * 當連續事件的類別改變時，視為一次注意力切換。
 */
function calculateAttentionSwitchCount(logs: EventLog[]): number {
  type AttentionArea =
    | 'TARGET'
    | 'CAMERA'
    | 'CONSTRUCTION'
    | 'TUTOR'
    | 'OTHER';

  function getAttentionArea(log: EventLog): AttentionArea {
    switch (log.type) {
      case 'VIEW_TARGET':
        return 'TARGET';

      case 'ROTATE_CAMERA':
      case 'ZOOM_CAMERA':
      case 'MOVE_CAMERA':
        return 'CAMERA';

      case 'SELECT_BLOCK':
      case 'PLACE_BLOCK':
      case 'PLACE_SUCCESS':
      case 'PLACE_FAIL':
      case 'MOVE_BLOCK':
      case 'ROTATE_BLOCK':
      case 'REMOVE_BLOCK':
      case 'UNDO':
      case 'REDO':
      case 'RESET':
        return 'CONSTRUCTION';

      case 'HINT_REQUEST':
      case 'HINT_READ':
      case 'REFLECTION_ANSWER':
        return 'TUTOR';

      default:
        return 'OTHER';
    }
  }

  const areas = logs
    .map(getAttentionArea)
    .filter(area => area !== 'OTHER');

  let switchCount = 0;

  for (let index = 1; index < areas.length; index++) {
    if (areas[index] !== areas[index - 1]) {
      switchCount++;
    }
  }

  return switchCount;
}

/**
 * 計算規劃分數。
 *
 * 高分條件：
 * - 開始操作前有合理規劃時間
 * - 建構順序具一致性
 * - 錯誤率低
 * - 重試率低
 *
 * 過短規劃時間可能代表衝動操作；
 * 過長則可能代表猶豫，因此使用鐘形近似。
 */
function calculatePlanningScore(
  planningTime: number,
  constructionOrderScore: number,
  sequenceConsistency: number,
  errorRate: number,
  retryRate: number,
): number {
  const idealPlanningTime = 12;
  const planningTolerance = 18;

  const planningTimeScore = clamp(
    1 - Math.abs(planningTime - idealPlanningTime) / planningTolerance,
  );

  return clamp(
    planningTimeScore * 0.25 +
      constructionOrderScore * 0.25 +
      sequenceConsistency * 0.25 +
      (1 - errorRate) * 0.15 +
      (1 - retryRate) * 0.1,
  );
}

/**
 * 計算探索分數。
 *
 * 探索不等同於越多越好，因此使用適度探索概念：
 * - 攝影機操作
 * - 目標查看
 * - 視角切換
 * - 探索距離
 */
function calculateExplorationScore(
  explorationActionCount: number,
  sessionDurationMinutes: number,
  explorationDistance: number,
  perspectiveChangeCount: number,
): number {
  const actionsPerMinute = safeDivide(
    explorationActionCount,
    Math.max(sessionDurationMinutes, 1 / 60),
  );

  const actionScore = normalize(
    actionsPerMinute,
    NORMALIZATION_REFERENCES.explorationActionsPerMinute,
  );

  const distanceScore = normalize(
    explorationDistance,
    NORMALIZATION_REFERENCES.dragDistance,
  );

  const perspectiveScore = normalize(
    perspectiveChangeCount,
    10,
  );

  return clamp(
    actionScore * 0.5 +
      distanceScore * 0.2 +
      perspectiveScore * 0.3,
  );
}

/**
 * 計算堅持度。
 *
 * 高分條件：
 * - 錯誤後仍繼續操作
 * - 有進行重試或修正
 * - 沒有快速 RESET 或 LOGOUT
 */
function calculatePersistenceScore(
  totalErrors: number,
  totalRetries: number,
  placementCount: number,
  resetCount: number,
  hasLogout: boolean,
  completionRate: number,
): number {
  if (placementCount === 0 && totalErrors === 0) {
    return 0.5;
  }

  const recoveryScore =
    totalErrors > 0
      ? clamp(totalRetries / totalErrors)
      : 0.75;

  const continuationScore = clamp(
    placementCount / Math.max(totalErrors + 1, 1) / 3,
  );

  const abandonmentPenalty =
    clamp(resetCount * 0.2) +
    (hasLogout && completionRate < 1 ? 0.25 : 0);

  return clamp(
    recoveryScore * 0.4 +
      continuationScore * 0.25 +
      completionRate * 0.35 -
      abandonmentPenalty,
  );
}

/**
 * 計算效率。
 *
 * 高分條件：
 * - 成功率高
 * - 完成率高
 * - 錯誤與移除少
 * - 每次放置耗時合理
 */
function calculateEfficiencyScore(
  successRate: number,
  completionRate: number,
  errorRate: number,
  constructionSpeed: number,
): number {
  const speedScore =
    constructionSpeed <= 0
      ? 0
      : clamp(1 - constructionSpeed / 30);

  return clamp(
    successRate * 0.35 +
      completionRate * 0.3 +
      (1 - errorRate) * 0.2 +
      speedScore * 0.15,
  );
}

/**
 * 計算信心分數。
 *
 * 高分條件：
 * - 成功率高
 * - 錯誤與重試少
 * - 不過度依賴提示
 * - 操作效率高
 */
function calculateConfidenceScore(
  successRate: number,
  errorRate: number,
  retryRate: number,
  hintDependencyRate: number,
  efficiencyScore: number,
): number {
  return clamp(
    successRate * 0.3 +
      (1 - errorRate) * 0.2 +
      (1 - retryRate) * 0.15 +
      (1 - clamp(hintDependencyRate * 5)) * 0.15 +
      efficiencyScore * 0.2,
  );
}

/**
 * 計算求助分數。
 *
 * 適度且在錯誤後使用提示，通常代表有效求助。
 * 過度依賴提示則會受到扣分。
 */
function calculateHelpSeekingScore(
  hintRequestCount: number,
  totalErrors: number,
  hintDependencyRate: number,
  hintReadingTime: number,
): number {
  if (hintRequestCount === 0) {
    return totalErrors > 0 ? 0.2 : 0.5;
  }

  const errorResponsiveHelp =
    totalErrors > 0
      ? clamp(hintRequestCount / totalErrors)
      : clamp(hintRequestCount / 3);

  const readingEngagement = clamp(
    safeDivide(hintReadingTime, hintRequestCount * 10),
  );

  const overusePenalty = clamp(
    safeDivide(
      hintDependencyRate,
      NORMALIZATION_REFERENCES.hintDependencyRate,
    ) - 1,
  );

  return clamp(
    errorResponsiveHelp * 0.5 +
      readingEngagement * 0.3 +
      (1 - overusePenalty) * 0.2,
  );
}

/**
 * 行為式認知負荷估計。
 *
 * 此值不是正式心理量表結果，而是行為代理變數。
 *
 * 高負荷訊號：
 * - 錯誤率高
 * - 重試率高
 * - 大量旋轉與視角切換
 * - 長時間閒置
 * - 頻繁 Undo
 * - 操作速度慢
 */
function calculateCognitiveLoadEstimate(params: {
  errorRate: number;
  retryRate: number;
  rotationFrequency: number;
  viewSwitchFrequency: number;
  idleTime: number;
  totalTime: number;
  undoCount: number;
  placementCount: number;
  constructionSpeed: number;
}): number {
  const {
    errorRate,
    retryRate,
    rotationFrequency,
    viewSwitchFrequency,
    idleTime,
    totalTime,
    undoCount,
    placementCount,
    constructionSpeed,
  } = params;

  const idleRatio = clamp(
    safeDivide(idleTime, Math.max(totalTime, 1)),
  );

  const rotationLoad = normalize(
    rotationFrequency,
    NORMALIZATION_REFERENCES.rotationPerMinute,
  );

  const viewSwitchLoad = normalize(
    viewSwitchFrequency,
    NORMALIZATION_REFERENCES.viewSwitchPerMinute,
  );

  const undoLoad = clamp(
    safeDivide(undoCount, Math.max(placementCount, 1)),
  );

  const speedLoad = clamp(constructionSpeed / 30);

  return clamp(
    errorRate * 0.25 +
      retryRate * 0.15 +
      rotationLoad * 0.15 +
      viewSwitchLoad * 0.1 +
      idleRatio * 0.15 +
      undoLoad * 0.1 +
      speedLoad * 0.1,
  );
}

/**
 * 主要行為特徵萃取函式。
 */
export function extractFeatures(newLogs: EventLog[]): BehaviorFeatures {
  const emptyFeatures = createEmptyFeatures();
  const sessionLogs = getCurrentSessionLogs(newLogs);

  if (sessionLogs.length === 0) {
    return emptyFeatures;
  }

  const firstLog = sessionLogs[0];
  const lastLog = sessionLogs[sessionLogs.length - 1];

  const sessionStartLog =
    sessionLogs.find(log => log.type === 'SESSION_START') ?? firstLog;

  const startTime = sessionStartLog.timestamp;
  const endTime = Math.max(lastLog.timestamp, startTime);

  const totalTime = Math.max(
    millisecondsToSeconds(endTime - startTime),
    0,
  );

  const safeDurationSeconds = Math.max(totalTime, 1);
  const durationMinutes = safeDurationSeconds / SECONDS_PER_MINUTE;

  // -------------------------------------------------------------------------
  // 事件分類
  // -------------------------------------------------------------------------

  const placementLogs = sessionLogs.filter(log =>
    log.type === 'PLACE_BLOCK' || log.type === 'PLACE_SUCCESS',
  );

  const removalLogs = sessionLogs.filter(
    log => log.type === 'REMOVE_BLOCK',
  );

  const cameraRotationLogs = sessionLogs.filter(
    log => log.type === 'ROTATE_CAMERA',
  );

  const cameraZoomLogs = sessionLogs.filter(
    log => log.type === 'ZOOM_CAMERA',
  );

  const cameraMoveLogs = sessionLogs.filter(
    log => log.type === 'MOVE_CAMERA',
  );

  const targetViewLogs = sessionLogs.filter(
    log => log.type === 'VIEW_TARGET',
  );

  const blockMoveLogs = sessionLogs.filter(
    log => log.type === 'MOVE_BLOCK',
  );

  const blockRotationLogs = sessionLogs.filter(
    log => log.type === 'ROTATE_BLOCK',
  );

  const undoLogs = sessionLogs.filter(
    log => log.type === 'UNDO',
  );

  const redoLogs = sessionLogs.filter(
    log => log.type === 'REDO',
  );

  const resetLogs = sessionLogs.filter(
    log => log.type === 'RESET',
  );

  const hintRequestLogs = sessionLogs.filter(
    log => log.type === 'HINT_REQUEST',
  );

  const viewSwitchLogs = sessionLogs.filter(log =>
    log.type === 'ROTATE_CAMERA' ||
    log.type === 'ZOOM_CAMERA' ||
    log.type === 'MOVE_CAMERA' ||
    log.type === 'VIEW_TARGET',
  );

  const errorLogs = sessionLogs.filter(isErrorEvent);
  const successLogs = sessionLogs.filter(isSuccessEvent);

  // -------------------------------------------------------------------------
  // 基本次數
  // -------------------------------------------------------------------------

  const blockPlacementCount = placementLogs.length;
  const blockRemovalCount = removalLogs.length;
  const blockMoveCount = blockMoveLogs.length;
  const blockRotationCount = blockRotationLogs.length;

  const cameraRotationCount = cameraRotationLogs.length;
  const cameraZoomCount = cameraZoomLogs.length;
  const cameraMoveCount = cameraMoveLogs.length;

  const undoCount = undoLogs.length;
  const redoCount = redoLogs.length;

  const hintRequestCount = hintRequestLogs.length;
  const totalErrors = errorLogs.length;

  // -------------------------------------------------------------------------
  // 時間特徵
  // -------------------------------------------------------------------------

  const firstPlacementLog = sessionLogs.find(
    log =>
      log.type === 'PLACE_BLOCK' ||
      log.type === 'PLACE_SUCCESS' ||
      log.type === 'MOVE_BLOCK',
  );

  const planningTime = firstPlacementLog
    ? millisecondsToSeconds(firstPlacementLog.timestamp - startTime)
    : totalTime;

  const eventGaps = calculateEventGaps(sessionLogs);
  const calculatedIdleTime = calculateIdleTime(eventGaps);
  const maximumIdleGap = calculateMaximumGap(eventGaps);

  /*
   * idleTime 使用累積閒置時間。
   * 若希望延續舊版「最大間隔」定義，可改成 maximumIdleGap。
   */
  const idleTime = calculatedIdleTime;

  const averageResponseTime =
    calculateAverageResponseTime(eventGaps);

  const firstCorrectTime =
    calculateFirstCorrectTime(sessionLogs, startTime);

  // -------------------------------------------------------------------------
  // 成功、錯誤與重試
  // -------------------------------------------------------------------------

  const blockReplacementCount =
    calculateReplacementCount(sessionLogs);

  const totalRetries =
    blockReplacementCount + undoCount + redoCount;

  const actionAttemptCount = Math.max(
    blockPlacementCount + totalErrors,
    1,
  );

  const successCount =
    successLogs.length > 0
      ? successLogs.length
      : Math.max(blockPlacementCount - totalErrors, 0);

  const successRate = clamp(
    safeDivide(successCount, actionAttemptCount),
  );

  const errorRate = clamp(
    safeDivide(
      totalErrors + blockRemovalCount,
      Math.max(blockPlacementCount + totalErrors, 1),
    ),
  );

  const retryRate = clamp(
    safeDivide(
      totalRetries,
      Math.max(
        blockPlacementCount +
          blockRemovalCount +
          totalRetries,
        1,
      ),
    ),
  );

  const completionRate = calculateCompletionRate(
    sessionLogs,
    blockPlacementCount,
    successCount,
  );

  // -------------------------------------------------------------------------
  // 頻率與操作速度
  // -------------------------------------------------------------------------

  const rotationFrequency = safeDivide(
    cameraRotationCount,
    durationMinutes,
  );

  const viewSwitchFrequency = safeDivide(
    viewSwitchLogs.length,
    durationMinutes,
  );

  /**
   * constructionSpeed：
   * 每放置一個積木所需平均秒數。
   * 數值越低通常代表操作越快。
   */
  const constructionSpeed =
    blockPlacementCount > 0
      ? safeDivide(totalTime, blockPlacementCount)
      : totalTime;

  /**
   * hintDependencyRate：
   * 提示請求數 / 主要學習操作數。
   *
   * 避免將 SESSION_START 等系統事件納入分母。
   */
  const meaningfulActionCount =
    blockPlacementCount +
    blockRemovalCount +
    blockMoveCount +
    blockRotationCount +
    cameraRotationCount +
    cameraZoomCount +
    cameraMoveCount +
    targetViewLogs.length +
    totalErrors +
    1;

  const hintDependencyRate = clamp(
    safeDivide(hintRequestCount, meaningfulActionCount),
  );

  // -------------------------------------------------------------------------
  // 攝影機與積木操作量
  // -------------------------------------------------------------------------

  const averageRotationAngle =
    calculateAverageRotationAngle(cameraRotationLogs);

  const averageZoomDistance =
    calculateAverageZoomDistance(cameraZoomLogs);

  const hintReadingTime =
    calculateHintReadingTime(sessionLogs);

  const hoverTime =
    calculateHoverTime(sessionLogs);

  const dragDistance =
    calculateDragDistance(sessionLogs);

  const explorationDistance =
    calculateExplorationDistance(sessionLogs);

  const attentionSwitchCount =
    calculateAttentionSwitchCount(sessionLogs);

  const perspectiveChangeCount =
    cameraRotationCount +
    cameraZoomCount +
    cameraMoveCount +
    targetViewLogs.length;

  // -------------------------------------------------------------------------
  // 建構順序與序列一致性
  // -------------------------------------------------------------------------

  const constructionOrderScore =
    calculateConstructionOrderScore(placementLogs);

  const sequenceConsistency =
    calculateSequenceConsistency(
      constructionOrderScore,
      blockPlacementCount,
      blockRemovalCount,
      undoCount,
    );

  // -------------------------------------------------------------------------
  // 高階行為指標
  // -------------------------------------------------------------------------

  const planningScore =
    calculatePlanningScore(
      planningTime,
      constructionOrderScore,
      sequenceConsistency,
      errorRate,
      retryRate,
    );

  const explorationActionCount =
    cameraRotationCount +
    cameraZoomCount +
    cameraMoveCount +
    targetViewLogs.length;

  const explorationScore =
    calculateExplorationScore(
      explorationActionCount,
      durationMinutes,
      explorationDistance,
      perspectiveChangeCount,
    );

  const persistenceScore =
    calculatePersistenceScore(
      totalErrors,
      totalRetries,
      blockPlacementCount,
      resetLogs.length,
      sessionLogs.some(log => log.type === 'LOGOUT'),
      completionRate,
    );

  const efficiencyScore =
    calculateEfficiencyScore(
      successRate,
      completionRate,
      errorRate,
      constructionSpeed,
    );

  const confidenceScore =
    calculateConfidenceScore(
      successRate,
      errorRate,
      retryRate,
      hintDependencyRate,
      efficiencyScore,
    );

  const helpSeekingScore =
    calculateHelpSeekingScore(
      hintRequestCount,
      totalErrors,
      hintDependencyRate,
      hintReadingTime,
    );

  const cognitiveLoadEstimate =
    calculateCognitiveLoadEstimate({
      errorRate,
      retryRate,
      rotationFrequency,
      viewSwitchFrequency,
      idleTime,
      totalTime,
      undoCount,
      placementCount: blockPlacementCount,
      constructionSpeed,
    });

  // 保留變數，方便教師端或除錯時追蹤最大間隔。
  void maximumIdleGap;

  return {
    // -----------------------------------------------------------------------
    // 原始特徵
    // -----------------------------------------------------------------------
    planningTime,
    idleTime,
    errorRate,
    retryRate,
    rotationFrequency,
    viewSwitchFrequency,
    constructionSpeed,
    hintDependencyRate,
    constructionOrderScore,

    // -----------------------------------------------------------------------
    // 擴充時間與表現特徵
    // -----------------------------------------------------------------------
    totalTime,
    averageResponseTime,
    firstCorrectTime,
    totalErrors,
    totalRetries,
    successRate,
    completionRate,

    // -----------------------------------------------------------------------
    // 攝影機操作
    // -----------------------------------------------------------------------
    cameraRotationCount,
    cameraZoomCount,
    cameraMoveCount,
    averageRotationAngle,
    averageZoomDistance,

    // -----------------------------------------------------------------------
    // 積木操作
    // -----------------------------------------------------------------------
    blockPlacementCount,
    blockMoveCount,
    blockRotationCount,
    blockRemovalCount,
    blockReplacementCount,

    // -----------------------------------------------------------------------
    // 修正操作
    // -----------------------------------------------------------------------
    undoCount,
    redoCount,

    // -----------------------------------------------------------------------
    // 提示使用
    // -----------------------------------------------------------------------
    hintRequestCount,
    hintReadingTime,

    // -----------------------------------------------------------------------
    // 滑鼠、探索與注意力
    // -----------------------------------------------------------------------
    hoverTime,
    dragDistance,
    explorationDistance,
    attentionSwitchCount,
    perspectiveChangeCount,

    // -----------------------------------------------------------------------
    // 高階行為分數
    // -----------------------------------------------------------------------
    sequenceConsistency,
    planningScore,
    explorationScore,
    persistenceScore,
    efficiencyScore,
    confidenceScore,
    helpSeekingScore,
    cognitiveLoadEstimate,
  };
}