import { EventLog, BehaviorFeatures } from '../types';

// ============================================================================
// Learning Analytics Pipeline — 第 1 站：Event → Feature Extraction
// 對應「程式碼還需改進方向.docx」第 4 點：Pipeline 需求
// 輸入：本次關卡 Session 內的事件（新到舊排序，index 0 為最新）
// 輸出：正規化後的行為特徵向量
// ============================================================================

/** 取出「本次關卡」的事件片段：從最新一筆 SESSION_START 到陣列開頭 */
function getCurrentSessionLogs(newLogs: EventLog[]): EventLog[] {
  const lastStartIdx = newLogs.findIndex(l => l.type === 'SESSION_START');
  if (lastStartIdx === -1) return newLogs;
  return newLogs.slice(0, lastStartIdx + 1);
}

export function extractFeatures(newLogs: EventLog[]): BehaviorFeatures {
  const empty: BehaviorFeatures = {
    planningTime: 0, idleTime: 0, errorRate: 0, retryRate: 0,
    rotationFrequency: 0, viewSwitchFrequency: 0, constructionSpeed: 0,
    hintDependencyRate: 0, constructionOrderScore: 0.5,
  };
  const sessionLogs = getCurrentSessionLogs(newLogs);
  if (sessionLogs.length < 2) return empty;

  // sessionLogs[last] 為 SESSION_START（最舊），sessionLogs[0] 為最新事件
  const startTime = sessionLogs[sessionLogs.length - 1].timestamp;
  const currentTime = sessionLogs[0].timestamp;
  const sessionDuration = Math.max(0.001, (currentTime - startTime) / 1000); // seconds

  const places = sessionLogs.filter(l => l.type === 'PLACE_BLOCK');
  const removes = sessionLogs.filter(l => l.type === 'REMOVE_BLOCK' || l.type === 'UNDO');
  const rotations = sessionLogs.filter(l => l.type === 'ROTATE_CAMERA');
  const viewSwitches = sessionLogs.filter(l => l.type === 'ROTATE_CAMERA' || l.type === 'ZOOM_CAMERA' || l.type === 'VIEW_TARGET');
  const hints = sessionLogs.filter(l => l.type === 'HINT_REQUEST');

  // 由舊到新排序以便計算時間序列特徵
  const chrono = [...sessionLogs].reverse();
  const firstPlace = chrono.find(l => l.type === 'PLACE_BLOCK');
  const planningTime = firstPlace ? (firstPlace.timestamp - startTime) / 1000 : sessionDuration;

  const errorRate = places.length > 0 ? removes.length / places.length : 0;
  const rotationFrequency = (rotations.length / sessionDuration) * 60; // 次/分鐘
  const viewSwitchFrequency = (viewSwitches.length / sessionDuration) * 60;
  const constructionSpeed = places.length > 1 ? sessionDuration / places.length : sessionDuration;
  const hintDependencyRate = sessionLogs.length > 0 ? hints.length / sessionLogs.length : 0;

  // retryRate：偵測「移除後於同座標重新放置」的比例 → 代表嘗試錯誤式修正
  let retryCount = 0;
  for (let i = 0; i < chrono.length; i++) {
    if (chrono[i].type === 'REMOVE_BLOCK') {
      const removedPos = chrono[i].payload;
      const laterPlace = chrono.slice(i + 1).find(l => l.type === 'PLACE_BLOCK' &&
        l.payload && removedPos && l.payload.x === removedPos.x && l.payload.z === removedPos.z);
      if (laterPlace) retryCount++;
    }
  }
  const retryRate = removes.length > 0 ? retryCount / removes.length : 0;

  // idleTime：任兩個連續事件之間的最大間隔
  let maxIdle = 0;
  for (let i = 0; i < sessionLogs.length - 1; i++) {
    const gap = sessionLogs[i].timestamp - sessionLogs[i + 1].timestamp;
    if (gap > maxIdle) maxIdle = gap;
  }

  // constructionOrderScore：由下而上建構程度 (1 = 完全依 y 由低到高建構)
  let orderScore = 0.5;
  if (places.length > 1) {
    const ySeq = chrono.filter(l => l.type === 'PLACE_BLOCK').map(l => l.payload.y as number);
    let increasing = 0;
    for (let i = 1; i < ySeq.length; i++) if (ySeq[i] >= ySeq[i - 1]) increasing++;
    orderScore = increasing / (ySeq.length - 1);
  }

  return {
    planningTime,
    idleTime: maxIdle / 1000,
    errorRate,
    retryRate,
    rotationFrequency,
    viewSwitchFrequency,
    constructionSpeed,
    hintDependencyRate,
    constructionOrderScore: orderScore,
  };
}
