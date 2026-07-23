import React, { useMemo, useState } from 'react';
import type { TutorInterventionWindow, TutorObjectiveResult } from '../../types';

interface HintEffectPanelProps {
  interventions: TutorInterventionWindow[];
  title?: string;
}

function toPercent(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.round((value > 1 ? value : value * 100) * 10) / 10;
}

function formatDate(timestamp?: number): string {
  if (!timestamp) return '進行中';
  return new Intl.DateTimeFormat('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(timestamp));
}

function resultLabel(result?: TutorObjectiveResult): string {
  if (result === 'SUCCESS') return '成功';
  if (result === 'PARTIAL') return '部分改善';
  if (result === 'NO_IMPROVEMENT') return '未改善';
  return '尚未判定';
}

function resultClass(result?: TutorObjectiveResult): string {
  if (result === 'SUCCESS') return 'bg-emerald-50 text-emerald-700';
  if (result === 'PARTIAL') return 'bg-amber-50 text-amber-700';
  if (result === 'NO_IMPROVEMENT') return 'bg-rose-50 text-rose-700';
  return 'bg-slate-100 text-slate-600';
}

export default function HintEffectPanel({
  interventions,
  title = '提示介入效果',
}: HintEffectPanelProps): React.ReactElement {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const summary = useMemo(() => {
    const completed = interventions.filter((item) => item.objectiveResult);
    const successful = completed.filter((item) => item.objectiveResult === 'SUCCESS').length;
    const partial = completed.filter((item) => item.objectiveResult === 'PARTIAL').length;
    const ineffective = completed.filter(
      (item) => item.objectiveResult === 'NO_IMPROVEMENT',
    ).length;
    const effective = successful + partial;
    const averageImprovement = completed.length
      ? completed.reduce((sum, item) => sum + (item.improvementScore ?? 0), 0) /
        completed.length
      : 0;

    return {
      total: interventions.length,
      completed: completed.length,
      successful,
      partial,
      ineffective,
      effectivenessRate: completed.length ? effective / completed.length : 0,
      averageImprovement,
    };
  }, [interventions]);

  const sorted = useMemo(
    () => [...interventions].sort((a, b) => b.startedAt - a.startedAt),
    [interventions],
  );

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        <p className="mt-1 text-sm text-slate-500">
          同時呈現學生主觀回報與系統依實際建構結果產生的客觀判定。
        </p>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-xs text-slate-500">介入次數</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{summary.total}</p>
        </div>
        <div className="rounded-xl bg-emerald-50 p-3">
          <p className="text-xs text-emerald-700">有效提示率</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-800">
            {toPercent(summary.effectivenessRate)}%
          </p>
        </div>
        <div className="rounded-xl bg-blue-50 p-3">
          <p className="text-xs text-blue-700">平均改善分數</p>
          <p className="mt-1 text-2xl font-semibold text-blue-800">
            {toPercent(summary.averageImprovement)}%
          </p>
        </div>
        <div className="rounded-xl bg-amber-50 p-3">
          <p className="text-xs text-amber-700">成功／部分／無改善</p>
          <p className="mt-1 text-lg font-semibold text-amber-900">
            {summary.successful} / {summary.partial} / {summary.ineffective}
          </p>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center text-sm text-slate-500">
          尚無 Tutor 提示介入紀錄
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((item) => {
            const beforeRate = toPercent(item.beforeEvaluation?.completionRate);
            const afterRate = toPercent(item.afterEvaluation?.completionRate);
            const expanded = expandedId === item.id;

            return (
              <article key={item.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-slate-900">
                        關卡 {item.levelId}｜第 {item.cycle} 輪提示
                      </span>
                      <span className={`rounded-full px-2 py-1 text-xs ${resultClass(item.objectiveResult)}`}>
                        {resultLabel(item.objectiveResult)}
                      </span>
                      <span className="rounded-full bg-violet-50 px-2 py-1 text-xs text-violet-700">
                        Level {item.hintLevel}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatDate(item.startedAt)} → {formatDate(item.endedAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : item.id)}
                    className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200"
                  >
                    {expanded ? '收合' : '查看詳情'}
                  </button>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div>
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>提示前完成率</span><span>{beforeRate}%</span>
                    </div>
                    <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-slate-400" style={{ width: `${beforeRate}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>提示後完成率</span><span>{afterRate}%</span>
                    </div>
                    <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-blue-600" style={{ width: `${afterRate}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>改善分數</span><span>{toPercent(item.improvementScore)}%</span>
                    </div>
                    <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-emerald-600"
                        style={{ width: `${Math.max(0, toPercent(item.improvementScore))}%` }}
                      />
                    </div>
                  </div>
                </div>

                {expanded && (
                  <div className="mt-4 space-y-3 border-t border-slate-100 pt-4 text-sm">
                    <div>
                      <p className="font-medium text-slate-700">提示內容</p>
                      <p className="mt-1 rounded-lg bg-blue-50 p-3 text-blue-900">{item.hint}</p>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <p className="font-medium text-slate-700">學生主觀回報</p>
                        <p className="mt-1 text-slate-600">{item.selfReportedResult ?? '未回報'}</p>
                      </div>
                      <div>
                        <p className="font-medium text-slate-700">系統客觀判定</p>
                        <p className="mt-1 text-slate-600">{resultLabel(item.objectiveResult)}</p>
                      </div>
                    </div>
                    {item.evidence && item.evidence.length > 0 && (
                      <div>
                        <p className="font-medium text-slate-700">判定證據</p>
                        <ul className="mt-1 list-disc space-y-1 pl-5 text-slate-600">
                          {item.evidence.map((evidence, index) => (
                            <li key={`${item.id}-evidence-${index}`}>{evidence}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
