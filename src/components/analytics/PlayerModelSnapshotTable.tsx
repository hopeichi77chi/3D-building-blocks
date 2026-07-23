import React, { useMemo, useState } from 'react';
import type {
  PlayerModelMetricKey,
  PlayerModelSnapshot,
  PlayerModelSnapshotTrigger,
} from '../../types';

interface PlayerModelSnapshotTableProps {
  snapshots: PlayerModelSnapshot[];
  title?: string;
  maxRows?: number;
}

const METRICS: Array<{ key: PlayerModelMetricKey; label: string }> = [
  { key: 'mentalRotation', label: '心理旋轉' },
  { key: 'spatialVisualization', label: '空間視覺化' },
  { key: 'perspectiveTaking', label: '視角轉換' },
  { key: 'planning', label: '規劃' },
  { key: 'workingMemory', label: '工作記憶' },
  { key: 'persistence', label: '持續性' },
  { key: 'masteryLevel', label: '精熟度' },
  { key: 'predictedSuccessRate', label: '預測成功率' },
];

function toPercent(value: unknown): string {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return `${((numeric > 1 ? numeric : numeric * 100)).toFixed(1)}%`;
}

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(timestamp));
}

export default function PlayerModelSnapshotTable({
  snapshots,
  title = '玩家模型快照',
  maxRows = 50,
}: PlayerModelSnapshotTableProps): React.ReactElement {
  const [triggerFilter, setTriggerFilter] = useState<'ALL' | PlayerModelSnapshotTrigger>('ALL');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const triggers = useMemo(
    () => [...new Set(snapshots.map((snapshot) => snapshot.triggerType))].sort(),
    [snapshots],
  );

  const visible = useMemo(
    () =>
      [...snapshots]
        .filter((snapshot) => triggerFilter === 'ALL' || snapshot.triggerType === triggerFilter)
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, Math.max(1, maxRows)),
    [maxRows, snapshots, triggerFilter],
  );

  const selected = useMemo(
    () => snapshots.find((snapshot) => snapshot.id === selectedId) ?? null,
    [selectedId, snapshots],
  );

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <p className="mt-1 text-sm text-slate-500">
            每列代表一次 AI Pipeline 更新後的完整玩家模型狀態。
          </p>
        </div>
        <select
          value={triggerFilter}
          onChange={(event) =>
            setTriggerFilter(event.target.value as 'ALL' | PlayerModelSnapshotTrigger)
          }
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
          aria-label="篩選快照觸發類型"
        >
          <option value="ALL">全部觸發類型</option>
          {triggers.map((trigger) => (
            <option key={trigger} value={trigger}>{trigger}</option>
          ))}
        </select>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center text-sm text-slate-500">
          尚無玩家模型快照
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-slate-500">
                {['時間', '關卡', '觸發來源', '精熟度', '變化', '模型信心', '預測成功率', '診斷', '操作'].map((label) => (
                  <th key={label} className="border-b border-slate-200 px-3 py-3 font-medium">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((snapshot) => (
                <tr key={snapshot.id} className="hover:bg-slate-50">
                  <td className="border-b border-slate-100 px-3 py-3 whitespace-nowrap text-slate-600">
                    {formatTime(snapshot.timestamp)}
                  </td>
                  <td className="border-b border-slate-100 px-3 py-3 font-medium text-slate-800">
                    {snapshot.levelId}
                  </td>
                  <td className="border-b border-slate-100 px-3 py-3">
                    <span className="rounded-full bg-blue-50 px-2 py-1 text-xs text-blue-700">
                      {snapshot.triggerType}
                    </span>
                  </td>
                  <td className="border-b border-slate-100 px-3 py-3 text-slate-700">
                    {toPercent(snapshot.currentMastery)}
                  </td>
                  <td className={`border-b border-slate-100 px-3 py-3 font-medium ${
                    snapshot.masteryChange > 0.001
                      ? 'text-emerald-700'
                      : snapshot.masteryChange < -0.001
                        ? 'text-rose-700'
                        : 'text-slate-500'
                  }`}>
                    {snapshot.masteryChange > 0 ? '+' : ''}{toPercent(snapshot.masteryChange)}
                  </td>
                  <td className="border-b border-slate-100 px-3 py-3 text-slate-700">
                    {toPercent(snapshot.overallConfidence)}
                  </td>
                  <td className="border-b border-slate-100 px-3 py-3 text-slate-700">
                    {toPercent(snapshot.model.predictedSuccessRate)}
                  </td>
                  <td className="border-b border-slate-100 px-3 py-3 text-slate-600">
                    {snapshot.diagnoses.length}
                  </td>
                  <td className="border-b border-slate-100 px-3 py-3">
                    <button
                      type="button"
                      onClick={() => setSelectedId(snapshot.id)}
                      className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200"
                    >
                      查看詳情
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50/40 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h4 className="font-semibold text-slate-900">快照詳細資料</h4>
              <p className="mt-1 text-xs text-slate-500">
                {formatTime(selected.timestamp)}｜關卡 {selected.levelId}｜{selected.triggerType}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="text-sm font-medium text-slate-500 hover:text-slate-800"
            >
              關閉
            </button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {METRICS.map(({ key, label }) => {
              const state = selected.metricStates[key];
              const modelValue = selected.model[key];
              return (
                <div key={key} className="rounded-lg bg-white p-3">
                  <p className="text-xs text-slate-500">{label}</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">
                    {toPercent(state?.value ?? modelValue)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    信心 {toPercent(state?.confidence)}｜趨勢 {state?.trend ?? 'STABLE'}
                  </p>
                </div>
              );
            })}
          </div>

          {selected.diagnoses.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-medium text-slate-700">認知診斷</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {selected.diagnoses.map((diagnosis) => (
                  <span key={`${selected.id}-${diagnosis.ruleId}`} className="rounded-full bg-rose-50 px-3 py-1 text-xs text-rose-700">
                    {diagnosis.ruleId}｜{diagnosis.label}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
