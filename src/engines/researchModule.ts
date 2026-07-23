import { AssessmentItem, GroupAssignment, EventLog, PlayerModel, AssessmentResult } from '../types';

// ============================================================================
// Research Module — 對應「想法.md」第 16 節
// 支援：Control/Experimental 分組、隨機分派、前後測、資料匯出 (CSV/JSON)
//
// 注意：assessmentItems 為「示意用」空間能力測驗題目結構（placeholder）。
// 正式研究應採用標準化測驗，如 Mental Rotation Test (MRT, Vandenberg & Kuse, 1978)
// 或 Purdue Spatial Visualization Test: Rotations (PSVT:R)，並取得授權使用。
// ============================================================================

export const ASSESSMENT_ITEMS: AssessmentItem[] = [
  {
    id: 'Q1', question: '下列哪一個立體圖形，是將範例圖形旋轉後的結果？',
    imageHint: '[示意：三方塊 L 形立體圖，旋轉 90 度]',
    options: ['選項 A（正確旋轉）', '選項 B（鏡像）', '選項 C（不同形狀）', '選項 D（比例錯誤）'],
    correctIndex: 0,
  },
  {
    id: 'Q2', question: '從正上方觀察此立體結構，下列哪一個俯視圖是正確的？',
    imageHint: '[示意：階梯狀立體結構]',
    options: ['俯視圖 A', '俯視圖 B（正確）', '俯視圖 C', '俯視圖 D'],
    correctIndex: 1,
  },
  {
    id: 'Q3', question: '若將此結構沿垂直軸旋轉 180 度，哪一個選項會是結果？',
    imageHint: '[示意：不對稱立體結構]',
    options: ['選項 A', '選項 B', '選項 C（正確）', '選項 D'],
    correctIndex: 2,
  },
  {
    id: 'Q4', question: '下列哪一個立體圖形無法由範例圖形透過旋轉得到（即為鏡像而非旋轉）？',
    imageHint: '[示意：多方塊組合圖形]',
    options: ['選項 A', '選項 B（鏡像，正確答案）', '選項 C', '選項 D'],
    correctIndex: 1,
  },
  {
    id: 'Q5', question: '此立體結構最少需要幾個方塊才能建構完成？',
    imageHint: '[示意：多層鏤空立體結構]',
    options: ['6 個', '7 個（正確）', '8 個', '9 個'],
    correctIndex: 1,
  },
];

export function assignGroup(participantId: string): GroupAssignment {
  // 以簡易雜湊達成可重現的隨機分派 + 對半平衡（Counterbalance）
  let hash = 0;
  for (let i = 0; i < participantId.length; i++) hash = (hash * 31 + participantId.charCodeAt(i)) >>> 0;
  return hash % 2 === 0 ? 'CONTROL' : 'EXPERIMENTAL';
}

export function scoreAssessment(answers: (number | null)[], phase: 'PRE' | 'POST'): AssessmentResult {
  let correct = 0;
  ASSESSMENT_ITEMS.forEach((item, idx) => {
    if (answers[idx] === item.correctIndex) correct++;
  });
  return {
    phase,
    score: Math.round((correct / ASSESSMENT_ITEMS.length) * 100),
    totalItems: ASSESSMENT_ITEMS.length,
    correctItems: correct,
    timestamp: Date.now(),
  };
}

// --- 資料匯出：CSV / JSON（對應「想法.md」第 16、17 節） ---
export function exportEventsToCSV(logs: EventLog[]): string {
  const header = 'id,timestamp,type,payload';
  const rows = logs.map(l => `${l.id},${l.timestamp},${l.type},"${JSON.stringify(l.payload).replace(/"/g, '""')}"`);
  return [header, ...rows].join('\n');
}

export function exportPlayerModelToJSON(model: PlayerModel, results: AssessmentResult[]): string {
  return JSON.stringify({ playerModel: model, assessments: results, exportedAt: new Date().toISOString() }, null, 2);
}

export function downloadTextFile(filename: string, content: string, mime = 'text/plain') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
