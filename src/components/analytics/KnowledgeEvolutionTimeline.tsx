import React, { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AbilityKey } from '../../types';
import type { KnowledgeTracingState } from '../../engines/knowledgeTracingEngine';

interface KnowledgeEvolutionTimelineProps {
  knowledgeState: KnowledgeTracingState;
  title?: string;
  maxPoints?: number;
}

const ABILITY_LABELS: Record<AbilityKey, string> = {
  mentalRotation: '心理旋轉',
  spatialVisualization: '空間視覺化',
  perspectiveTaking: '視角轉換',
  planning: '邏輯規劃',
  workingMemory: '工作記憶',
  persistence: '堅持度',
};

const ABILITIES = Object.keys(ABILITY_LABELS) as AbilityKey[];
const LINE_COLORS = ['#2563eb', '#16a34a', '#9333ea', '#ea580c', '#0891b2', '#dc2626'];

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(timestamp));
}

export default function KnowledgeEvolutionTimeline({
  knowledgeState,
  title = 'Knowledge Evolution Timeline',
  maxPoints = 40,
}: KnowledgeEvolutionTimelineProps): React.ReactElement {
  const [selectedAbilities, setSelectedAbilities] = useState<AbilityKey[]>(ABILITIES);

  const chartData = useMemo(() => {
    const rows = new Map<number, Record<string, string | number>>();

    ABILITIES.forEach((ability) => {
      const skill = knowledgeState.skills[ability];
      skill.history.forEach((entry) => {
        const timestamp = entry.timestamp;
        const row = rows.get(timestamp) ?? {
          timestamp,
          time: formatTime(timestamp),
          levelId: entry.levelId ?? '-',
        };
        row[ability] = Math.round(entry.updatedMastery * 1000) / 10;
        rows.set(timestamp, row);
      });
    });

    return [...rows.values()]
      .sort((a, b) => Number(a.timestamp) - Number(b.timestamp))
      .slice(-Math.max(1, maxPoints));
  }, [knowledgeState, maxPoints]);

  const toggleAbility = (ability: AbilityKey): void => {
    setSelectedAbilities((current) => {
      if (current.includes(ability)) {
        return current.length === 1 ? current : current.filter((item) => item !== ability);
      }
      return [...current, ability];
    });
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <p className="mt-1 text-sm text-slate-500">
            依 BKT 每次實際更新呈現六項能力掌握度，支援觀察進步、停滯與下降。
          </p>
        </div>
        <div className="flex gap-2">
          <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
            {knowledgeState.totalObservations} 次更新
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
            整體 {(knowledgeState.overallMastery * 100).toFixed(1)}%
          </span>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {ABILITIES.map((ability) => {
          const active = selectedAbilities.includes(ability);
          return (
            <button
              key={ability}
              type="button"
              onClick={() => toggleAbility(ability)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                active
                  ? 'border-indigo-600 bg-indigo-600 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-700'
              }`}
              aria-pressed={active}
            >
              {ABILITY_LABELS[ability]}
            </button>
          );
        })}
      </div>

      {chartData.length === 0 ? (
        <div className="flex h-72 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
          尚無 Knowledge Tracing 歷程；完成關卡或 Tutor 重新評估後會開始累積。
        </div>
      ) : (
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="time" tick={{ fontSize: 11 }} />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 11 }}
                tickFormatter={(value: number) => `${value}%`}
              />
              <Tooltip
                formatter={(value: number, name: string) => [
                  `${Number(value).toFixed(1)}%`,
                  ABILITY_LABELS[name as AbilityKey] ?? name,
                ]}
                labelFormatter={(_, payload) => {
                  const row = payload?.[0]?.payload as { time?: string; levelId?: string } | undefined;
                  return row ? `${row.time ?? ''}｜關卡 ${row.levelId ?? '-'}` : '';
                }}
              />
              <Legend formatter={(value: string) => ABILITY_LABELS[value as AbilityKey] ?? value} />
              {selectedAbilities.map((ability, index) => (
                <Line
                  key={ability}
                  type="monotone"
                  dataKey={ability}
                  stroke={LINE_COLORS[index % LINE_COLORS.length]}
                  strokeWidth={2.2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ABILITIES.map((ability) => {
          const skill = knowledgeState.skills[ability];
          return (
            <div key={ability} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-slate-700">{ABILITY_LABELS[ability]}</span>
                <span className={`text-xs font-semibold ${
                  skill.trend === 'UP'
                    ? 'text-emerald-700'
                    : skill.trend === 'DOWN'
                      ? 'text-rose-700'
                      : 'text-slate-500'
                }`}>
                  {skill.trend}
                </span>
              </div>
              <div className="mt-2 flex items-end justify-between">
                <span className="text-xl font-bold text-slate-900">{(skill.mastery * 100).toFixed(1)}%</span>
                <span className="text-xs text-slate-500">{skill.observations} 次觀察</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
