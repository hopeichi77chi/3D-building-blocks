import React, {
  KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  AlertCircle,
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  Database,
  Eye,
  HelpCircle,
  Lightbulb,
  Loader2,
  MessageCircle,
  RefreshCw,
  Route,
  Send,
  Sparkles,
  Target,
  TrendingUp,
  XCircle,
} from 'lucide-react';

import type {
  CognitiveDiagnosis,
  ConstructionEvaluation,
  TutorObjectiveResult,
  TutorSelfReportedResult,
  TutorStage,
  XAIFeedback,
  XAIResult,
} from '../types';

import {
  getReflectionQuestion,
  interpretReflectionAnswer,
} from '../engines/aiTutorEngine';

// ============================================================================
// TutorPanel — Closed-loop AI Tutor
//
// Diagnosis → Reflection → Question → Hint → Learner Action → Observation
// → Objective Reassessment → Next Hint / Next Task
//
// 重要原則：
// - 學生回報僅是主觀感受，不直接代表任務成功。
// - 是否成功應由 App.tsx / constructionEvaluationEngine 客觀判定。
// - objectiveObservationResult 傳回後，面板才決定下一步。
// ============================================================================

type TutorCycleStatus =
  | 'IDLE'
  | 'REFLECTING'
  | 'HINT_READY'
  | 'WAITING_ACTION'
  | 'WAITING_OBSERVATION'
  | 'REASSESSING'
  | 'COMPLETED';

interface TutorCycleRecord {
  cycle: number;
  diagnosis: string;
  question: string;
  answer: string;
  followUp: string;
  hint: string;
  selfReportedResult?: TutorSelfReportedResult;
  objectiveResult?: TutorObjectiveResult;
  improvementScore?: number;
  timestamp: number;
}

/**
 * 向後相容 payload：
 * - result：供目前 App.tsx 使用。
 * - selfReportedResult：符合新版 types.ts 語意。
 *
 * 後續 App.tsx 完成遷移後，可移除 result。
 */
export interface TutorObservationPayload {
  result: TutorSelfReportedResult;
  selfReportedResult: TutorSelfReportedResult;
  interventionId?: string;
  cycle: number;
  question: string;
  reflectionAnswer: string;
  diagnosis?: CognitiveDiagnosis;
  fallbackAbility: string;
  hint: string;
}

interface Props {
  xaiFeedback: XAIFeedback | null;
  topDiagnosis: CognitiveDiagnosis | undefined;
  fallbackAbility: string;
  onReflectionAnswered: (question: string, answer: string) => void;
  xaiResult?: XAIResult | null;
  onApplyHint?: (cycle: number, hint: string) => void;
  onObservationSubmitted?: (
    payload: TutorObservationPayload,
  ) => void | Promise<void>;
  onNextTask?: () => void;
  isReassessing?: boolean;
  maxCycles?: number;

  /** App.tsx 客觀評估完成後傳入。 */
  objectiveObservationResult?: TutorObjectiveResult | null;
  interventionImprovementScore?: number | null;
  beforeConstruction?: ConstructionEvaluation | null;
  afterConstruction?: ConstructionEvaluation | null;
  interventionEvidence?: string[];
}

const DEFAULT_MAX_CYCLES = 3;

const SELF_REPORT_LABELS: Record<
  TutorSelfReportedResult,
  { title: string; description: string }
> = {
  SUCCESS: {
    title: '我覺得已經完成',
    description: '我依照提示操作後，認為目前結構已經完成。',
  },
  PARTIAL: {
    title: '有改善但未完成',
    description: '提示有幫助，但仍有部分位置或步驟不確定。',
  },
  STILL_STUCK: {
    title: '仍然無法完成',
    description: '我已嘗試提示中的方法，但仍不知道如何繼續。',
  },
};

const OBJECTIVE_LABELS: Record<
  TutorObjectiveResult,
  { title: string; description: string; className: string }
> = {
  SUCCESS: {
    title: '系統驗證：已完成',
    description: '目前積木結構與目標結構相符。',
    className: 'border-green-200 bg-green-50 text-green-800',
  },
  PARTIAL: {
    title: '系統驗證：部分改善',
    description: '完成率或結構正確性已提升，但尚未完全完成。',
    className: 'border-amber-200 bg-amber-50 text-amber-800',
  },
  NO_IMPROVEMENT: {
    title: '系統驗證：尚未改善',
    description: '提示後的結構尚未出現足夠改善，將調整下一輪提示。',
    className: 'border-rose-200 bg-rose-50 text-rose-800',
  },
};

function clamp(value: number, min = 0, max = 100): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function normalizeConfidence(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return value <= 1 ? clamp(value * 100) : clamp(value);
}

function toPercent(value: number | undefined): string {
  if (!Number.isFinite(value)) return '—';
  const normalized = (value as number) <= 1 ? (value as number) * 100 : (value as number);
  return `${Math.round(normalized)}%`;
}

function stageNumber(stage: TutorStage): number {
  switch (stage) {
    case 'DIAGNOSIS':
      return 1;
    case 'REFLECTION':
    case 'QUESTION':
      return 2;
    case 'HINT':
    case 'APPLY_HINT':
      return 3;
    case 'OBSERVATION':
      return 4;
    case 'REASSESSMENT':
      return 5;
    case 'NEXT_TASK':
      return 6;
    default:
      return 1;
  }
}

function buildProgressiveHint(feedback: XAIFeedback, cycle: number): string {
  if (cycle <= 1) {
    return `第一層提示：先根據方向性線索自行檢查。${feedback.hint}`;
  }

  if (cycle === 2) {
    return `第二層提示：請聚焦在最可能出錯的局部結構。${feedback.hint} ${feedback.alternativeStrategy}`;
  }

  return `第三層提示：請依序執行下列策略。${feedback.hint} ${feedback.alternativeStrategy}`;
}

const StageProgress: React.FC<{
  stage: TutorStage;
  cycle: number;
  maxCycles: number;
}> = ({ stage, cycle, maxCycles }) => {
  const current = stageNumber(stage);
  const stages = ['診斷', '反思', '提示', '操作', '驗證', '任務'];

  return (
    <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-bold text-slate-500">閉環教學流程</span>
        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-600">
          Cycle {cycle} / {maxCycles}
        </span>
      </div>

      <div className="flex items-center">
        {stages.map((label, index) => {
          const number = index + 1;
          const completed = current > number;
          const active = current === number;

          return (
            <React.Fragment key={label}>
              <div className="flex min-w-0 flex-col items-center">
                <div
                  className={[
                    'flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-all',
                    completed
                      ? 'bg-green-500 text-white'
                      : active
                        ? 'bg-indigo-600 text-white ring-4 ring-indigo-100'
                        : 'bg-slate-200 text-slate-500',
                  ].join(' ')}
                >
                  {completed ? <CheckCircle2 className="h-4 w-4" /> : number}
                </div>
                <span
                  className={[
                    'mt-1 truncate text-[9px]',
                    active
                      ? 'font-bold text-indigo-700'
                      : completed
                        ? 'font-semibold text-green-600'
                        : 'text-slate-400',
                  ].join(' ')}
                >
                  {label}
                </span>
              </div>

              {index < stages.length - 1 && (
                <div
                  className={[
                    'mx-1 mb-4 h-0.5 flex-1 transition-all',
                    current > number ? 'bg-green-400' : 'bg-slate-200',
                  ].join(' ')}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

const SelfReportButton: React.FC<{
  result: TutorSelfReportedResult;
  selected: TutorSelfReportedResult | null;
  onSelect: (value: TutorSelfReportedResult) => void;
}> = ({ result, selected, onSelect }) => {
  const config = SELF_REPORT_LABELS[result];
  const isSelected = selected === result;

  const icon =
    result === 'SUCCESS' ? (
      <CheckCircle2 className="h-5 w-5" />
    ) : result === 'PARTIAL' ? (
      <AlertCircle className="h-5 w-5" />
    ) : (
      <XCircle className="h-5 w-5" />
    );

  return (
    <button
      type="button"
      onClick={() => onSelect(result)}
      className={[
        'w-full rounded-xl border p-3 text-left transition-all focus:outline-none focus:ring-2 focus:ring-indigo-300',
        isSelected
          ? 'border-indigo-500 bg-indigo-50 text-indigo-900'
          : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300',
      ].join(' ')}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{icon}</div>
        <div>
          <div className="text-sm font-bold">{config.title}</div>
          <p className="mt-1 text-xs leading-relaxed opacity-80">{config.description}</p>
        </div>
      </div>
    </button>
  );
};

export const TutorPanel: React.FC<Props> = ({
  xaiFeedback,
  topDiagnosis,
  fallbackAbility,
  onReflectionAnswered,
  xaiResult = null,
  onApplyHint,
  onObservationSubmitted,
  onNextTask,
  isReassessing = false,
  maxCycles = DEFAULT_MAX_CYCLES,
  objectiveObservationResult = null,
  interventionImprovementScore = null,
  beforeConstruction = null,
  afterConstruction = null,
  interventionEvidence = [],
}) => {
  const [stage, setStage] = useState<TutorStage>('DIAGNOSIS');
  const [cycleStatus, setCycleStatus] = useState<TutorCycleStatus>('IDLE');
  const [cycle, setCycle] = useState(1);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [selectedObservation, setSelectedObservation] =
    useState<TutorSelfReportedResult | null>(null);
  const [cycleHistory, setCycleHistory] = useState<TutorCycleRecord[]>([]);
  const [localSubmitting, setLocalSubmitting] = useState(false);

  const previousFeedbackSignatureRef = useRef('');
  const lastHandledObjectiveRef = useRef<string>('');

  const confidence = useMemo(
    () => normalizeConfidence(xaiFeedback?.confidence ?? 50),
    [xaiFeedback],
  );

  const progressiveHint = useMemo(
    () => (xaiFeedback ? buildProgressiveHint(xaiFeedback, cycle) : ''),
    [xaiFeedback, cycle],
  );

  const feedbackSignature = useMemo(() => {
    if (!xaiFeedback) return '';
    return [
      xaiFeedback.diagnosis,
      xaiFeedback.evidence,
      xaiFeedback.hint,
      xaiFeedback.confidence,
    ].join('|');
  }, [xaiFeedback]);

  useEffect(() => {
    if (!xaiFeedback) return;

    const nextQuestion = getReflectionQuestion(topDiagnosis, fallbackAbility);

    if (!previousFeedbackSignatureRef.current) {
      previousFeedbackSignatureRef.current = feedbackSignature;
      setQuestion(nextQuestion);
      setStage('DIAGNOSIS');
      setCycleStatus('IDLE');
      return;
    }

    if (
      feedbackSignature !== previousFeedbackSignatureRef.current &&
      cycleStatus !== 'REASSESSING'
    ) {
      previousFeedbackSignatureRef.current = feedbackSignature;
      setCycle(1);
      setQuestion(nextQuestion);
      setAnswer('');
      setFollowUp('');
      setSelectedObservation(null);
      setStage('DIAGNOSIS');
      setCycleStatus('IDLE');
      setCycleHistory([]);
    }
  }, [
    cycleStatus,
    fallbackAbility,
    feedbackSignature,
    topDiagnosis,
    xaiFeedback,
  ]);

  useEffect(() => {
    if (isReassessing) {
      setStage('REASSESSMENT');
      setCycleStatus('REASSESSING');
    }
  }, [isReassessing]);

  useEffect(() => {
    if (!objectiveObservationResult || isReassessing) return;

    const signature = `${cycle}|${objectiveObservationResult}|${interventionImprovementScore ?? ''}`;
    if (lastHandledObjectiveRef.current === signature) return;
    lastHandledObjectiveRef.current = signature;

    setCycleHistory(history =>
      history.map((record, index) =>
        index === history.length - 1
          ? {
              ...record,
              objectiveResult: objectiveObservationResult,
              improvementScore: interventionImprovementScore ?? undefined,
            }
          : record,
      ),
    );

    if (objectiveObservationResult === 'SUCCESS' || cycle >= maxCycles) {
      setStage('NEXT_TASK');
      setCycleStatus('COMPLETED');
      return;
    }

    setCycle(previous => previous + 1);
    setQuestion(getReflectionQuestion(topDiagnosis, fallbackAbility));
    setAnswer('');
    setFollowUp('');
    setSelectedObservation(null);
    setStage('DIAGNOSIS');
    setCycleStatus('IDLE');
  }, [
    cycle,
    fallbackAbility,
    interventionImprovementScore,
    isReassessing,
    maxCycles,
    objectiveObservationResult,
    topDiagnosis,
  ]);

  const startReflection = (): void => {
    setStage('REFLECTION');
    setCycleStatus('REFLECTING');
  };

  const submitReflection = (): void => {
    const trimmed = answer.trim();
    if (!trimmed) return;

    const interpretation = interpretReflectionAnswer(trimmed);
    setFollowUp(interpretation.followUp);
    onReflectionAnswered(question, trimmed);
    setStage('QUESTION');
    setCycleStatus('HINT_READY');
  };

  const handleAnswerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      submitReflection();
    }
  };

  const revealHint = (): void => {
    setStage('HINT');
    setCycleStatus('HINT_READY');
  };

  const applyHint = (): void => {
    if (!progressiveHint) return;
    onApplyHint?.(cycle, progressiveHint);
    setStage('APPLY_HINT');
    setCycleStatus('WAITING_ACTION');
  };

  const beginObservation = (): void => {
    setStage('OBSERVATION');
    setCycleStatus('WAITING_OBSERVATION');
  };

  const submitObservation = async (): Promise<void> => {
    if (!selectedObservation || !xaiFeedback) return;

    setLocalSubmitting(true);

    const record: TutorCycleRecord = {
      cycle,
      diagnosis: xaiFeedback.diagnosis,
      question,
      answer,
      followUp,
      hint: progressiveHint,
      selfReportedResult: selectedObservation,
      timestamp: Date.now(),
    };

    setCycleHistory(history => [...history, record]);
    setStage('REASSESSMENT');
    setCycleStatus('REASSESSING');

    try {
      await onObservationSubmitted?.({
        result: selectedObservation,
        selfReportedResult: selectedObservation,
        cycle,
        question,
        reflectionAnswer: answer,
        diagnosis: topDiagnosis,
        fallbackAbility,
        hint: progressiveHint,
      });
    } finally {
      setLocalSubmitting(false);
    }
  };

  if (!xaiFeedback) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center">
        <BrainCircuit className="mx-auto h-9 w-9 text-slate-300" />
        <p className="mt-3 text-sm font-semibold text-slate-600">AI Tutor 正在等待學習行為資料</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-400">
          開始放置、旋轉或檢查積木後，系統會進行行為分析與認知診斷。
        </p>
      </div>
    );
  }

  const objectiveConfig = objectiveObservationResult
    ? OBJECTIVE_LABELS[objectiveObservationResult]
    : null;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <StageProgress stage={stage} cycle={cycle} maxCycles={maxCycles} />

      <div className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="rounded-xl bg-indigo-50 p-2 text-indigo-600">
              <BrainCircuit className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-bold text-slate-800">AI Tutor 診斷</h3>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                  信心 {Math.round(confidence)}%
                </span>
              </div>
              <p className="mt-1 text-sm leading-relaxed text-slate-700">{xaiFeedback.diagnosis}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="mb-1 flex items-center gap-2 text-xs font-bold text-slate-600">
              <Database className="h-4 w-4" /> 行為證據
            </div>
            <p className="text-xs leading-relaxed text-slate-600">{xaiFeedback.evidence}</p>
          </div>

          <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3">
            <div className="mb-1 flex items-center gap-2 text-xs font-bold text-indigo-700">
              <Eye className="h-4 w-4" /> 判斷原因
            </div>
            <p className="text-xs leading-relaxed text-indigo-800">{xaiFeedback.reason}</p>
          </div>
        </div>

        {stage === 'DIAGNOSIS' && (
          <button
            type="button"
            onClick={startReflection}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-indigo-700"
          >
            <MessageCircle className="h-4 w-4" /> 開始自我反思
            <ArrowRight className="h-4 w-4" />
          </button>
        )}

        {stage === 'REFLECTION' && (
          <div className="space-y-3">
            <div className="rounded-xl border border-purple-100 bg-purple-50 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-bold text-purple-700">
                <HelpCircle className="h-4 w-4" /> 反思問題
              </div>
              <p className="text-sm font-semibold leading-relaxed text-purple-900">{question}</p>
            </div>

            <textarea
              value={answer}
              onChange={event => setAnswer(event.target.value)}
              onKeyDown={handleAnswerKeyDown}
              rows={4}
              placeholder="請描述你剛才的想法、判斷方式或不確定的地方……"
              className="w-full resize-none rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />

            <button
              type="button"
              disabled={!answer.trim()}
              onClick={submitReflection}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Send className="h-4 w-4" /> 送出反思回答
            </button>
          </div>
        )}

        {stage === 'QUESTION' && (
          <div className="space-y-3">
            <div className="rounded-xl border border-green-100 bg-green-50 p-3">
              <div className="mb-1 flex items-center gap-2 text-xs font-bold text-green-700">
                <Sparkles className="h-4 w-4" /> Tutor 回應
              </div>
              <p className="text-sm leading-relaxed text-green-900">{followUp}</p>
            </div>

            <button
              type="button"
              onClick={revealHint}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-amber-600"
            >
              <Lightbulb className="h-4 w-4" /> 查看第 {cycle} 層提示
            </button>
          </div>
        )}

        {stage === 'HINT' && (
          <div className="space-y-3">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-bold text-amber-800">
                <Lightbulb className="h-5 w-5" /> 適應性提示
              </div>
              <p className="text-sm leading-relaxed text-amber-900">{progressiveHint}</p>
              <div className="mt-3 border-t border-amber-200 pt-3 text-xs text-amber-700">
                預期改善：{xaiFeedback.expectedImprovement}
              </div>
            </div>

            <button
              type="button"
              onClick={applyHint}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-indigo-700"
            >
              <Target className="h-4 w-4" /> 套用提示並回到遊戲操作
            </button>
          </div>
        )}

        {stage === 'APPLY_HINT' && (
          <div className="space-y-3">
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-bold text-blue-800">
                <Route className="h-5 w-5" /> 請實際操作
              </div>
              <p className="text-sm leading-relaxed text-blue-900">
                請依提示調整積木。系統正在記錄提示後的實際行為與結構變化。
              </p>
            </div>

            <button
              type="button"
              onClick={beginObservation}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-700"
            >
              <TrendingUp className="h-4 w-4" /> 我已完成這一輪操作
            </button>
          </div>
        )}

        {stage === 'OBSERVATION' && (
          <div className="space-y-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs leading-relaxed text-slate-600">
                請回報你的主觀感受。這不會直接被視為成功，系統仍會依實際積木結構進行客觀驗證。
              </p>
            </div>

            {(Object.keys(SELF_REPORT_LABELS) as TutorSelfReportedResult[]).map(result => (
              <SelfReportButton
                key={result}
                result={result}
                selected={selectedObservation}
                onSelect={setSelectedObservation}
              />
            ))}

            <button
              type="button"
              disabled={!selectedObservation || localSubmitting || isReassessing}
              onClick={() => void submitObservation()}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {localSubmitting || isReassessing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              送出並進行客觀重新診斷
            </button>
          </div>
        )}

        {stage === 'REASSESSMENT' && (
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-center">
            <Loader2 className="mx-auto h-7 w-7 animate-spin text-indigo-600" />
            <p className="mt-2 text-sm font-bold text-indigo-800">正在進行客觀重新診斷</p>
            <p className="mt-1 text-xs leading-relaxed text-indigo-600">
              系統正在比較提示前後積木結構、行為特徵與能力模型變化。
            </p>
          </div>
        )}

        {objectiveConfig && (
          <div className={`rounded-xl border p-4 ${objectiveConfig.className}`}>
            <div className="flex items-center gap-2 text-sm font-bold">
              {objectiveObservationResult === 'SUCCESS' ? (
                <CheckCircle2 className="h-5 w-5" />
              ) : objectiveObservationResult === 'PARTIAL' ? (
                <AlertCircle className="h-5 w-5" />
              ) : (
                <XCircle className="h-5 w-5" />
              )}
              {objectiveConfig.title}
            </div>
            <p className="mt-1 text-xs leading-relaxed">{objectiveConfig.description}</p>

            {interventionImprovementScore !== null && (
              <p className="mt-2 text-xs font-semibold">
                綜合改善分數：{Math.round(interventionImprovementScore)} / 100
              </p>
            )}

            {(beforeConstruction || afterConstruction) && (
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-white/60 p-2">
                  <div className="opacity-70">提示前完成率</div>
                  <div className="mt-1 font-bold">{toPercent(beforeConstruction?.completionRate)}</div>
                </div>
                <div className="rounded-lg bg-white/60 p-2">
                  <div className="opacity-70">提示後完成率</div>
                  <div className="mt-1 font-bold">{toPercent(afterConstruction?.completionRate)}</div>
                </div>
              </div>
            )}

            {interventionEvidence.length > 0 && (
              <ul className="mt-3 space-y-1 text-xs leading-relaxed">
                {interventionEvidence.map((evidence, index) => (
                  <li key={`${evidence}-${index}`}>• {evidence}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {stage === 'NEXT_TASK' && (
          <div className="space-y-3">
            <div className="rounded-xl border border-green-200 bg-green-50 p-4">
              <div className="flex items-center gap-2 text-sm font-bold text-green-800">
                <CheckCircle2 className="h-5 w-5" /> 本輪 Tutor 流程完成
              </div>
              <p className="mt-2 text-sm leading-relaxed text-green-900">
                {objectiveObservationResult === 'SUCCESS'
                  ? '系統已驗證目前任務完成，可以進入下一個學習任務。'
                  : '已完成最大提示循環，系統將保留本次資料並提供後續學習建議。'}
              </p>
            </div>

            <button
              type="button"
              onClick={onNextTask}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-green-700"
            >
              前往下一個任務 <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}

        {xaiResult && (
          <details className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <summary className="cursor-pointer text-xs font-bold text-slate-600">
              查看完整 XAI 推論資訊
            </summary>
            <div className="mt-3 space-y-2 text-xs leading-relaxed text-slate-600">
              <p><strong>預測：</strong>{xaiResult.prediction}</p>
              <p><strong>決策規則：</strong>{xaiResult.decisionRule}</p>
              <p><strong>推理：</strong>{xaiResult.reasoning}</p>
              <p><strong>替代策略：</strong>{xaiResult.alternativeStrategy}</p>
              <p><strong>建議：</strong>{xaiResult.recommendation}</p>
              {xaiResult.evidence.length > 0 && (
                <div>
                  <strong>證據：</strong>
                  <ul className="mt-1 space-y-1">
                    {xaiResult.evidence.map((item, index) => (
                      <li key={`${item}-${index}`}>• {item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </details>
        )}

        {cycleHistory.length > 0 && (
          <details className="rounded-xl border border-slate-200 bg-white p-3">
            <summary className="cursor-pointer text-xs font-bold text-slate-600">
              Tutor 循環歷程（{cycleHistory.length}）
            </summary>
            <div className="mt-3 space-y-3">
              {cycleHistory.map(record => (
                <div key={`${record.cycle}-${record.timestamp}`} className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                  <div className="font-bold text-slate-700">Cycle {record.cycle}</div>
                  <p className="mt-1"><strong>反思：</strong>{record.answer}</p>
                  <p className="mt-1"><strong>主觀回報：</strong>{record.selfReportedResult ? SELF_REPORT_LABELS[record.selfReportedResult].title : '—'}</p>
                  <p className="mt-1"><strong>客觀結果：</strong>{record.objectiveResult ? OBJECTIVE_LABELS[record.objectiveResult].title : '等待驗證'}</p>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
};

export default TutorPanel;