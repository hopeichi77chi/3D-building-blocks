import React, { useState, useEffect } from 'react';
import { XAIFeedback, CognitiveDiagnosis, TutorStage } from '../types';
import { getReflectionQuestion, interpretReflectionAnswer } from '../engines/aiTutorEngine';
import { BrainCircuit, Activity, HelpCircle, Route, TrendingUp, Database, MessageCircle, Send } from 'lucide-react';

interface Props {
  xaiFeedback: XAIFeedback | null;
  topDiagnosis: CognitiveDiagnosis | undefined;
  fallbackAbility: string;
  onReflectionAnswered: (question: string, answer: string) => void;
}

// ============================================================================
// TutorPanel — AI Tutor（而非單純 AI Hint）
// 流程：Diagnosis 顯示 → Reflection Question → 學生作答 → Hint 揭露 → Next Task
// 對應「程式碼還需改進方向.docx」第 5 點
// ============================================================================
export const TutorPanel: React.FC<Props> = ({ xaiFeedback, topDiagnosis, fallbackAbility, onReflectionAnswered }) => {
  const [stage, setStage] = useState<TutorStage>('DIAGNOSIS');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [followUp, setFollowUp] = useState('');

  useEffect(() => {
    if (xaiFeedback) {
      setStage('DIAGNOSIS');
      setQuestion(getReflectionQuestion(topDiagnosis, fallbackAbility));
      setAnswer('');
      setFollowUp('');
    }
  }, [xaiFeedback]);

  if (!xaiFeedback) {
    return (
      <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 flex flex-col items-center justify-center text-center text-slate-500 bg-white/50">
        <Activity className="w-8 h-8 mb-3 text-indigo-300 animate-pulse" />
        <p className="text-sm font-bold text-slate-600">特徵提取與推理中...</p>
        <p className="text-xs mt-2 opacity-80 leading-relaxed">
          AI 正在即時捕捉您的行為特徵（Event → Feature → Pattern → Diagnosis）。點擊下方按鈕以啟動 AI Tutor。
        </p>
      </div>
    );
  }

  const submitAnswer = () => {
    if (!answer.trim()) return;
    const { followUp: fu } = interpretReflectionAnswer(answer);
    setFollowUp(fu);
    onReflectionAnswered(question, answer);
    setStage('HINT');
  };

  return (
    <div className="bg-white rounded-xl shadow-md border border-indigo-100 overflow-hidden animate-in slide-in-from-right-4 mb-4">
      <div className="bg-indigo-600 px-4 py-3 text-white flex justify-between items-center">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider opacity-80 flex items-center">
            <Database className="w-3 h-3 mr-1" /> Stage 1 · 認知診斷 (Diagnosis)
          </span>
          <h3 className="font-bold text-lg leading-tight mt-0.5">{xaiFeedback.diagnosis}</h3>
        </div>
        <div className="text-right">
          <div className="text-[10px] opacity-80">診斷信心指數</div>
          <div className="font-bold text-xl">{xaiFeedback.confidence.toFixed(0)}%</div>
        </div>
      </div>

      <div className="p-5 space-y-4 text-sm divide-y divide-slate-100">
        <div className="pt-2">
          <span className="text-xs font-bold text-slate-500 mb-1 flex items-center"><Activity className="w-3 h-3 mr-1" /> 系統取樣證據 (Evidence)</span>
          <p className="text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-xs font-mono">{xaiFeedback.evidence}</p>
        </div>
        <div className="pt-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold text-slate-500">關聯核心能力 (Related Skill)</span>
            <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">{xaiFeedback.relatedAbility}</span>
          </div>
          <p className="text-slate-700 leading-relaxed text-[13px]">{xaiFeedback.reason}</p>
        </div>

        {/* Stage 2: Reflection Question */}
        <div className="pt-3">
          <span className="text-xs font-bold text-purple-600 mb-1 flex items-center"><MessageCircle className="w-3 h-3 mr-1" /> Stage 2 · 反思提問 (Reflection)</span>
          <div className="bg-purple-50 p-3 rounded-lg border border-purple-200 text-purple-900 font-medium text-[13px] mb-2">{question}</div>
          {stage === 'DIAGNOSIS' && (
            <div className="flex space-x-2">
              <input
                value={answer}
                onChange={e => setAnswer(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') submitAnswer(); }}
                placeholder="輸入你的想法…"
                className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
              />
              <button onClick={submitAnswer} className="bg-purple-600 text-white px-3 py-2 rounded-lg hover:bg-purple-700">
                <Send className="w-4 h-4" />
              </button>
            </div>
          )}
          {stage !== 'DIAGNOSIS' && (
            <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-2">
              <span className="font-bold text-slate-600">你的回答：</span>{answer || '（未作答）'}
              <div className="mt-1 text-purple-700">{followUp}</div>
            </div>
          )}
        </div>

        {/* Stage 3: Hint（作答後才揭露，體現 Tutor 而非直接給答案） */}
        {stage !== 'DIAGNOSIS' && (
          <div className="pt-3">
            <span className="text-xs font-bold text-amber-600 mb-1 flex items-center"><HelpCircle className="w-3 h-3 mr-1" /> Stage 3 · 適應性提示 (Adaptive Hint)</span>
            <div className="bg-amber-50 p-3 rounded-lg border border-amber-200 text-amber-900 font-medium text-[13px]">
              {xaiFeedback.hint}
              <div className="mt-2 pt-2 border-t border-amber-200/50 flex items-start">
                <Route className="w-4 h-4 mr-1.5 mt-0.5 text-amber-600 opacity-70" />
                <span className="text-xs opacity-90"><strong className="text-amber-800">替代策略：</strong>{xaiFeedback.alternativeStrategy}</span>
              </div>
            </div>
          </div>
        )}

        {/* Stage 4: Next Task Recommendation */}
        {stage !== 'DIAGNOSIS' && (
          <div className="pt-3 pb-1">
            <span className="text-xs font-bold text-green-600 mb-1 flex items-center"><TrendingUp className="w-3 h-3 mr-1" /> Stage 4 · 下一步建議 (Next Task)</span>
            <p className="text-green-700 font-medium text-[13px]">{xaiFeedback.expectedImprovement}</p>
            <p className="text-green-700 font-medium text-[13px] mt-1">{xaiFeedback.nextRecommendation}</p>
          </div>
        )}
      </div>
    </div>
  );
};
