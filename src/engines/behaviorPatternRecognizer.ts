import { EventLog, BehaviorFeatures, BehaviorPattern } from '../types';

// ============================================================================
// Behavior Reasoning Engine — 由行為特徵 + 事件序列推論「學習策略模式」
// 對應「程式碼還需改進方向.docx」核心需求：
//   Behavior Features → Behavior Pattern Recognition → Cognitive Diagnosis
// 例：AI 不只看到「Rotation 15 次」，而是推論出 Pattern = Repeated Trial
// ============================================================================

const RECENT_WINDOW = 12; // 只看最近 N 筆事件序列做模式比對

/** 將事件序列（新→舊）轉為簡短代號序列，方便做序列比對，例如 R,R,R,U,R */
function toSymbolSequence(logs: EventLog[]): string[] {
  const map: Record<string, string> = {
    PLACE_BLOCK: 'P', REMOVE_BLOCK: 'M', ROTATE_CAMERA: 'R', ZOOM_CAMERA: 'Z',
    VIEW_TARGET: 'V', HINT_REQUEST: 'H', UNDO: 'U', SUBMIT: 'S', ERROR: 'E',
  };
  return logs.slice(0, RECENT_WINDOW).map(l => map[l.type] || '.').reverse();
}

export function recognizePatterns(
  logs: EventLog[],
  features: BehaviorFeatures
): BehaviorPattern[] {
  const patterns: BehaviorPattern[] = [];
  const seq = toSymbolSequence(logs);
  const seqStr = seq.join('');
  const recentIds = logs.slice(0, RECENT_WINDOW).map(l => l.id);

  // Pattern A — Repeated Rotation Strategy：連續 3 次以上旋轉，且伴隨 Undo/Move
  // 例如 R,R,R,U,R → 不是 6 個獨立事件，而是「重複旋轉尋找角度」策略
  const rotRun = /R{3,}/.exec(seqStr);
  if (rotRun || features.rotationFrequency > 12) {
    const strength = Math.min(1, (rotRun ? rotRun[0].length / 6 : 0) + Math.min(0.5, features.rotationFrequency / 24));
    patterns.push({
      id: 'REPEATED_ROTATION',
      name: 'Repeated Rotation Strategy（重複旋轉策略）',
      description: `序列中出現連續多次視角旋轉（${seqStr || 'N/A'}），顯示學習者反覆嘗試尋找觀察角度，而非單純隨機操作。`,
      strength,
      evidenceEventIds: recentIds,
    });
  }

  // Pattern B — Repeated Trial-and-Error：放置→移除→放置 反覆出現
  const trialRun = /(PM){2,}|(MP){2,}/.exec(seqStr);
  if (trialRun || features.retryRate > 0.4) {
    patterns.push({
      id: 'REPEATED_TRIAL_ERROR',
      name: 'Repeated Trial-and-Error（重複試誤策略）',
      description: `偵測到「放置→移除」重複發生（retryRate=${(features.retryRate * 100).toFixed(0)}%），代表學習者以嘗試錯誤取代事先規劃來定位方塊。`,
      strength: Math.min(1, features.retryRate + (trialRun ? 0.3 : 0)),
      evidenceEventIds: recentIds,
    });
  }

  // Pattern C — Rapid Trial-and-Error：試誤但節奏極快（沒有觀察，衝動操作）
  if (features.retryRate > 0.3 && features.constructionSpeed < 2 && features.rotationFrequency < 4) {
    patterns.push({
      id: 'RAPID_TRIAL_ERROR',
      name: 'Rapid Trial-and-Error（衝動式試誤）',
      description: '放置與移除節奏極快，但視角旋轉頻率偏低，顯示學習者可能未充分觀察 3D 結構即行動。',
      strength: Math.min(1, features.retryRate * 1.2),
      evidenceEventIds: recentIds,
    });
  }

  // Pattern D — Bottom-Up Strategy：由下而上系統化建構
  if (features.constructionOrderScore > 0.75) {
    patterns.push({
      id: 'SYSTEMATIC_PLANNING',
      name: 'Bottom-Up Systematic Strategy（由下而上系統化策略）',
      description: `建構順序分數 ${(features.constructionOrderScore * 100).toFixed(0)}%，顯示學習者採取先底層後上層的系統化建構策略。`,
      strength: features.constructionOrderScore,
      evidenceEventIds: recentIds,
    });
  } else if (features.constructionOrderScore < 0.3 && features.errorRate > 0.2) {
    patterns.push({
      id: 'BOTTOM_UP_STRATEGY',
      name: 'Non-Systematic Construction（非系統化建構）',
      description: '建構順序缺乏由下而上的規律，且伴隨較高錯誤率，顯示尚未形成分解結構的規劃策略。',
      strength: Math.min(1, features.errorRate),
      evidenceEventIds: recentIds,
    });
  }

  // Pattern E — Hesitation / Idle：長時間無操作
  if (features.idleTime > 20) {
    patterns.push({
      id: 'HESITATION_IDLE',
      name: 'Hesitation Pattern（猶豫停滯）',
      description: `偵測到最長 ${features.idleTime.toFixed(1)} 秒的無操作間隔，可能反映認知負荷過高或動機下降。`,
      strength: Math.min(1, features.idleTime / 60),
      evidenceEventIds: recentIds,
    });
  }

  // Pattern F — Hint Over-reliance：提示依賴
  if (features.hintDependencyRate > 0.15) {
    patterns.push({
      id: 'HINT_OVERRELIANCE',
      name: 'Hint Over-reliance（提示過度依賴）',
      description: `提示請求佔總事件比例達 ${(features.hintDependencyRate * 100).toFixed(0)}%，顯示學習者傾向依賴外部提示而非自主嘗試。`,
      strength: Math.min(1, features.hintDependencyRate * 3),
      evidenceEventIds: recentIds,
    });
  }

  // Pattern G — Insufficient View Checking：旋轉不足卻仍持續放置（易產生視角誤判）
  if (features.rotationFrequency < 2 && features.errorRate > 0.3) {
    patterns.push({
      id: 'INSUFFICIENT_VIEW_CHECK',
      name: 'Insufficient View-Checking（視角確認不足）',
      description: '旋轉頻率偏低但錯誤率偏高，顯示學習者可能僅依單一視角判斷 3D 結構，缺乏多角度驗證。',
      strength: Math.min(1, features.errorRate),
      evidenceEventIds: recentIds,
    });
  }

  return patterns.sort((a, b) => b.strength - a.strength);
}
