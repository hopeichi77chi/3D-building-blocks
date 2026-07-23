import React, {
  KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  Activity,
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

import {
  CognitiveDiagnosis,
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
// Closed-loop 流程：
//
// Diagnosis
//    ↓
// Reflection
//    ↓
// Guiding Question
//    ↓
// Adaptive Hint
//    ↓
// Learner Action
//    ↓
// Observation
//    ↓
// Re-diagnosis
//    ├─ 尚未改善 → 下一層提示
//    └─ 已改善   → Next Task
//
// 設計原則：
// 1. 不直接一次揭露完整答案。
// 2. 提示採漸進式揭露。
// 3. 提示後要求學習者回到任務實際操作。
// 4. 學習者回報結果後，重新執行診斷流程。
// 5. 新的 xaiFeedback 傳入時，視為完成一次重新診斷。
// ============================================================================

// ---------------------------------------------------------------------------
// 1. 型別定義
// ---------------------------------------------------------------------------

type TutorObservationResult =
  | 'SUCCESS'
  | 'PARTIAL'
  | 'STILL_STUCK';

type TutorCycleStatus =
  | 'IDLE'
  | 'REFLECTING'
  | 'HINT_READY'
  | 'APPLYING_HINT'
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

  observation?: TutorObservationResult;

  timestamp: number;
}

export interface TutorObservationPayload {
  result: TutorObservationResult;

  cycle: number;

  question: string;

  reflectionAnswer: string;

  diagnosis?: CognitiveDiagnosis;

  fallbackAbility: string;

  hint: string;
}

interface Props {
  /**
   * 舊版 XAI 學生回饋。
   */
  xaiFeedback: XAIFeedback | null;

  /**
   * 機率最高或最相關的認知診斷。
   */
  topDiagnosis: CognitiveDiagnosis | undefined;

  /**
   * 沒有認知診斷時使用的能力名稱。
   */
  fallbackAbility: string;

  /**
   * 保留原本 callback。
   *
   * 每次送出反思回答時呼叫，
   * App.tsx 可在此記錄 REFLECTION_ANSWER Event。
   */
  onReflectionAnswered: (
    question: string,
    answer: string,
  ) => void;

  /**
   * 完整 XAI 結果，可不傳。
   *
   * 若傳入，面板會顯示 prediction、
   * decisionRule 與完整 evidence。
   */
  xaiResult?: XAIResult | null;

  /**
   * 學習者看完提示並準備回到遊戲操作時呼叫。
   */
  onApplyHint?: (
    cycle: number,
    hint: string,
  ) => void;

  /**
   * 學習者回報提示後的操作結果時呼叫。
   *
   * App.tsx 應在此：
   * 1. 記錄事件
   * 2. 重新 extractFeatures
   * 3. 重新辨識 BehaviorVector
   * 4. 重新進行 Cognitive Diagnosis
   * 5. 重新更新 PlayerModel
   * 6. 重新產生 Adaptive Decision 與 XAI
   */
  onObservationSubmitted?: (
    payload: TutorObservationPayload,
  ) => void | Promise<void>;

  /**
   * 學習者完成 Tutor cycle 並準備前往下一關時呼叫。
   */
  onNextTask?: () => void;

  /**
   * 是否正在由 App.tsx 執行重新診斷。
   */
  isReassessing?: boolean;

  /**
   * 最大 Tutor 循環次數。
   *
   * 避免學習者無限停留在同一關。
   */
  maxCycles?: number;
}

// ---------------------------------------------------------------------------
// 2. 常數
// ---------------------------------------------------------------------------

const DEFAULT_MAX_CYCLES = 3;

const OBSERVATION_LABELS: Record<
  TutorObservationResult,
  {
    title: string;
    description: string;
  }
> = {
  SUCCESS: {
    title: '已成功完成',
    description:
      '我依照提示調整後，已經完成或解決目前問題。',
  },

  PARTIAL: {
    title: '有改善但未完成',
    description:
      '提示有幫助，但我仍有部分位置或步驟不確定。',
  },

  STILL_STUCK: {
    title: '仍然無法完成',
    description:
      '我已經嘗試提示中的方法，但目前仍不知道如何繼續。',
  },
};

// ---------------------------------------------------------------------------
// 3. 工具函式
// ---------------------------------------------------------------------------

function clamp(
  value: number,
  min = 0,
  max = 100,
): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(
    max,
    Math.max(min, value),
  );
}

function normalizeConfidence(
  confidence: number,
): number {
  if (!Number.isFinite(confidence)) {
    return 50;
  }

  return confidence <= 1
    ? clamp(confidence * 100)
    : clamp(confidence);
}

function getStageNumber(
  stage: TutorStage,
): number {
  switch (stage) {
    case 'DIAGNOSIS':
      return 1;

    case 'REFLECTION':
      return 2;

    case 'QUESTION':
      return 3;

    case 'HINT':
      return 4;

    case 'NEXT_TASK':
      return 5;

    default:
      return 1;
  }
}

function getStageLabel(
  stage: TutorStage,
): string {
  switch (stage) {
    case 'DIAGNOSIS':
      return '認知診斷';

    case 'REFLECTION':
      return '自我反思';

    case 'QUESTION':
      return '引導提問';

    case 'HINT':
      return '適應性提示';

    case 'NEXT_TASK':
      return '下一步任務';

    default:
      return 'AI Tutor';
  }
}

function getObservationResultText(
  result: TutorObservationResult,
): string {
  return OBSERVATION_LABELS[result].title;
}

/**
 * 根據 Tutor 循環次數調整提示前導語。
 *
 * 真正的提示內容仍由 xaiEngine 產生，
 * 此處只調整揭露方式。
 */
function buildProgressiveHint(
  feedback: XAIFeedback,
  cycle: number,
): string {
  if (cycle <= 1) {
    return (
      '第一層提示：先根據方向性線索自行檢查。' +
      feedback.hint
    );
  }

  if (cycle === 2) {
    return (
      '第二層提示：請把注意力集中在最可能出錯的局部結構。' +
      feedback.hint +
      ` ${feedback.alternativeStrategy}`
    );
  }

  return (
    '第三層提示：請依照下列步驟逐項執行。' +
    feedback.hint +
    ` ${feedback.alternativeStrategy}`
  );
}

// ---------------------------------------------------------------------------
// 4. 子元件
// ---------------------------------------------------------------------------

interface StageProgressProps {
  stage: TutorStage;
  cycle: number;
  maxCycles: number;
}

const StageProgress: React.FC<
  StageProgressProps
> = ({
  stage,
  cycle,
  maxCycles,
}) => {
  const currentStage =
    getStageNumber(stage);

  const stages: Array<{
    number: number;
    label: string;
  }> = [
    {
      number: 1,
      label: '診斷',
    },
    {
      number: 2,
      label: '反思',
    },
    {
      number: 3,
      label: '提問',
    },
    {
      number: 4,
      label: '提示',
    },
    {
      number: 5,
      label: '任務',
    },
  ];

  return (
    <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-bold text-slate-500">
          閉環教學流程
        </span>

        <span className="text-[11px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
          Cycle {cycle} / {maxCycles}
        </span>
      </div>

      <div className="flex items-center">
        {stages.map(
          (
            item,
            index,
          ) => {
            const completed =
              currentStage >
              item.number;

            const active =
              currentStage ===
              item.number;

            return (
              <React.Fragment
                key={item.number}
              >
                <div className="flex flex-col items-center min-w-0">
                  <div
                    className={[
                      'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all',
                      completed
                        ? 'bg-green-500 text-white'
                        : active
                          ? 'bg-indigo-600 text-white ring-4 ring-indigo-100'
                          : 'bg-slate-200 text-slate-500',
                    ].join(' ')}
                  >
                    {completed ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : (
                      item.number
                    )}
                  </div>

                  <span
                    className={[
                      'text-[9px] mt-1 truncate',
                      active
                        ? 'font-bold text-indigo-700'
                        : completed
                          ? 'font-semibold text-green-600'
                          : 'text-slate-400',
                    ].join(' ')}
                  >
                    {item.label}
                  </span>
                </div>

                {index <
                  stages.length -
                    1 && (
                  <div
                    className={[
                      'h-0.5 flex-1 mx-1 mb-4 transition-all',
                      currentStage >
                      item.number
                        ? 'bg-green-400'
                        : 'bg-slate-200',
                    ].join(' ')}
                  />
                )}
              </React.Fragment>
            );
          },
        )}
      </div>
    </div>
  );
};

interface ObservationButtonProps {
  result: TutorObservationResult;
  selected:
    | TutorObservationResult
    | null;
  onSelect: (
    result: TutorObservationResult,
  ) => void;
}

const ObservationButton: React.FC<
  ObservationButtonProps
> = ({
  result,
  selected,
  onSelect,
}) => {
  const selectedNow =
    selected === result;

  const config =
    OBSERVATION_LABELS[result];

  const icon =
    result === 'SUCCESS' ? (
      <CheckCircle2 className="w-5 h-5" />
    ) : result === 'PARTIAL' ? (
      <AlertCircle className="w-5 h-5" />
    ) : (
      <XCircle className="w-5 h-5" />
    );

  const selectedStyle =
    result === 'SUCCESS'
      ? 'border-green-500 bg-green-50 text-green-800'
      : result === 'PARTIAL'
        ? 'border-amber-500 bg-amber-50 text-amber-800'
        : 'border-rose-500 bg-rose-50 text-rose-800';

  return (
    <button
      type="button"
      onClick={() =>
        onSelect(result)
      }
      className={[
        'w-full text-left border rounded-xl p-3 transition-all',
        'hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-300',
        selectedNow
          ? selectedStyle
          : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300',
      ].join(' ')}
    >
      <div className="flex items-start">
        <div className="mr-3 mt-0.5">
          {icon}
        </div>

        <div>
          <div className="font-bold text-sm">
            {config.title}
          </div>

          <p className="text-xs mt-1 opacity-80 leading-relaxed">
            {config.description}
          </p>
        </div>
      </div>
    </button>
  );
};

// ---------------------------------------------------------------------------
// 5. 主元件
// ---------------------------------------------------------------------------

export const TutorPanel: React.FC<
  Props
> = ({
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
}) => {
  const [
    stage,
    setStage,
  ] = useState<TutorStage>(
    'DIAGNOSIS',
  );

  const [
    cycleStatus,
    setCycleStatus,
  ] = useState<TutorCycleStatus>(
    'IDLE',
  );

  const [
    cycle,
    setCycle,
  ] = useState(1);

  const [
    question,
    setQuestion,
  ] = useState('');

  const [
    answer,
    setAnswer,
  ] = useState('');

  const [
    followUp,
    setFollowUp,
  ] = useState('');

  const [
    selectedObservation,
    setSelectedObservation,
  ] = useState<
    TutorObservationResult | null
  >(null);

  const [
    cycleHistory,
    setCycleHistory,
  ] = useState<
    TutorCycleRecord[]
  >([]);

  const [
    localSubmitting,
    setLocalSubmitting,
  ] = useState(false);

  /**
   * 用於判斷 xaiFeedback 是否真的更新。
   *
   * 重新診斷後，App.tsx 通常會傳入新的 XAI。
   */
  const previousFeedbackSignatureRef =
    useRef<string>('');

  const confidence =
    useMemo(
      () =>
        normalizeConfidence(
          xaiFeedback?.confidence ??
            50,
        ),
      [xaiFeedback],
    );

  const progressiveHint =
    useMemo(
      () =>
        xaiFeedback
          ? buildProgressiveHint(
              xaiFeedback,
              cycle,
            )
          : '',
      [xaiFeedback, cycle],
    );

  const feedbackSignature =
    useMemo(() => {
      if (!xaiFeedback) {
        return '';
      }

      return [
        xaiFeedback.diagnosis,
        xaiFeedback.evidence,
        xaiFeedback.hint,
        xaiFeedback.confidence,
      ].join('|');
    }, [xaiFeedback]);

  // -------------------------------------------------------------------------
  // 初始化／重新診斷
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!xaiFeedback) {
      return;
    }

    const nextQuestion =
      getReflectionQuestion(
        topDiagnosis,
        fallbackAbility,
      );

    const feedbackChanged =
      previousFeedbackSignatureRef
        .current !==
      feedbackSignature;

    /**
     * 首次收到診斷。
     */
    if (
      previousFeedbackSignatureRef
        .current === ''
    ) {
      setStage('DIAGNOSIS');
      setCycleStatus('IDLE');
      setQuestion(nextQuestion);
      setAnswer('');
      setFollowUp('');
      setSelectedObservation(null);

      previousFeedbackSignatureRef.current =
        feedbackSignature;

      return;
    }

    /**
     * 提示後重新診斷完成。
     */
    if (
      feedbackChanged &&
      cycleStatus ===
        'REASSESSING'
    ) {
      previousFeedbackSignatureRef.current =
        feedbackSignature;

      if (
        selectedObservation ===
        'SUCCESS'
      ) {
        setStage('NEXT_TASK');
        setCycleStatus(
          'COMPLETED',
        );

        return;
      }

      if (cycle >= maxCycles) {
        setStage('NEXT_TASK');
        setCycleStatus(
          'COMPLETED',
        );

        return;
      }

      setCycle(
        previous =>
          previous + 1,
      );

      setStage('DIAGNOSIS');
      setCycleStatus('IDLE');
      setQuestion(nextQuestion);
      setAnswer('');
      setFollowUp('');
      setSelectedObservation(null);

      return;
    }

    /**
     * 外部發生新的關卡或新診斷，
     * 但不是目前 Tutor cycle 觸發的重新診斷。
     */
    if (
      feedbackChanged &&
      cycleStatus !==
        'APPLYING_HINT' &&
      cycleStatus !==
        'WAITING_OBSERVATION'
    ) {
      previousFeedbackSignatureRef.current =
        feedbackSignature;

      setCycle(1);
      setStage('DIAGNOSIS');
      setCycleStatus('IDLE');
      setQuestion(nextQuestion);
      setAnswer('');
      setFollowUp('');
      setSelectedObservation(null);
      setCycleHistory([]);
    }
  }, [
    xaiFeedback,
    topDiagnosis,
    fallbackAbility,
    feedbackSignature,
    cycleStatus,
    selectedObservation,
    cycle,
    maxCycles,
  ]);

  /**
   * App.tsx 透過 isReassessing 告知正在重新推論。
   */
  useEffect(() => {
    if (isReassessing) {
      setCycleStatus(
        'REASSESSING',
      );
    }
  }, [isReassessing]);

  // -------------------------------------------------------------------------
  // 事件處理
  // -------------------------------------------------------------------------

  const enterReflectionStage =
    (): void => {
      setStage('REFLECTION');
      setCycleStatus(
        'REFLECTING',
      );
    };

  const submitReflection =
    (): void => {
      const trimmedAnswer =
        answer.trim();

      if (!trimmedAnswer) {
        return;
      }

      const interpretation =
        interpretReflectionAnswer(
          trimmedAnswer,
        );

      setFollowUp(
        interpretation.followUp,
      );

      onReflectionAnswered(
        question,
        trimmedAnswer,
      );

      setStage('QUESTION');
      setCycleStatus(
        'HINT_READY',
      );
    };

  const revealHint =
    (): void => {
      setStage('HINT');
      setCycleStatus(
        'HINT_READY',
      );
    };

  const startApplyingHint =
    (): void => {
      setCycleStatus(
        'APPLYING_HINT',
      );

      onApplyHint?.(
        cycle,
        progressiveHint,
      );

      /**
       * 面板進入等待觀察，
       * 學習者應回到遊戲場景實際操作。
       */
      setCycleStatus(
        'WAITING_OBSERVATION',
      );
    };

  const submitObservation =
    async (): Promise<void> => {
      if (
        !selectedObservation ||
        !xaiFeedback
      ) {
        return;
      }

      setLocalSubmitting(true);
      setCycleStatus(
        'REASSESSING',
      );

      const record: TutorCycleRecord = {
        cycle,
        diagnosis:
          xaiFeedback.diagnosis,
        question,
        answer,
        followUp,
        hint: progressiveHint,
        observation:
          selectedObservation,
        timestamp: Date.now(),
      };

      setCycleHistory(
        previous => [
          ...previous,
          record,
        ],
      );

      try {
        await onObservationSubmitted?.({
          result:
            selectedObservation,
          cycle,
          question,
          reflectionAnswer:
            answer,
          diagnosis:
            topDiagnosis,
          fallbackAbility,
          hint:
            progressiveHint,
        });

        /**
         * 沒有提供 callback 時，使用本地模式完成流程。
         *
         * SUCCESS：
         * 直接進入 Next Task。
         *
         * PARTIAL / STILL_STUCK：
         * 進入下一個提示循環。
         */
        if (
          !onObservationSubmitted
        ) {
          if (
            selectedObservation ===
              'SUCCESS' ||
            cycle >= maxCycles
          ) {
            setStage('NEXT_TASK');
            setCycleStatus(
              'COMPLETED',
            );
          } else {
            setCycle(
              previous =>
                previous + 1,
            );

            setStage('DIAGNOSIS');
            setCycleStatus('IDLE');
            setQuestion(
              getReflectionQuestion(
                topDiagnosis,
                fallbackAbility,
              ),
            );
            setAnswer('');
            setFollowUp('');
            setSelectedObservation(
              null,
            );
          }
        }
      } finally {
        setLocalSubmitting(false);
      }
    };

  const restartTutorCycle =
    (): void => {
      setCycle(1);
      setStage('DIAGNOSIS');
      setCycleStatus('IDLE');
      setQuestion(
        getReflectionQuestion(
          topDiagnosis,
          fallbackAbility,
        ),
      );
      setAnswer('');
      setFollowUp('');
      setSelectedObservation(null);
      setCycleHistory([]);
    };

  const handleAnswerKeyDown = (
    event: KeyboardEvent<HTMLInputElement>,
  ): void => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submitReflection();
    }
  };

  // -------------------------------------------------------------------------
  // 尚無 XAI
  // -------------------------------------------------------------------------

  if (!xaiFeedback) {
    return (
      <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 flex flex-col items-center justify-center text-center text-slate-500 bg-white/50">
        <Activity className="w-8 h-8 mb-3 text-indigo-300 animate-pulse" />

        <p className="text-sm font-bold text-slate-600">
          特徵提取與推理中……
        </p>

        <p className="text-xs mt-2 opacity-80 leading-relaxed max-w-md">
          AI 正在執行 Event → Feature →
          Behavior Vector → Cognitive
          Diagnosis → Player Model →
          Adaptive Decision → XAI
          推理流程。
        </p>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // 主畫面
  // -------------------------------------------------------------------------

  return (
    <div className="bg-white rounded-xl shadow-md border border-indigo-100 overflow-hidden animate-in slide-in-from-right-4 mb-4">
      {/* Header */}
      <div className="bg-indigo-600 px-4 py-3 text-white flex justify-between items-center">
        <div className="min-w-0 pr-3">
          <span className="text-[10px] font-bold uppercase tracking-wider opacity-80 flex items-center">
            <BrainCircuit className="w-3 h-3 mr-1" />

            Closed-loop AI Tutor ·{' '}
            {getStageLabel(stage)}
          </span>

          <h3 className="font-bold text-lg leading-tight mt-0.5 truncate">
            {xaiFeedback.diagnosis}
          </h3>
        </div>

        <div className="text-right shrink-0">
          <div className="text-[10px] opacity-80">
            綜合信心值
          </div>

          <div className="font-bold text-xl">
            {confidence.toFixed(0)}%
          </div>
        </div>
      </div>

      <StageProgress
        stage={stage}
        cycle={cycle}
        maxCycles={maxCycles}
      />

      <div className="p-5 space-y-5 text-sm">
        {/* --------------------------------------------------------------- */}
        {/* Stage 1：Diagnosis */}
        {/* --------------------------------------------------------------- */}

        <section className="rounded-xl border border-indigo-100 overflow-hidden">
          <div className="px-3 py-2 bg-indigo-50 flex items-center justify-between">
            <span className="text-xs font-bold text-indigo-700 flex items-center">
              <Database className="w-3.5 h-3.5 mr-1.5" />

              Stage 1 · 認知診斷
            </span>

            <span className="text-[10px] font-semibold text-indigo-600">
              Diagnosis
            </span>
          </div>

          <div className="p-3 space-y-3">
            <div>
              <span className="text-xs font-bold text-slate-500 mb-1 flex items-center">
                <Activity className="w-3 h-3 mr-1" />

                系統取樣證據
              </span>

              <p className="text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-xs leading-relaxed">
                {xaiFeedback.evidence}
              </p>
            </div>

            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                <span className="text-xs font-bold text-slate-500">
                  關聯核心能力
                </span>

                <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                  {
                    xaiFeedback.relatedAbility
                  }
                </span>
              </div>

              <p className="text-slate-700 leading-relaxed text-[13px]">
                {xaiFeedback.reason}
              </p>
            </div>

            {xaiResult && (
              <div className="bg-sky-50 border border-sky-100 rounded-lg p-2.5">
                <div className="flex items-center text-xs font-bold text-sky-700 mb-1">
                  <Sparkles className="w-3.5 h-3.5 mr-1" />

                  模型預測
                </div>

                <p className="text-xs text-sky-800 leading-relaxed">
                  {xaiResult.prediction}
                </p>
              </div>
            )}

            {stage ===
              'DIAGNOSIS' && (
              <button
                type="button"
                onClick={
                  enterReflectionStage
                }
                className="w-full bg-indigo-600 text-white rounded-lg px-4 py-2.5 font-bold hover:bg-indigo-700 transition-colors flex items-center justify-center"
              >
                開始反思

                <ArrowRight className="w-4 h-4 ml-2" />
              </button>
            )}
          </div>
        </section>

        {/* --------------------------------------------------------------- */}
        {/* Stage 2：Reflection */}
        {/* --------------------------------------------------------------- */}

        {getStageNumber(stage) >= 2 && (
          <section className="rounded-xl border border-purple-200 overflow-hidden">
            <div className="px-3 py-2 bg-purple-50 flex items-center justify-between">
              <span className="text-xs font-bold text-purple-700 flex items-center">
                <MessageCircle className="w-3.5 h-3.5 mr-1.5" />

                Stage 2 · 自我反思
              </span>

              <span className="text-[10px] font-semibold text-purple-600">
                Reflection
              </span>
            </div>

            <div className="p-3">
              <div className="bg-purple-50 p-3 rounded-lg border border-purple-200 text-purple-900 font-medium text-[13px] mb-3">
                {question}
              </div>

              {stage ===
                'REFLECTION' && (
                <div className="flex space-x-2">
                  <input
                    value={answer}
                    onChange={event =>
                      setAnswer(
                        event.target
                          .value,
                      )
                    }
                    onKeyDown={
                      handleAnswerKeyDown
                    }
                    placeholder="描述你剛才的想法、困難或策略……"
                    className="flex-1 min-w-0 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
                  />

                  <button
                    type="button"
                    onClick={
                      submitReflection
                    }
                    disabled={
                      !answer.trim()
                    }
                    className="bg-purple-600 text-white px-3 py-2 rounded-lg hover:bg-purple-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
                    aria-label="送出反思回答"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              )}

              {getStageNumber(stage) >
                2 && (
                <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                  <div>
                    <span className="font-bold text-slate-700">
                      你的回答：
                    </span>

                    {answer ||
                      '（未作答）'}
                  </div>

                  {followUp && (
                    <div className="mt-2 text-purple-700 leading-relaxed">
                      {followUp}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        )}

        {/* --------------------------------------------------------------- */}
        {/* Stage 3：Guiding Question */}
        {/* --------------------------------------------------------------- */}

        {getStageNumber(stage) >= 3 && (
          <section className="rounded-xl border border-sky-200 overflow-hidden">
            <div className="px-3 py-2 bg-sky-50 flex items-center justify-between">
              <span className="text-xs font-bold text-sky-700 flex items-center">
                <Lightbulb className="w-3.5 h-3.5 mr-1.5" />

                Stage 3 · 引導提問
              </span>

              <span className="text-[10px] font-semibold text-sky-600">
                Question
              </span>
            </div>

            <div className="p-3">
              <p className="text-[13px] text-sky-900 leading-relaxed bg-sky-50 border border-sky-100 rounded-lg p-3">
                {followUp ||
                  '請重新觀察目標與目前作品，找出一個你最不確定的位置，並先說明你準備如何驗證。'}
              </p>

              {stage ===
                'QUESTION' && (
                <button
                  type="button"
                  onClick={
                    revealHint
                  }
                  className="mt-3 w-full bg-sky-600 text-white rounded-lg px-4 py-2.5 font-bold hover:bg-sky-700 transition-colors flex items-center justify-center"
                >
                  我已重新思考，查看提示

                  <HelpCircle className="w-4 h-4 ml-2" />
                </button>
              )}
            </div>
          </section>
        )}

        {/* --------------------------------------------------------------- */}
        {/* Stage 4：Adaptive Hint */}
        {/* --------------------------------------------------------------- */}

        {getStageNumber(stage) >= 4 && (
          <section className="rounded-xl border border-amber-200 overflow-hidden">
            <div className="px-3 py-2 bg-amber-50 flex items-center justify-between">
              <span className="text-xs font-bold text-amber-700 flex items-center">
                <HelpCircle className="w-3.5 h-3.5 mr-1.5" />

                Stage 4 · 適應性提示
              </span>

              <span className="text-[10px] font-semibold text-amber-600">
                Adaptive Hint
              </span>
            </div>

            <div className="p-3">
              <div className="bg-amber-50 p-3 rounded-lg border border-amber-200 text-amber-900 font-medium text-[13px] leading-relaxed">
                {progressiveHint}

                <div className="mt-3 pt-3 border-t border-amber-200/60 flex items-start">
                  <Route className="w-4 h-4 mr-1.5 mt-0.5 text-amber-600 shrink-0" />

                  <span className="text-xs opacity-90">
                    <strong className="text-amber-800">
                      替代策略：
                    </strong>

                    {
                      xaiFeedback.alternativeStrategy
                    }
                  </span>
                </div>
              </div>

              {cycleStatus ===
                'HINT_READY' && (
                <button
                  type="button"
                  onClick={
                    startApplyingHint
                  }
                  className="mt-3 w-full bg-amber-600 text-white rounded-lg px-4 py-2.5 font-bold hover:bg-amber-700 transition-colors flex items-center justify-center"
                >
                  回到遊戲套用提示

                  <Target className="w-4 h-4 ml-2" />
                </button>
              )}

              {cycleStatus ===
                'WAITING_OBSERVATION' && (
                <div className="mt-3 bg-indigo-50 border border-indigo-200 rounded-lg p-3">
                  <div className="flex items-center text-indigo-700 font-bold text-sm">
                    <Eye className="w-4 h-4 mr-1.5" />

                    請回到遊戲實際操作
                  </div>

                  <p className="text-xs text-indigo-700 mt-1 leading-relaxed">
                    完成一次嘗試後，回到此面板回報結果。AI
                    Tutor 將根據新的操作資料重新診斷，而不是直接沿用舊提示。
                  </p>
                </div>
              )}

              {cycleStatus ===
                'WAITING_OBSERVATION' && (
                <div className="mt-4 space-y-2">
                  <span className="text-xs font-bold text-slate-600">
                    套用提示後的結果
                  </span>

                  <ObservationButton
                    result="SUCCESS"
                    selected={
                      selectedObservation
                    }
                    onSelect={
                      setSelectedObservation
                    }
                  />

                  <ObservationButton
                    result="PARTIAL"
                    selected={
                      selectedObservation
                    }
                    onSelect={
                      setSelectedObservation
                    }
                  />

                  <ObservationButton
                    result="STILL_STUCK"
                    selected={
                      selectedObservation
                    }
                    onSelect={
                      setSelectedObservation
                    }
                  />

                  <button
                    type="button"
                    onClick={() => {
                      void submitObservation();
                    }}
                    disabled={
                      !selectedObservation ||
                      localSubmitting ||
                      isReassessing
                    }
                    className="w-full mt-2 bg-indigo-600 text-white rounded-lg px-4 py-2.5 font-bold hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
                  >
                    {localSubmitting ||
                    isReassessing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />

                        重新分析行為與能力……
                      </>
                    ) : (
                      <>
                        送出結果並重新診斷

                        <RefreshCw className="w-4 h-4 ml-2" />
                      </>
                    )}
                  </button>
                </div>
              )}

              {cycleStatus ===
                'REASSESSING' && (
                <div className="mt-3 bg-indigo-50 border border-indigo-200 rounded-lg p-3 flex items-start">
                  <Loader2 className="w-5 h-5 mr-2 text-indigo-600 animate-spin shrink-0" />

                  <div>
                    <div className="font-bold text-sm text-indigo-800">
                      正在重新診斷
                    </div>

                    <p className="text-xs text-indigo-700 mt-1 leading-relaxed">
                      系統正在重新執行 Feature
                      Extraction、Behavior
                      Vector、Cognitive
                      Diagnosis、Player Model 與
                      Adaptive Decision。
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* --------------------------------------------------------------- */}
        {/* Stage 5：Next Task */}
        {/* --------------------------------------------------------------- */}

        {stage ===
          'NEXT_TASK' && (
          <section className="rounded-xl border border-green-200 overflow-hidden">
            <div className="px-3 py-2 bg-green-50 flex items-center justify-between">
              <span className="text-xs font-bold text-green-700 flex items-center">
                <TrendingUp className="w-3.5 h-3.5 mr-1.5" />

                Stage 5 · 下一步任務
              </span>

              <span className="text-[10px] font-semibold text-green-600">
                Next Task
              </span>
            </div>

            <div className="p-3 space-y-3">
              <div className="bg-green-50 border border-green-100 rounded-lg p-3">
                <p className="text-green-800 font-medium text-[13px] leading-relaxed">
                  {
                    xaiFeedback.expectedImprovement
                  }
                </p>

                <p className="text-green-800 font-medium text-[13px] mt-2 leading-relaxed">
                  {
                    xaiFeedback.nextRecommendation
                  }
                </p>
              </div>

              {selectedObservation && (
                <div className="text-xs text-slate-600">
                  最後回報結果：
                  <span className="font-bold ml-1">
                    {getObservationResultText(
                      selectedObservation,
                    )}
                  </span>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={
                    onNextTask
                  }
                  disabled={!onNextTask}
                  className="flex-1 bg-green-600 text-white rounded-lg px-4 py-2.5 font-bold hover:bg-green-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
                >
                  進入下一個任務

                  <ArrowRight className="w-4 h-4 ml-2" />
                </button>

                <button
                  type="button"
                  onClick={
                    restartTutorCycle
                  }
                  className="flex-1 border border-slate-300 text-slate-700 rounded-lg px-4 py-2.5 font-bold hover:bg-slate-50 transition-colors flex items-center justify-center"
                >
                  重新檢視本次診斷

                  <RefreshCw className="w-4 h-4 ml-2" />
                </button>
              </div>
            </div>
          </section>
        )}

        {/* --------------------------------------------------------------- */}
        {/* Tutor Cycle History */}
        {/* --------------------------------------------------------------- */}

        {cycleHistory.length > 0 && (
          <section className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-3 py-2 bg-slate-50 flex items-center">
              <Activity className="w-3.5 h-3.5 mr-1.5 text-slate-500" />

              <span className="text-xs font-bold text-slate-600">
                Tutor 循環紀錄
              </span>
            </div>

            <div className="p-3 space-y-2">
              {cycleHistory.map(
                record => (
                  <div
                    key={`${record.cycle}-${record.timestamp}`}
                    className="border border-slate-200 rounded-lg p-2.5 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-700">
                        Cycle {
                          record.cycle
                        }
                      </span>

                      <span className="text-slate-500">
                        {record.observation
                          ? getObservationResultText(
                              record.observation,
                            )
                          : '尚未回報'}
                      </span>
                    </div>

                    <p className="mt-1 text-slate-600 line-clamp-2">
                      {
                        record.diagnosis
                      }
                    </p>
                  </div>
                ),
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};