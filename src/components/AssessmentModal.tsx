import React, { useState } from 'react';
import { ASSESSMENT_ITEMS, scoreAssessment } from '../engines/researchModule';
import { AssessmentResult } from '../types';
import { ClipboardList, ArrowRight } from 'lucide-react';

interface Props {
  phase: 'PRE' | 'POST';
  onComplete: (result: AssessmentResult) => void;
}

// ============================================================================
// AssessmentModal — 前測 / 後測（對應「想法.md」使用者流程：前測 → ... → 後測）
// ============================================================================
export const AssessmentModal: React.FC<Props> = ({ phase, onComplete }) => {
  const [answers, setAnswers] = useState<(number | null)[]>(new Array(ASSESSMENT_ITEMS.length).fill(null));
  const [idx, setIdx] = useState(0);
  const item = ASSESSMENT_ITEMS[idx];
  const isLast = idx === ASSESSMENT_ITEMS.length - 1;

  const select = (optionIdx: number) => {
    const next = [...answers];
    next[idx] = optionIdx;
    setAnswers(next);
  };

  const proceed = () => {
    if (isLast) {
      onComplete(scoreAssessment(answers, phase));
    } else {
      setIdx(i => i + 1);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-8">
        <div className="flex items-center space-x-2 mb-2 text-indigo-600">
          <ClipboardList className="w-5 h-5" />
          <span className="text-xs font-bold uppercase tracking-wider">
            {phase === 'PRE' ? '前測 Pre-test' : '後測 Post-test'} — 空間能力測驗
          </span>
        </div>
        <div className="text-xs text-slate-400 mb-4">第 {idx + 1} / {ASSESSMENT_ITEMS.length} 題</div>
        <h3 className="text-lg font-bold text-slate-800 mb-2">{item.question}</h3>
        <div className="text-xs text-slate-400 italic mb-4 bg-slate-50 border border-dashed border-slate-200 rounded p-3">
          {item.imageHint}（正式研究請置換為標準化空間能力測驗圖片，如 MRT / PSVT:R）
        </div>
        <div className="space-y-2 mb-6">
          {item.options.map((opt, i) => (
            <button
              key={i}
              onClick={() => select(i)}
              className={`w-full text-left px-4 py-3 rounded-lg border text-sm font-medium transition-colors ${
                answers[idx] === i ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
        <button
          disabled={answers[idx] === null}
          onClick={proceed}
          className={`w-full flex items-center justify-center space-x-2 py-3 rounded-lg font-bold transition-colors ${
            answers[idx] === null ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700'
          }`}
        >
          <span>{isLast ? '完成測驗' : '下一題'}</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
