import React, { useState, useEffect, useMemo } from 'react';
import {
  Box, Eye, BrainCircuit, Activity, Trash2, CheckCircle,
  BarChart3, Database, User, BookOpen, Undo2, Play,
  TrendingUp, Zap, Target, Route, GitBranch, FileDown, ClipboardCheck,
} from 'lucide-react';
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';

import { Scene3D } from './components/Scene3D';
import { AssessmentModal } from './components/AssessmentModal';
import { TutorPanel } from './components/TutorPanel';
import { LEVEL_POOL } from './data/levels';
import {
  Block, EventLog, EventType, PlayerModel, BehaviorFeatures, BehaviorPattern,
  CognitiveDiagnosis, AdaptiveDecision, XAIFeedback, ModelUpdateEvidence,
  AssessmentResult, GroupAssignment, LearningReport,
} from './types';

import { extractFeatures } from './engines/behaviorFeatureExtractor';
import { recognizePatterns } from './engines/behaviorPatternRecognizer';
import { diagnose } from './engines/cognitiveDiagnosisEngine';
import { updatePlayerModel, INITIAL_PLAYER_MODEL } from './engines/playerModelEngine';
import { decide, selectNextLevel } from './engines/adaptiveDecisionEngine';
import { generateXAI } from './engines/xaiEngine';
import { generateLearningReport } from './engines/learningReportEngine';
import { assignGroup, exportEventsToCSV, exportPlayerModelToJSON, downloadTextFile } from './engines/researchModule';

type ViewMode = 'pre-assessment' | 'path' | 'student' | 'teacher' | 'post-assessment' | 'report';
const ABILITY_LABEL_MAP: Record<string, string> = {
  mentalRotation: '心理旋轉', spatialVisualization: '空間視覺化', perspectiveTaking: '視角轉換',
  planning: '邏輯規劃', workingMemory: '工作記憶', persistence: '堅持度',
};

export default function App() {
  // --- Research / Session Setup ---
  const [participantId] = useState(() => 'P-' + Math.random().toString(36).substr(2, 6).toUpperCase());
  const [group] = useState<GroupAssignment>(() => assignGroup(participantId));
  const [preTestResult, setPreTestResult] = useState<AssessmentResult | null>(null);
  const [postTestResult, setPostTestResult] = useState<AssessmentResult | null>(null);

  // --- View / Level State ---
  const [view, setView] = useState<ViewMode>('pre-assessment');
  const [currentLevelId, setCurrentLevelId] = useState<string>('L1-BASIC');
  const [completedLevels, setCompletedLevels] = useState<string[]>([]);

  // --- Construction State ---
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [blocksHistory, setBlocksHistory] = useState<Block[][]>([]);
  const [logs, setLogs] = useState<EventLog[]>([]);
  const [isSuccess, setIsSuccess] = useState(false);

  // --- AI Reasoning Pipeline State ---
  // Event -> Feature -> Pattern -> Diagnosis -> Player Model -> Decision -> XAI
  const [behaviorFeatures, setBehaviorFeatures] = useState<BehaviorFeatures>({
    planningTime: 0, idleTime: 0, errorRate: 0, retryRate: 0, rotationFrequency: 0,
    viewSwitchFrequency: 0, constructionSpeed: 0, hintDependencyRate: 0, constructionOrderScore: 0.5,
  });
  const [patterns, setPatterns] = useState<BehaviorPattern[]>([]);
  const [diagnoses, setDiagnoses] = useState<CognitiveDiagnosis[]>([]);
  const [playerModel, setPlayerModel] = useState<PlayerModel>(INITIAL_PLAYER_MODEL);
  const [evidenceTrail, setEvidenceTrail] = useState<ModelUpdateEvidence[]>([]);
  const [decision, setDecision] = useState<AdaptiveDecision | null>(null);
  const [xaiFeedback, setXaiFeedback] = useState<XAIFeedback | null>(null);
  const [modelHistory, setModelHistory] = useState<(PlayerModel & { time: string })[]>([]);
  const [learningReport, setLearningReport] = useState<LearningReport | null>(null);

  const currentLevel = useMemo(() => LEVEL_POOL.find(l => l.id === currentLevelId) || LEVEL_POOL[0], [currentLevelId]);

  // ==========================================================================
  // AI Reasoning Pipeline — 對應「程式碼還需改進方向.docx」補齊之完整資料流：
  // Event Log -> Behavior Feature Extraction -> Behavior Pattern Recognition
  //   -> Cognitive Diagnosis -> Player Model Update -> Adaptive Decision -> XAI
  // ==========================================================================
  const runPipeline = (newLogs: EventLog[]) => {
    const sessionEventCount = newLogs.findIndex(l => l.type === 'SESSION_START') + 1 || newLogs.length;

    const features = extractFeatures(newLogs);
    const pats = recognizePatterns(newLogs, features);
    const diags = diagnose(pats, features);
    const { model, evidenceTrail: trail } = updatePlayerModel(playerModel, features, diags, sessionEventCount);
    const dec = decide(model, diags);

    setBehaviorFeatures(features);
    setPatterns(pats);
    setDiagnoses(diags);
    setPlayerModel(model);
    setEvidenceTrail(trail);
    setDecision(dec);
    return { features, pats, diags, model, dec };
  };

  const logEvent = (type: EventType, payload: any) => {
    const newLog: EventLog = { id: Math.random().toString(36).substr(2, 9), timestamp: Date.now(), type, payload };
    setLogs(prev => {
      const updated = [newLog, ...prev];
      if (updated.length >= 2) runPipeline(updated);
      return updated;
    });
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setModelHistory(hist => [...hist, { ...playerModel, time: new Date().toLocaleTimeString() }]);
    }, 15000);
    return () => clearInterval(interval);
  }, [playerModel]);

  // --- Adaptive Learning Path ---
  const nextRecommendedLevel = useMemo(() => {
    if (!decision) return LEVEL_POOL.find(l => !completedLevels.includes(l.id)) || null;
    return selectNextLevel(decision, playerModel, LEVEL_POOL, completedLevels);
  }, [decision, playerModel, completedLevels]);

  const startLevel = (levelId: string) => {
    setCurrentLevelId(levelId);
    setBlocks([]); setBlocksHistory([]); setIsSuccess(false); setXaiFeedback(null);
    setView('student');
    logEvent('SESSION_START', { levelId, target: LEVEL_POOL.find(l => l.id === levelId)?.name });
  };

  // --- Explainable AI Trigger (啟動 AI Tutor) ---
  const requestTutor = () => {
    logEvent('HINT_REQUEST', {});
    const { features, diags, dec } = runPipeline(logs);
    const feedback = generateXAI(diags, dec, features, playerModel);

    // 若為結構性提示，補充具體座標（沿用平移比對演算法，使提示可操作化）
    if (dec.hintType === 'STRUCTURAL' || dec.hintType === 'PLANNING') {
      const geo = computeGeometricDiff();
      if (geo.extraneous) {
        feedback.hint = `請移除位於 (${geo.extraneous.x}, ${geo.extraneous.y}, ${geo.extraneous.z}) 的方塊，這裡不屬於目標結構。` + ' ' + feedback.hint;
      } else if (geo.missing) {
        feedback.hint = `你還需要在 (${geo.missing.x}, ${geo.missing.z}) 的高度 ${geo.missing.y} 補上一個方塊。` + ' ' + feedback.hint;
      }
    }
    setXaiFeedback(feedback);
  };

  /** 平移不變式比對：找出目前建構與目標模型之間第一個差異方塊（沿用原始演算法邏輯） */
  const computeGeometricDiff = () => {
    if (blocks.length === 0) return { extraneous: null as any, missing: currentLevel.targets[0] };
    let maxOverlap = -1, bestDx = 0, bestDz = 0;
    for (let dx = -currentLevel.gridSize; dx <= currentLevel.gridSize; dx++) {
      for (let dz = -currentLevel.gridSize; dz <= currentLevel.gridSize; dz++) {
        let overlap = 0;
        currentLevel.targets.forEach(t => { if (blocks.some(c => c.x === t.x + dx && c.y === t.y && c.z === t.z + dz)) overlap++; });
        if (overlap > maxOverlap) { maxOverlap = overlap; bestDx = dx; bestDz = dz; }
      }
    }
    const bestTargets = currentLevel.targets.map(t => ({ ...t, x: t.x + bestDx, z: t.z + bestDz }));
    const targetSet = new Set(bestTargets.map(t => `${t.x},${t.y},${t.z}`));
    const currentSet = new Set(blocks.map(b => `${b.x},${b.y},${b.z}`));
    const extraneous = blocks.find(b => !targetSet.has(`${b.x},${b.y},${b.z}`)) || null;
    const missing = bestTargets.find(t => !currentSet.has(`${t.x},${t.y},${t.z}`)) || null;
    return { extraneous, missing };
  };

  // --- Interaction Wrappers ---
  const handleAddBlock = (x: number, y: number, z: number) => {
    setBlocksHistory(prev => [...prev, blocks]);
    const allBlocks = [...blocks, { id: Math.random().toString(36).substr(2, 9), x, y, z, color: '#3b82f6' }];
    setBlocks(allBlocks);
    logEvent('PLACE_BLOCK', { x, y, z });
    setXaiFeedback(null);
    checkCompletion(allBlocks);
  };
  const handleRemoveBlock = (id: string) => {
    const removed = blocks.find(b => b.id === id);
    setBlocksHistory(prev => [...prev, blocks]);
    setBlocks(prev => prev.filter(b => b.id !== id));
    logEvent('REMOVE_BLOCK', removed ? { x: removed.x, y: removed.y, z: removed.z } : {});
    setXaiFeedback(null);
  };
  const handleUndo = () => {
    if (blocksHistory.length === 0) return;
    const previousBlocks = blocksHistory[blocksHistory.length - 1];
    setBlocksHistory(prev => prev.slice(0, -1));
    setBlocks(previousBlocks);
    logEvent('UNDO', {});
    setXaiFeedback(null);
  };
  const checkCompletion = (currentBlocks: Block[]) => {
    if (currentBlocks.length !== currentLevel.targets.length) return;
    let isMatch = false;
    for (let dx = -currentLevel.gridSize; dx <= currentLevel.gridSize; dx++) {
      for (let dz = -currentLevel.gridSize; dz <= currentLevel.gridSize; dz++) {
        if (currentLevel.targets.every(t => currentBlocks.some(c => c.x === t.x + dx && c.y === t.y && c.z === t.z + dz))) isMatch = true;
      }
    }
    if (isMatch) {
      setIsSuccess(true);
      const nextCompleted = completedLevels.includes(currentLevelId) ? completedLevels : [...completedLevels, currentLevelId];
      if (!completedLevels.includes(currentLevelId)) setCompletedLevels(nextCompleted);
      logEvent('SUBMIT', { success: true });
      if (nextCompleted.length === LEVEL_POOL.length) {
        setTimeout(() => setView('post-assessment'), 800);
      }
    }
  };

  const handleReflectionAnswered = (question: string, answer: string) => {
    logEvent('REFLECTION_ANSWER', { question, answer });
  };

  // --- Research Export ---
  const handleExportEvents = () => downloadTextFile(`${participantId}_events.csv`, exportEventsToCSV(logs), 'text/csv');
  const handleExportModel = () => downloadTextFile(`${participantId}_playermodel.json`,
    exportPlayerModelToJSON(playerModel, [preTestResult, postTestResult].filter(Boolean) as AssessmentResult[]), 'application/json');

  const finishExperiment = () => {
    const report = generateLearningReport(playerModel, diagnoses, completedLevels, logs);
    setLearningReport(report);
    setView('report');
  };

  // ==========================================================================
  // RENDER
  // ==========================================================================
  if (view === 'pre-assessment') {
    return <AssessmentModal phase="PRE" onComplete={(r) => { setPreTestResult(r); setView('path'); }} />;
  }
  if (view === 'post-assessment') {
    return <AssessmentModal phase="POST" onComplete={(r) => { setPostTestResult(r); finishExperiment(); }} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-800">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm z-30 relative">
        <div className="flex items-center space-x-3">
          <BrainCircuit className="w-8 h-8 text-blue-600" />
          <div>
            <h1 className="text-xl font-bold leading-tight">XAI-ASRITS</h1>
            <p className="text-xs text-slate-500">適應性空間推理智慧教學系統 · {participantId} · 組別：{group === 'CONTROL' ? '控制組' : '實驗組'}</p>
          </div>
        </div>
        <div className="flex bg-slate-100 p-1 rounded-lg">
          <button onClick={() => setView('path')} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center space-x-1 ${view === 'path' ? 'bg-white shadow-sm text-green-600' : 'text-slate-600 hover:text-slate-900'}`}><Route className="w-4 h-4" /><span>適性學習路徑</span></button>
          <button onClick={() => setView('student')} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center space-x-1 ${view === 'student' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-600 hover:text-slate-900'}`}><Box className="w-4 h-4" /><span>學生作業區</span></button>
          <button onClick={() => setView('teacher')} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center space-x-1 ${view === 'teacher' ? 'bg-white shadow-sm text-purple-600' : 'text-slate-600 hover:text-slate-900'}`}><BarChart3 className="w-4 h-4" /><span>學習分析面板</span></button>
        </div>
      </header>

      {/* Adaptive Learning Path View */}
      {view === 'path' && (
        <main className="flex-1 flex flex-col items-center justify-center bg-slate-50 relative overflow-hidden p-8">
          <div className="z-10 text-center mb-12">
            <h2 className="text-3xl font-extrabold text-slate-800 mb-2">適性化專屬學習路徑</h2>
            <p className="text-slate-500">系統依據 Adaptive Decision Engine（決策表 {decision?.ruleId ?? '—'}）動態推播最適合您的挑戰。</p>
          </div>
          <div className="w-full max-w-5xl bg-white rounded-2xl shadow-sm border border-slate-200 p-8 flex items-center overflow-x-auto relative">
            <div className="flex items-center space-x-6">
              {completedLevels.map((lvlId, idx) => {
                const lvl = LEVEL_POOL.find(l => l.id === lvlId)!;
                return (
                  <div key={`comp-${idx}`} className="flex items-center">
                    <div className="flex flex-col items-center opacity-70">
                      <div className="w-16 h-16 rounded-full bg-green-100 border-4 border-green-500 flex items-center justify-center text-green-600 shadow-sm"><CheckCircle className="w-8 h-8" /></div>
                      <span className="mt-2 text-xs font-bold text-slate-500">{lvl.name}</span>
                    </div>
                    <div className="w-16 h-2 bg-green-500 mx-2 rounded-full"></div>
                  </div>
                );
              })}
              {completedLevels.length === LEVEL_POOL.length ? (
                <div className="p-6 bg-yellow-50 border border-yellow-200 rounded-xl text-yellow-700 font-bold flex items-center"><CheckCircle className="w-6 h-6 mr-2" /> 您已完成所有訓練模組！</div>
              ) : nextRecommendedLevel && (
                <div className="flex flex-col items-center relative animate-in zoom-in">
                  <div className="absolute -top-10 bg-blue-600 text-white text-xs px-3 py-1 rounded-full font-bold shadow-md whitespace-nowrap flex items-center">
                    <Zap className="w-3 h-3 mr-1" /> AI 動態推播（{decision?.ruleId ?? 'AD-DEFAULT'}）
                  </div>
                  <button onClick={() => startLevel(nextRecommendedLevel.id)} className="w-24 h-24 rounded-full bg-blue-50 border-4 border-blue-500 flex flex-col items-center justify-center shadow-lg shadow-blue-500/30 hover:scale-105 transition-transform group cursor-pointer">
                    <Play className="w-8 h-8 text-blue-600 group-hover:text-blue-700" />
                  </button>
                  <div className="mt-4 text-center bg-white border border-blue-100 p-3 rounded-xl shadow-sm max-w-[180px]">
                    <h3 className="font-bold text-slate-800 text-sm">{nextRecommendedLevel.name}</h3>
                    <div className="flex items-center justify-center mt-1 text-xs text-slate-500">
                      <Target className="w-3 h-3 mr-1 text-red-500" /> 訓練標的：{ABILITY_LABEL_MAP[nextRecommendedLevel.primarySkill]}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      )}

      {/* Student Workspace View */}
      {view === 'student' && (
        <main className="flex-1 flex overflow-hidden">
          <div className="flex-1 relative flex flex-col">
            <div className="absolute top-4 left-4 bg-white/90 backdrop-blur px-4 py-2 rounded-lg shadow-sm text-sm font-medium border border-slate-200 z-10 pointer-events-none">
              <div className="text-slate-500 uppercase tracking-wider text-xs font-bold mb-1 flex items-center"><Target className="w-3 h-3 mr-1" /> 訓練標的</div>
              <span className="font-bold text-blue-700">{currentLevel.name}</span>
            </div>
            {isSuccess && (
              <div className="absolute inset-0 bg-green-500/10 backdrop-blur-sm z-20 flex items-center justify-center">
                <div className="bg-white p-8 rounded-2xl shadow-xl flex flex-col items-center animate-in fade-in zoom-in">
                  <CheckCircle className="w-16 h-16 text-green-500 mb-4" />
                  <h2 className="text-2xl font-bold text-slate-800 mb-2">建構完成！</h2>
                  <p className="text-slate-600 mb-6">已成功複製目標形狀，系統正在更新您的能力模型。</p>
                  <button onClick={() => setView('path')} className="bg-blue-600 text-white px-8 py-3 rounded-lg font-bold hover:bg-blue-700 transition-colors shadow-md shadow-blue-600/20 text-lg">
                    獲取下一階段 AI 推播
                  </button>
                </div>
              </div>
            )}
            <div className="flex-1">
              <Scene3D blocks={blocks} gridSize={currentLevel.gridSize} onAddBlock={handleAddBlock} onRemoveBlock={handleRemoveBlock}
                onLogCamera={() => logEvent('ROTATE_CAMERA', {})} />
            </div>
            <div className="h-16 bg-white border-t border-slate-200 flex items-center justify-between px-6 z-10">
              <div className="flex space-x-4">
                <button onClick={() => { setBlocksHistory(prev => [...prev, blocks]); setBlocks([]); logEvent('RESET', { all: true }); }} className="flex items-center space-x-2 text-slate-600 hover:text-red-600 text-sm font-medium"><Trash2 className="w-4 h-4" /><span>全部清除</span></button>
                <div className="w-px h-6 bg-slate-300"></div>
                <button onClick={handleUndo} disabled={blocksHistory.length === 0} className={`flex items-center space-x-2 text-sm font-medium transition-colors ${blocksHistory.length === 0 ? 'text-slate-300 cursor-not-allowed' : 'text-slate-600 hover:text-blue-600'}`}><Undo2 className="w-4 h-4" /><span>回上一步</span></button>
              </div>
              <button onClick={requestTutor} className="flex items-center space-x-2 bg-indigo-600 text-white hover:bg-indigo-700 px-5 py-2 rounded-lg font-semibold transition-colors shadow-sm"><BrainCircuit className="w-5 h-5" /><span>啟動 AI Tutor 診斷</span></button>
            </div>
          </div>

          {/* RIGHT: Target + AI Tutor */}
          <div className="w-[450px] bg-white flex flex-col shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.05)] z-20">
            <div className="h-64 border-b border-slate-200 relative bg-slate-50 flex flex-col">
              <div className="p-3 flex items-center justify-between border-b border-slate-200 bg-white z-10">
                <div className="flex items-center space-x-2"><Eye className="w-4 h-4 text-slate-500" /><h2 className="font-semibold text-slate-700 text-sm">目標模型參考</h2></div>
                <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-1 rounded">可拖曳旋轉</span>
              </div>
              <div className="flex-1 relative cursor-grab active:cursor-grabbing">
                <Scene3D blocks={currentLevel.targets.map((b, i) => ({ ...b, id: `t-${i}`, color: '#9ca3af' }))} readOnly gridSize={currentLevel.gridSize} />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto bg-slate-50 p-4">
              <div className="flex items-center space-x-2 mb-4">
                <BrainCircuit className="w-5 h-5 text-indigo-600" />
                <h2 className="font-semibold text-slate-800">AI Tutor（可解釋 AI 教學代理）</h2>
              </div>
              <TutorPanel
                xaiFeedback={xaiFeedback}
                topDiagnosis={diagnoses[0]}
                fallbackAbility={currentLevel.primarySkill}
                onReflectionAnswered={handleReflectionAnswered}
              />
            </div>
          </div>
        </main>
      )}

      {/* Teacher / Learning Analytics Dashboard */}
      {view === 'teacher' && (
        <main className="flex-1 bg-slate-100 p-6 overflow-y-auto">
          <div className="max-w-7xl mx-auto space-y-6">
            <div className="flex justify-between items-end bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <div>
                <h2 className="text-2xl font-bold text-slate-800 flex items-center"><BarChart3 className="w-6 h-6 mr-2 text-indigo-600" /> 學習分析儀表板 (Learning Analytics)</h2>
                <p className="text-slate-500 mt-1">完整呈現 Event → Feature → Pattern → Diagnosis → Player Model → Decision → XAI 資料流。</p>
              </div>
              <div className="flex space-x-2">
                <button onClick={handleExportEvents} className="bg-indigo-50 border border-indigo-200 text-indigo-700 px-4 py-2 rounded-lg font-bold shadow-sm hover:bg-indigo-100 flex items-center space-x-2 transition-colors">
                  <FileDown className="w-4 h-4" /> <span>匯出事件 (.CSV)</span>
                </button>
                <button onClick={handleExportModel} className="bg-purple-50 border border-purple-200 text-purple-700 px-4 py-2 rounded-lg font-bold shadow-sm hover:bg-purple-100 flex items-center space-x-2 transition-colors">
                  <BookOpen className="w-4 h-4" /> <span>匯出模型 (.JSON)</span>
                </button>
                {completedLevels.length === LEVEL_POOL.length && (
                  <button onClick={finishExperiment} className="bg-green-50 border border-green-200 text-green-700 px-4 py-2 rounded-lg font-bold shadow-sm hover:bg-green-100 flex items-center space-x-2 transition-colors">
                    <ClipboardCheck className="w-4 h-4" /> <span>產生學習報告</span>
                  </button>
                )}
              </div>
            </div>

            {/* AI Reasoning Pipeline Visualization */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <h3 className="font-bold text-slate-800 mb-4 flex items-center"><GitBranch className="w-5 h-5 mr-2 text-indigo-500" /> AI 推理鏈 (Behavior Reasoning Pipeline)</h3>
              <div className="flex flex-wrap items-stretch gap-2 text-xs">
                {['Event Log', 'Feature Extraction', 'Pattern Recognition', 'Cognitive Diagnosis', 'Player Model Update', 'Adaptive Decision', 'Explainable AI'].map((stage, i) => (
                  <React.Fragment key={stage}>
                    <div className="flex-1 min-w-[110px] bg-indigo-50 border border-indigo-100 rounded-lg p-3 text-center">
                      <div className="font-bold text-indigo-700">{stage}</div>
                      <div className="text-indigo-400 mt-1">
                        {i === 0 && `${logs.length} 筆`}
                        {i === 1 && `${Object.keys(behaviorFeatures).length} 維特徵`}
                        {i === 2 && `${patterns.length} 個模式`}
                        {i === 3 && `${diagnoses.length} 項診斷`}
                        {i === 4 && `${evidenceTrail.length} 條證據`}
                        {i === 5 && (decision ? decision.ruleId : '—')}
                        {i === 6 && (xaiFeedback ? '已產生' : '待觸發')}
                      </div>
                    </div>
                    {i < 6 && <div className="flex items-center text-slate-300">→</div>}
                  </React.Fragment>
                ))}
              </div>
            </div>

            {/* Behavior Pattern & Cognitive Diagnosis */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h3 className="font-bold text-slate-800 mb-4">Behavior Pattern Recognition</h3>
                {patterns.length === 0 ? <p className="text-sm text-slate-400">尚未偵測到明顯行為模式。</p> : (
                  <div className="space-y-2">
                    {patterns.map(p => (
                      <div key={p.id} className="border border-slate-100 rounded-lg p-3 bg-slate-50">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-sm text-slate-700">{p.name}</span>
                          <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded font-mono">{(p.strength * 100).toFixed(0)}%</span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">{p.description}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h3 className="font-bold text-slate-800 mb-4">Cognitive Diagnosis Engine</h3>
                {diagnoses.length === 0 ? <p className="text-sm text-slate-400">尚未產生診斷結果。</p> : (
                  <div className="space-y-2">
                    {diagnoses.map(d => (
                      <div key={d.ruleId} className="border border-slate-100 rounded-lg p-3 bg-slate-50">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-sm text-slate-700">{d.label}</span>
                          <span className={`text-xs px-2 py-0.5 rounded font-mono ${d.severity === 'high' ? 'bg-red-100 text-red-700' : d.severity === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>{d.severity}</span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">規則 {d.ruleId} · 信心 {d.confidence}% · {d.evidenceSummary}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Player Model Update Evidence Trail */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <h3 className="font-bold text-slate-800 mb-4">Player Model Update — 公式化證據追蹤</h3>
              {evidenceTrail.length === 0 ? <p className="text-sm text-slate-400">尚無更新紀錄。</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="text-slate-400 border-b border-slate-100">
                        <th className="py-2 pr-4">能力</th><th className="py-2 pr-4">公式</th><th className="py-2 pr-4">變化</th>
                      </tr>
                    </thead>
                    <tbody>
                      {evidenceTrail.map((e, i) => (
                        <tr key={i} className="border-b border-slate-50">
                          <td className="py-2 pr-4 font-bold text-slate-700">{ABILITY_LABEL_MAP[e.ability] || e.ability}</td>
                          <td className="py-2 pr-4 font-mono text-slate-500">{e.formula}</td>
                          <td className={`py-2 pr-4 font-mono ${e.delta >= 0 ? 'text-green-600' : 'text-red-600'}`}>{e.before.toFixed(1)} → {e.after.toFixed(1)} ({e.delta >= 0 ? '+' : ''}{e.delta.toFixed(1)})</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Adaptive Decision Table */}
            {decision && (
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h3 className="font-bold text-slate-800 mb-2">Adaptive Decision Engine — 命中規則</h3>
                <div className="bg-slate-50 border border-slate-100 rounded-lg p-4 text-sm font-mono text-slate-700">
                  <div>{decision.ruleId}: {decision.condition}</div>
                  <div className="text-indigo-600 mt-1">{decision.action}</div>
                </div>
              </div>
            )}

            {/* Behavior Feature Profiling */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <h3 className="font-bold text-slate-800 mb-4 flex items-center"><Activity className="w-5 h-5 mr-2 text-blue-500" /> 即時行為特徵剖析 (Behavior Features)</h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {[
                  ['建構錯誤率', `${(behaviorFeatures.errorRate * 100).toFixed(1)}%`],
                  ['視角旋轉頻率', behaviorFeatures.rotationFrequency.toFixed(1)],
                  ['初始規劃時間', `${behaviorFeatures.planningTime.toFixed(1)}s`],
                  ['建構間隔速度', `${behaviorFeatures.constructionSpeed.toFixed(1)}s`],
                  ['最長閒置時間', `${behaviorFeatures.idleTime.toFixed(1)}s`],
                ].map(([label, val]) => (
                  <div key={label} className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                    <div className="text-xs text-slate-500 font-bold mb-1">{label}</div>
                    <div className="text-2xl font-black text-slate-700">{val}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 md:col-span-1 relative">
                <div className="absolute top-6 right-6 bg-green-100 text-green-700 text-xs font-bold px-2 py-1 rounded border border-green-200">系統信心指數: {playerModel.confidence.toFixed(0)}%</div>
                <h3 className="font-bold text-slate-800 mb-4 flex items-center"><User className="w-5 h-5 mr-2 text-purple-600" /> 特徵驅動玩家模型</h3>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="65%" data={[
                      { subject: '心理旋轉', A: playerModel.mentalRotation, fullMark: 100 },
                      { subject: '空間視覺', A: playerModel.spatialVisualization, fullMark: 100 },
                      { subject: '視角轉換', A: playerModel.perspectiveTaking, fullMark: 100 },
                      { subject: '邏輯規劃', A: playerModel.planning, fullMark: 100 },
                      { subject: '工作記憶', A: playerModel.workingMemory, fullMark: 100 },
                      { subject: '堅持度', A: playerModel.persistence, fullMark: 100 },
                    ]}>
                      <PolarGrid stroke="#e2e8f0" />
                      <PolarAngleAxis dataKey="subject" tick={{ fill: '#475569', fontSize: 11, fontWeight: 'bold' }} />
                      <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                      <Radar name="估計值" dataKey="A" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.5} />
                      <Tooltip />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 md:col-span-2">
                <h3 className="font-bold text-slate-800 mb-4 flex items-center"><TrendingUp className="w-5 h-5 mr-2 text-blue-600" /> 認知發展軌跡與系統信心 (Timeline)</h3>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={modelHistory} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="time" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                      <YAxis domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                      <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0' }} />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                      <Line type="monotone" dataKey="spatialVisualization" name="空間視覺化" stroke="#3b82f6" strokeWidth={2.5} dot={false} />
                      <Line type="monotone" dataKey="perspectiveTaking" name="視角轉換" stroke="#8b5cf6" strokeWidth={2.5} dot={false} />
                      <Line type="monotone" dataKey="planning" name="邏輯規劃" stroke="#10b981" strokeWidth={2.5} dot={false} />
                      <Line type="monotone" dataKey="confidence" name="系統信心指數" stroke="#ef4444" strokeWidth={2} dot={false} strokeDasharray="5 5" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Event Log Stream */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                <h3 className="font-bold text-slate-800 flex items-center"><Database className="w-5 h-5 mr-2 text-slate-500" /> 原始行為日誌 (Raw Event Stream)</h3>
                <span className="text-xs bg-slate-200 text-slate-700 px-3 py-1 rounded-full font-mono font-bold">{logs.length} 筆事件</span>
              </div>
              <div className="h-64 overflow-y-auto p-0">
                <table className="w-full text-left text-sm">
                  <thead className="bg-white sticky top-0 border-b border-slate-100 shadow-sm z-10">
                    <tr>
                      <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">時間戳記</th>
                      <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">動作類型</th>
                      <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">酬載數據 (Payload)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono text-xs">
                    {logs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-3 text-slate-500">{new Date(log.timestamp).toISOString().split('T')[1].slice(0, -1)}</td>
                        <td className="px-6 py-3">
                          <span className={`px-2 py-1 rounded-md border font-bold ${
                            log.type === 'ERROR' ? 'bg-red-50 border-red-200 text-red-700' :
                            log.type === 'HINT_REQUEST' ? 'bg-amber-50 border-amber-200 text-amber-700' :
                            log.type === 'PLACE_BLOCK' ? 'bg-blue-50 border-blue-200 text-blue-700' :
                            log.type === 'REMOVE_BLOCK' || log.type === 'UNDO' ? 'bg-orange-50 border-orange-200 text-orange-700' :
                            log.type === 'SUBMIT' ? 'bg-green-50 border-green-200 text-green-700' :
                            log.type === 'REFLECTION_ANSWER' ? 'bg-purple-50 border-purple-200 text-purple-700' :
                            'bg-slate-100 border-slate-200 text-slate-700'
                          }`}>{log.type}</span>
                        </td>
                        <td className="px-6 py-3 text-slate-600 break-all">{JSON.stringify(log.payload)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </main>
      )}

      {/* Learning Report View */}
      {view === 'report' && learningReport && (
        <main className="flex-1 bg-slate-100 p-6 overflow-y-auto">
          <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 p-8 space-y-6">
            <h2 className="text-2xl font-bold text-slate-800">AI 學習報告 (Learning Report)</h2>
            <p className="text-sm text-slate-500">產生時間：{new Date(learningReport.generatedAt).toLocaleString()}</p>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-100"><div className="text-xs text-slate-400">完成關卡數</div><div className="text-xl font-bold">{learningReport.levelsCompleted}</div></div>
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-100"><div className="text-xs text-slate-400">總事件數</div><div className="text-xl font-bold">{learningReport.totalEvents}</div></div>
              {preTestResult && <div className="bg-slate-50 p-4 rounded-lg border border-slate-100"><div className="text-xs text-slate-400">前測分數</div><div className="text-xl font-bold">{preTestResult.score}</div></div>}
              {postTestResult && <div className="bg-slate-50 p-4 rounded-lg border border-slate-100"><div className="text-xs text-slate-400">後測分數</div><div className="text-xl font-bold">{postTestResult.score}</div></div>}
            </div>
            <div>
              <h3 className="font-bold text-slate-700 mb-2">優勢能力</h3>
              <div className="flex space-x-2">{learningReport.strengths.map(s => <span key={s} className="bg-green-50 text-green-700 border border-green-200 px-3 py-1 rounded-full text-sm font-bold">{ABILITY_LABEL_MAP[s]}</span>)}</div>
            </div>
            <div>
              <h3 className="font-bold text-slate-700 mb-2">待加強能力</h3>
              <div className="flex space-x-2">{learningReport.weaknesses.map(s => <span key={s} className="bg-red-50 text-red-700 border border-red-200 px-3 py-1 rounded-full text-sm font-bold">{ABILITY_LABEL_MAP[s]}</span>)}</div>
            </div>
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 text-indigo-800 text-sm font-medium">{learningReport.recommendation}</div>
            <button onClick={handleExportModel} className="w-full bg-indigo-600 text-white py-3 rounded-lg font-bold hover:bg-indigo-700">匯出完整研究數據</button>
          </div>
        </main>
      )}
    </div>
  );
}
