import { CognitiveDiagnosis, XAIFeedback, TutorStage } from '../types';

// ============================================================================
// AI Tutor Engine — 從「AI Hint」升級為「AI Tutor」對話式教學流程
// 對應「程式碼還需改進方向.docx」第 5 點：
//   Diagnosis → Reflection → Question → Hint → Next Task → Learning Report
// ============================================================================

const REFLECTION_QUESTION_BANK: Record<string, string[]> = {
  mentalRotation: [
    '你覺得剛剛哪一個角度最難判斷方塊的位置？',
    '如果把目標模型轉 90 度，你覺得形狀看起來會有什麼不同？',
  ],
  spatialVisualization: [
    '你覺得目前建構的形狀，跟目標模型相比，哪個部分最不一樣？',
    '你是怎麼判斷方塊應該放在哪一層的？',
  ],
  perspectiveTaking: [
    '從現在這個角度，你能看到目標模型的所有面嗎？',
    '你覺得換一個角度看，會不會發現剛剛沒注意到的方塊？',
  ],
  planning: [
    '你在放第一個方塊之前，有沒有先想過整體的形狀？',
    '如果要重新開始，你會先蓋哪一個部分？為什麼？',
  ],
  workingMemory: [
    '你還記得目標模型底層總共有幾個方塊嗎？',
    '要不要先數一次目標模型的方塊數量，再回來比對？',
  ],
  persistence: [
    '剛剛停下來的時候，你在想什麼呢？',
    '要不要先深呼吸一下，我們從最簡單的一步開始？',
  ],
};

let questionIndexCounter: Record<string, number> = {};

/** Stage 1: Diagnosis 已由 CognitiveDiagnosisEngine 提供；此處產生 Stage 2 Reflection Question */
export function getReflectionQuestion(diagnosis: CognitiveDiagnosis | undefined, fallbackAbility: string): string {
  const ability = diagnosis?.ability || fallbackAbility;
  const bank = REFLECTION_QUESTION_BANK[ability] || REFLECTION_QUESTION_BANK['planning'];
  const idx = (questionIndexCounter[ability] || 0) % bank.length;
  questionIndexCounter[ability] = idx + 1;
  return bank[idx];
}

/** Stage 3: 依學生回覆的關鍵字，微調後續提示的詳細程度（簡化版 NLP：關鍵字比對） */
export function interpretReflectionAnswer(answer: string): { needsMoreDetail: boolean; followUp: string } {
  const trimmed = answer.trim();
  const uncertainWords = ['不知道', '不確定', '沒想過', '忘記', '沒注意'];
  const isUncertain = uncertainWords.some(w => trimmed.includes(w)) || trimmed.length < 2;

  if (isUncertain) {
    return {
      needsMoreDetail: true,
      followUp: '沒關係，這是很常見的情況。讓我提供更詳細一點的提示來幫助你。',
    };
  }
  return {
    needsMoreDetail: false,
    followUp: '很好的觀察！讓我們根據你的想法繼續，這裡有一個提示可以驗證你的判斷：',
  };
}

/** Tutor 流程狀態機的下一個階段 */
export function nextTutorStage(current: TutorStage): TutorStage {
  const order: TutorStage[] = ['DIAGNOSIS', 'REFLECTION', 'HINT', 'NEXT_TASK'];
  const idx = order.indexOf(current);
  return order[Math.min(order.length - 1, idx + 1)];
}

export function resetTutorQuestionCounters() {
  questionIndexCounter = {};
}
