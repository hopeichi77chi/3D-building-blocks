import React, { useMemo, useState } from 'react';
import type {
  AdaptiveDecisionHistoryEntry,
  PlayerModelSnapshot,
  TutorInterventionWindow,
} from '../../types';

interface DecisionHistoryPanelProps {
  decisions: AdaptiveDecisionHistoryEntry[];
  snapshots?: PlayerModelSnapshot[];
  interventions?: TutorInterventionWindow[];
  title?: string;
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

export default function DecisionHistoryPanel({
  decisions,
  snapshots = [],
  interventions = [],
  title = '自適應決策歷程',
}: DecisionHistoryPanelProps): React.ReactElement {
  const [ruleFilter, setRuleFilter] = useState('ALL');

  const snapshotMap = useMemo(
    () => new Map(snapshots.map((snapshot) => [snapshot.id, snapshot])),
    [snapshots],
  );
  const interventionMap = useMemo(
    () => new Map(interventions.map((item) => [item.id, item])),
    [interventions],
  );

  const rules = useMemo(
    () => [...new Set(decisions.map((item) => item.decision.ruleId))].sort(),
    [decisions],
  );

  const visible = useMemo(
    () =>
      [...decisions]
        .filter((item) => ruleFilter === 'ALL' || item.decision.ruleId === ruleFilter)
        .sort((a, b) => b.timestamp - a.timestamp),
    [decisions, ruleFilter],
  );

  const ruleCounts = useMemo(() => {
    const counts = new Map<string, number>();
    decisions.forEach((item) => {
      counts.set(item.decision.ruleId, (counts.get(item.decision.ruleId) ?? 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [decisions]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <p className="mt-1 text-sm text-slate-500">
            串聯認知診斷、玩家模型快照、命中規則、提示策略與介入結果。
          </p>
        </div>
        <select
          value={ruleFilter}
          onChange={(event) => setRuleFilter(event.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
          aria-label="篩選決策規則"
        >
          <option value="ALL">全部規則</option>
          {rules.map((rule) => (
            <option key={rule} value={rule}>{rule}</option>
          ))}
        </select>
      </div>

      {ruleCounts.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-2">
          {ruleCounts.slice(0, 8).map(([rule, count]) => (
            <span key={rule} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
              {rule}：{count} 次
            </span>
          ))}
        </div>
      )}

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center text-sm text-slate-500">
          尚無自適應決策歷程
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-slate-500">
                {['時間／關卡', '認知診斷', '決策規則', '教學動作', '提示設定', '結果'].map((label) => (
                  <th key={label} className="border-b border-slate-200 px-3 py-3 font-medium">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((entry) => {
                const snapshot = entry.playerModelSnapshotId
                  ? snapshotMap.get(entry.playerModelSnapshotId)
                  : undefined;
                const intervention = entry.interventionId
                  ? interventionMap.get(entry.interventionId)
                  : undefined;

                return (
                  <tr key={entry.id} className="align-top hover:bg-slate-50">
                    <td className="border-b border-slate-100 px-3 py-3 whitespace-nowrap">
                      <p className="font-medium text-slate-800">關卡 {entry.levelId}</p>
                      <p className="mt-1 text-xs text-slate-500">{formatTime(entry.timestamp)}</p>
                    </td>
                    <td className="border-b border-slate-100 px-3 py-3">
                      <div className="flex max-w-xs flex-wrap gap-1">
                        {entry.diagnosisRuleIds.length > 0 ? entry.diagnosisRuleIds.map((rule) => (
                          <span key={rule} className="rounded bg-rose-50 px-2 py-1 text-xs text-rose-700">
                            {rule}
                          </span>
                        )) : <span className="text-slate-400">無</span>}
                      </div>
                      {snapshot && (
                        <p className="mt-2 text-xs text-slate-500">
                          精熟度 {(snapshot.currentMastery * 100).toFixed(1)}%｜信心 {(snapshot.overallConfidence * 100).toFixed(1)}%
                        </p>
                      )}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-3">
                      <code className="rounded bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
                        {entry.decision.ruleId}
                      </code>
                      <p className="mt-2 max-w-sm text-xs text-slate-500">{entry.decision.condition}</p>
                    </td>
                    <td className="border-b border-slate-100 px-3 py-3">
                      <p className="max-w-sm text-slate-700">{entry.decision.action}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        聚焦：{entry.decision.recommendedSkillFocus}
                      </p>
                    </td>
                    <td className="border-b border-slate-100 px-3 py-3 whitespace-nowrap text-xs text-slate-600">
                      <p>{entry.decision.hintType}</p>
                      <p>{entry.decision.hintDetailLevel}／{entry.decision.hintTiming}</p>
                      <p>難度調整：{entry.decision.difficultyAdjustment > 0 ? '+' : ''}{entry.decision.difficultyAdjustment}</p>
                    </td>
                    <td className="border-b border-slate-100 px-3 py-3">
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">
                        {entry.outcome ?? intervention?.objectiveResult ?? '待觀察'}
                      </span>
                      {intervention?.improvementScore != null && (
                        <p className="mt-2 text-xs text-slate-500">
                          改善分數 {(intervention.improvementScore * 100).toFixed(1)}%
                        </p>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
