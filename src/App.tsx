import React, { useState, useEffect, useMemo, useRef } from 'react';
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
import {
  TutorPanel,
  TutorObservationPayload,
} from './components/TutorPanel';
import AbilityTrendChart from './components/analytics/AbilityTrendChart';
import EventTimeline from './components/analytics/EventTimeline';
import HintEffectPanel from './components/analytics/HintEffectPanel';
import DecisionHistoryPanel from './components/analytics/DecisionHistoryPanel';
import PlayerModelSnapshotTable from './components/analytics/PlayerModelSnapshotTable';
import KnowledgeEvolutionTimeline from './components/analytics/KnowledgeEvolutionTimeline';
import { LEVEL_POOL } from './data/levels';
import {
  Block,
  EventLog,
  EventType,
  PlayerModel,
  BehaviorFeatures,
  BehaviorVector,
  CognitiveDiagnosis,
  AdaptiveDecision,
  XAIFeedback,
  XAIResult,
  AssessmentResult,
  GroupAssignment,
  LearningReport,
  PlayerModelSnapshot,
  DynamicMetricStateMap,
  PlayerModelMetricKey,
  PlayerModelSnapshotTrigger,
  TutorInterventionWindow,
  ConstructionEvaluation,
  TutorObjectiveResult,
  TutorSelfReportedResult,
  ResearchSessionData,
  Position,
  AdaptiveDecisionHistoryEntry,
} from './types';

import { extractFeatures } from './engines/behaviorFeatureExtractor';
import { recognizeBehaviorVector } from './engines/behaviorPatternRecognizer';
import { diagnose } from './engines/cognitiveDiagnosisEngine';
import {
  createInitialPlayerModel,
  inferPlayerModel,
  PlayerMetricPrediction,
} from './engines/machineLearningPlayerModel';
import {
  decideWithEvidence,
  selectNextLevel,
  AdaptiveDecisionResult,
} from './engines/adaptiveDecisionEngine';
import {
  generateDetailedXAI,
} from './engines/xaiEngine';
import {
  createInitialKnowledgeState,
  createLevelKnowledgeObservations,
  updateMultipleKnowledgeStates,
  KnowledgeTracingState,
  KnowledgeTracingEvidence,
} from './engines/knowledgeTracingEngine';
import { generateLearningReport } from './engines/learningReportEngine';
import { assignGroup, exportEventsToCSV, downloadTextFile } from './engines/researchModule';

type ViewMode = 'pre-assessment' | 'path' | 'student' | 'teacher' | 'post-assessment' | 'report';
const ABILITY_LABEL_MAP: Record<string, string> = {
  mentalRotation: '心理旋轉',
  spatialVisualization: '空間視覺化',
  perspectiveTaking: '視角轉換',
  planning: '邏輯規劃',
  workingMemory: '工作記憶',
  persistence: '堅持度',
};

const ABILITY_KEYS = [
  'mentalRotation',
  'spatialVisualization',
  'perspectiveTaking',
  'planning',
  'workingMemory',
  'persistence',
] as const;

const EMPTY_BEHAVIOR_FEATURES: BehaviorFeatures = {
  planningTime: 0,
  idleTime: 0,
  errorRate: 0,
  retryRate: 0,
  rotationFrequency: 0,
  viewSwitchFrequency: 0,
  constructionSpeed: 0,
  hintDependencyRate: 0,
  constructionOrderScore: 0.5,
  totalTime: 0,
  averageResponseTime: 0,
  firstCorrectTime: 0,
  totalErrors: 0,
  totalRetries: 0,
  successRate: 0,
  completionRate: 0,
  cameraRotationCount: 0,
  cameraZoomCount: 0,
  cameraMoveCount: 0,
  averageRotationAngle: 0,
  averageZoomDistance: 0,
  blockPlacementCount: 0,
  blockMoveCount: 0,
  blockRotationCount: 0,
  blockRemovalCount: 0,
  blockReplacementCount: 0,
  undoCount: 0,
  redoCount: 0,
  hintRequestCount: 0,
  hintReadingTime: 0,
  hoverTime: 0,
  dragDistance: 0,
  explorationDistance: 0,
  attentionSwitchCount: 0,
  perspectiveChangeCount: 0,
  sequenceConsistency: 0.5,
  planningScore: 0.5,
  explorationScore: 0.5,
  persistenceScore: 0.5,
  efficiencyScore: 0.5,
  confidenceScore: 0.5,
  helpSeekingScore: 0,
  cognitiveLoadEstimate: 0.5,
};

const EMPTY_BEHAVIOR_VECTOR: BehaviorVector = {
  exploration: 0.5,
  planning: 0.5,
  persistence: 0.5,
  confidence: 0.5,
  impulsiveness: 0.5,
  efficiency: 0.5,
  helpSeeking: 0,
  reflection: 0.5,
};

function createId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2, 11);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function toPositionKey(position: Position): string {
  return `${position.x},${position.y},${position.z}`;
}

function evaluateConstruction(
  currentBlocks: Position[],
  targetBlocks: Position[],
  gridSize: number,
): ConstructionEvaluation {
  let bestCorrect = 0;
  let bestIncorrect = currentBlocks.length;

  for (let dx = -gridSize; dx <= gridSize; dx += 1) {
    for (let dz = -gridSize; dz <= gridSize; dz += 1) {
      const shiftedTarget = new Set(
        targetBlocks.map(target =>
          toPositionKey({ x: target.x + dx, y: target.y, z: target.z + dz }),
        ),
      );
      const currentSet = new Set(currentBlocks.map(toPositionKey));
      const correct = [...currentSet].filter(key => shiftedTarget.has(key)).length;
      const incorrect = [...currentSet].filter(key => !shiftedTarget.has(key)).length;

      if (correct > bestCorrect || (correct === bestCorrect && incorrect < bestIncorrect)) {
        bestCorrect = correct;
        bestIncorrect = incorrect;
      }
    }
  }

  const missingBlocks = Math.max(0, targetBlocks.length - bestCorrect);
  const completionRate = targetBlocks.length === 0 ? 0 : bestCorrect / targetBlocks.length;
  const precision = currentBlocks.length === 0 ? 0 : bestCorrect / currentBlocks.length;

  return {
    totalTargetBlocks: targetBlocks.length,
    totalCurrentBlocks: currentBlocks.length,
    correctBlocks: bestCorrect,
    incorrectBlocks: bestIncorrect,
    missingBlocks,
    completionRate: clamp01(completionRate),
    precision: clamp01(precision),
    exactMatch:
      targetBlocks.length > 0 &&
      bestCorrect === targetBlocks.length &&
      bestIncorrect === 0 &&
      currentBlocks.length === targetBlocks.length,
  };
}

function evaluateTutorOutcome(
  before: ConstructionEvaluation,
  after: ConstructionEvaluation,
): {
  result: TutorObjectiveResult;
  improvementScore: number;
  evidence: string[];
} {
  const completionGain = after.completionRate - before.completionRate;
  const incorrectReduction = before.incorrectBlocks - after.incorrectBlocks;
  const precisionGain = after.precision - before.precision;
  const improvementScore = clamp01(
    completionGain * 0.65 +
    Math.max(0, precisionGain) * 0.2 +
    Math.max(0, incorrectReduction) * 0.1,
  );

  let result: TutorObjectiveResult = 'NO_IMPROVEMENT';
  if (after.exactMatch) {
    result = 'SUCCESS';
  } else if (completionGain >= 0.1 || incorrectReduction >= 1 || precisionGain >= 0.15) {
    result = 'PARTIAL';
  }

  const evidence = [
    `完成率 ${(before.completionRate * 100).toFixed(0)}% → ${(after.completionRate * 100).toFixed(0)}%`,
    `正確積木 ${before.correctBlocks} → ${after.correctBlocks}`,
    `錯誤積木 ${before.incorrectBlocks} → ${after.incorrectBlocks}`,
  ];

  return { result, improvementScore, evidence };
}

interface PipelineOptions {
  knowledgeObservations?: ReturnType<
    typeof createLevelKnowledgeObservations
  >;
  generateFeedback?: boolean;
  levelCompleted?: boolean;
  triggerEventId?: string;
  triggerType?: PlayerModelSnapshotTrigger;
  analysisLogs?: EventLog[];
  interventionId?: string;
  interventionOutcome?: TutorObjectiveResult;
}

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
  // Event → Feature → Behavior Vector → Probability Diagnosis
  // → Knowledge Tracing → ML Player Model → Decision Table → XAI
  const [behaviorFeatures, setBehaviorFeatures] =
    useState<BehaviorFeatures>(EMPTY_BEHAVIOR_FEATURES);
  const [behaviorVector, setBehaviorVector] =
    useState<BehaviorVector>(EMPTY_BEHAVIOR_VECTOR);
  const [diagnoses, setDiagnoses] = useState<CognitiveDiagnosis[]>([]);
  const [knowledgeState, setKnowledgeState] =
    useState<KnowledgeTracingState>(() =>
      createInitialKnowledgeState(participantId),
    );
  const [knowledgeEvidence, setKnowledgeEvidence] =
    useState<KnowledgeTracingEvidence[]>([]);
  const [playerModel, setPlayerModel] =
    useState<PlayerModel>(() => createInitialPlayerModel());
  const [modelPredictions, setModelPredictions] =
    useState<PlayerMetricPrediction[]>([]);
  const [playerModelConfidence, setPlayerModelConfidence] = useState(0);
  const [decisionResult, setDecisionResult] =
    useState<AdaptiveDecisionResult | null>(null);
  const [decision, setDecision] = useState<AdaptiveDecision | null>(null);
  const [xaiFeedback, setXaiFeedback] = useState<XAIFeedback | null>(null);
  const [xaiResult, setXaiResult] = useState<XAIResult | null>(null);
  const [isTutorReassessing, setIsTutorReassessing] = useState(false);
  const [playerModelHistory, setPlayerModelHistory] =
    useState<PlayerModelSnapshot[]>([]);
  const [decisionHistory, setDecisionHistory] =
    useState<AdaptiveDecisionHistoryEntry[]>([]);
  const [activeTutorIntervention, setActiveTutorIntervention] =
    useState<TutorInterventionWindow | null>(null);
  const [tutorInterventionHistory, setTutorInterventionHistory] =
    useState<TutorInterventionWindow[]>([]);
  const [learningReport, setLearningReport] =
    useState<LearningReport | null>(null);

  const currentLevel = useMemo(() => LEVEL_POOL.find(l => l.id === currentLevelId) || LEVEL_POOL[0], [currentLevelId]);

  const logsRef = useRef<EventLog[]>(logs);
  const playerModelRef = useRef<PlayerModel>(playerModel);
  const knowledgeStateRef =
    useRef<KnowledgeTracingState>(knowledgeState);
  const blocksRef = useRef<Block[]>(blocks);
  const activeTutorInterventionRef =
    useRef<TutorInterventionWindow | null>(activeTutorIntervention);

  useEffect(() => {
    logsRef.current = logs;
  }, [logs]);

  useEffect(() => {
    playerModelRef.current = playerModel;
  }, [playerModel]);

  useEffect(() => {
    knowledgeStateRef.current = knowledgeState;
  }, [knowledgeState]);

  useEffect(() => {
    blocksRef.current = blocks;
  }, [blocks]);

  useEffect(() => {
    activeTutorInterventionRef.current = activeTutorIntervention;
  }, [activeTutorIntervention]);

  // ==========================================================================
  // Complete AI Pipeline
  //
  // 一般事件：
  // Event → Feature → Behavior Vector → Diagnosis → Player Model → Decision
  //
  // 關卡完成／Tutor 回報：
  // Event → Feature → Behavior Vector → Diagnosis → Knowledge Tracing
  // → Player Model → Decision → XAI
  // ==========================================================================

  const runPipeline = (
    newLogs: EventLog[],
    options: PipelineOptions = {},
  ) => {
    const analysisLogs = options.analysisLogs ?? newLogs;
    const features = extractFeatures(analysisLogs);
    const vector = recognizeBehaviorVector(analysisLogs, features);
    const diags = diagnose(vector, features);

    let nextKnowledgeState = knowledgeStateRef.current;
    let nextKnowledgeEvidence: KnowledgeTracingEvidence[] = [];

    if (
      options.knowledgeObservations &&
      options.knowledgeObservations.length > 0
    ) {
      const tracingResult = updateMultipleKnowledgeStates(
        knowledgeStateRef.current,
        options.knowledgeObservations,
        features,
        vector,
        diags,
      );

      nextKnowledgeState = tracingResult.state;
      nextKnowledgeEvidence = tracingResult.updates;

      knowledgeStateRef.current = nextKnowledgeState;
      setKnowledgeState(nextKnowledgeState);
      setKnowledgeEvidence(nextKnowledgeEvidence);
    }

    const previousModel = playerModelRef.current;

    const playerModelResult = inferPlayerModel({
      features,
      behaviorVector: vector,
      diagnoses: diags,
      knowledgeState: nextKnowledgeState,
      previousPlayerModel: previousModel,
    });

    const nextModel = playerModelResult.playerModel;

    const nextDecisionResult = decideWithEvidence(
      nextModel,
      diags,
      {
        currentLevel,
        levelCompleted: options.levelCompleted,
        hintUsed: features.hintRequestCount > 0,
        hintRequestCount: features.hintRequestCount,
      },
    );

    const nextDecision = nextDecisionResult.decision;

    const recommendedLevel = selectNextLevel(
      nextDecision,
      nextModel,
      LEVEL_POOL,
      completedLevels,
      currentLevel,
    );

    setBehaviorFeatures(features);
    setBehaviorVector(vector);
    setDiagnoses(diags);
    playerModelRef.current = nextModel;
    setPlayerModel(nextModel);
    setModelPredictions(playerModelResult.predictions);
    setPlayerModelConfidence(playerModelResult.overallConfidence);
    setDecisionResult(nextDecisionResult);
    setDecision(nextDecision);

    const metricStates: DynamicMetricStateMap = {};
    playerModelResult.predictions.forEach(prediction => {
      const metric = prediction.metric as PlayerModelMetricKey;
      const previousSnapshot = [...playerModelHistory]
        .reverse()
        .find(item => item.metricStates[metric])
        ?.metricStates[metric];

      metricStates[metric] = {
        metric,
        value: prediction.updatedValue,
        previousValue: prediction.previousValue,
        change: prediction.delta,
        confidence: prediction.confidence,
        trend:
          prediction.delta > 0.01
            ? 'UP'
            : prediction.delta < -0.01
              ? 'DOWN'
              : 'STABLE',
        observations: (previousSnapshot?.observations ?? 0) + 1,
        lastUpdatedAt: Date.now(),
        evidenceIds: prediction.evidence.map((_, index) =>
          `${prediction.metric}-${Date.now()}-${index}`,
        ),
        evidenceSummary: prediction.evidence.map(item =>
          `${item.label}: ${(item.value * 100).toFixed(0)}% × ${item.weight.toFixed(2)}`,
        ),
      };
    });

    const snapshot: PlayerModelSnapshot = {
      id: createId(),
      timestamp: Date.now(),
      participantId,
      levelId: currentLevel.id,
      triggerEventId: options.triggerEventId,
      triggerType: options.triggerType ?? 'GAME_EVENT',
      model: { ...nextModel, knowledgeMastery: [...nextModel.knowledgeMastery] },
      metricStates,
      diagnoses: diags,
      behaviorFeatures: features,
      behaviorVector: vector,
      overallConfidence: playerModelResult.overallConfidence,
      previousMastery: previousModel.masteryLevel,
      currentMastery: nextModel.masteryLevel,
      masteryChange: nextModel.masteryLevel - previousModel.masteryLevel,
      decisionRuleId: nextDecision.ruleId,
      interventionId: options.interventionId,
    };

    setPlayerModelHistory(history => [...history, snapshot]);

    const decisionHistoryEntry: AdaptiveDecisionHistoryEntry = {
      id: createId(),
      timestamp: snapshot.timestamp,
      levelId: currentLevel.id,
      decision: nextDecision,
      diagnosisRuleIds: diags.map((diagnosis) => diagnosis.ruleId),
      playerModelSnapshotId: snapshot.id,
      interventionId: options.interventionId,
      outcome: options.interventionOutcome,
    };
    setDecisionHistory((history) => [...history, decisionHistoryEntry]);

    if (options.generateFeedback) {
      const detailedXAI = generateDetailedXAI({
        diagnoses: diags,
        decision: nextDecision,
        features,
        model: nextModel,
        behaviorVector: vector,
        context: {
          levelCompleted: options.levelCompleted,
          currentLevelId: currentLevel.id,
          currentLevelName: currentLevel.name,
          currentDifficulty: currentLevel.difficulty,
          recommendedLevelId: recommendedLevel?.id,
          recommendedLevelName: recommendedLevel?.name,
          nextDifficulty: recommendedLevel?.difficulty,
          decisionMatchingScore:
            nextDecisionResult.selectedRule.matchingScore,
          playerModelConfidence:
            playerModelResult.overallConfidence,
          knowledgeTracingEnabled: true,
        },
      });

      setXaiFeedback(detailedXAI.feedback);
      setXaiResult(detailedXAI.result);
    }

    return {
      features,
      behaviorVector: vector,
      diagnoses: diags,
      knowledgeState: nextKnowledgeState,
      knowledgeEvidence: nextKnowledgeEvidence,
      playerModel: nextModel,
      playerModelResult,
      decision: nextDecision,
      decisionResult: nextDecisionResult,
      recommendedLevel,
    };
  };

  const appendEvent = (
    type: EventType,
    payload: unknown,
  ): {
    event: EventLog;
    updatedLogs: EventLog[];
  } => {
    const event: EventLog = {
      id: createId(),
      timestamp: Date.now(),
      type,
      payload,
    };

    const updatedLogs = [event, ...logsRef.current];
    logsRef.current = updatedLogs;
    setLogs(updatedLogs);

    return {
      event,
      updatedLogs,
    };
  };

  const logEvent = (
    type: EventType,
    payload: unknown,
  ): void => {
    const { event, updatedLogs } = appendEvent(type, payload);

    if (updatedLogs.length >= 2) {
      runPipeline(updatedLogs, {
        triggerEventId: event.id,
        triggerType: 'GAME_EVENT',
      });
    }
  };

  // Player Model 歷程改由 runPipeline 事件驅動建立，避免固定時間重複取樣。

  // --- Adaptive Learning Path ---
  const nextRecommendedLevel = useMemo(() => {
    if (!decision) return LEVEL_POOL.find(l => !completedLevels.includes(l.id)) || null;
    return selectNextLevel(decision, playerModel, LEVEL_POOL, completedLevels, currentLevel);
  }, [decision, playerModel, completedLevels, currentLevel]);

  const startLevel = (levelId: string) => {
    setCurrentLevelId(levelId);
    setBlocks([]); setBlocksHistory([]); setIsSuccess(false); setXaiFeedback(null); setXaiResult(null);
    setView('student');
    logEvent('SESSION_START', { levelId, target: LEVEL_POOL.find(l => l.id === levelId)?.name });
  };

  // --- Explainable AI Trigger ---
  const requestTutor = (): void => {
    const { updatedLogs } = appendEvent('HINT_REQUEST', {
      levelId: currentLevel.id,
      requestedAt: Date.now(),
    });

    const pipeline = runPipeline(updatedLogs, {
      generateFeedback: true,
      triggerEventId: updatedLogs[0]?.id,
      triggerType: 'HINT_INTERVENTION',
    });

    // 將幾何差異加入學生可操作提示
    if (
      pipeline.decision.hintType === 'STRUCTURAL' ||
      pipeline.decision.hintType === 'PLANNING'
    ) {
      const geo = computeGeometricDiff();

      setXaiFeedback(previous => {
        if (!previous) return previous;

        let coordinateHint = '';

        if (geo.extraneous) {
          coordinateHint =
            `請先檢查位於 (${geo.extraneous.x}, ${geo.extraneous.y}, ${geo.extraneous.z}) 的方塊；` +
            '它可能不屬於目標結構。 ';
        } else if (geo.missing) {
          coordinateHint =
            `請檢查座標 (${geo.missing.x}, ${geo.missing.z})、高度 ${geo.missing.y} 是否缺少方塊。 `;
        }

        return {
          ...previous,
          hint: coordinateHint + previous.hint,
        };
      });
    }
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
    if (blocksRef.current.some((block) => block.x === x && block.y === y && block.z === z)) {
      return;
    }
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

      const nextCompleted = completedLevels.includes(currentLevelId)
        ? completedLevels
        : [...completedLevels, currentLevelId];

      if (!completedLevels.includes(currentLevelId)) {
        setCompletedLevels(nextCompleted);
      }

      const { event, updatedLogs } = appendEvent('SUBMIT', {
        success: true,
        completed: true,
        levelId: currentLevel.id,
        completionRate: 1,
        currentBlocks: currentBlocks.length,
        targetBlocks: currentLevel.targets.length,
      });

      const observations = createLevelKnowledgeObservations({
        primarySkill: currentLevel.primarySkill,
        secondarySkills: ['planning', 'workingMemory'],
        success: true,
        difficulty: currentLevel.difficulty,
        hintUsed: behaviorFeatures.hintRequestCount > 0,
        hintLevel:
          behaviorFeatures.hintRequestCount >= 3
            ? 3
            : behaviorFeatures.hintRequestCount === 2
              ? 2
              : behaviorFeatures.hintRequestCount === 1
                ? 1
                : 0,
        completionRate: 1,
        score: 1,
        levelId: currentLevel.id,
        observationId: event.id,
        timestamp: event.timestamp,
      });

      runPipeline(updatedLogs, {
        knowledgeObservations: observations,
        generateFeedback: true,
        levelCompleted: true,
        triggerEventId: event.id,
        triggerType: 'LEVEL_COMPLETED',
      });

      if (nextCompleted.length === LEVEL_POOL.length) {
        window.setTimeout(
          () => setView('post-assessment'),
          800,
        );
      }
    }
  };

  const handleReflectionAnswered = (question: string, answer: string) => {
    logEvent('REFLECTION_ANSWER', {
      question,
      answer,
      answerLength: answer.length,
      levelId: currentLevel.id,
    });
  };

  const handleApplyTutorHint = (
    cycle: number,
    hint: string,
  ): void => {
    const startedAt = Date.now();
    const beforeFeatures = extractFeatures(logsRef.current);
    const beforePositions = blocksRef.current.map(({ x, y, z }) => ({ x, y, z }));
    const beforeEvaluation = evaluateConstruction(
      beforePositions,
      currentLevel.targets,
      currentLevel.gridSize,
    );

    const intervention: TutorInterventionWindow = {
      id: createId(),
      cycle,
      levelId: currentLevel.id,
      startedAt,
      startEventIndex: logsRef.current.length,
      hint,
      hintLevel: cycle >= 3 ? 3 : cycle === 2 ? 2 : 1,
      hintType: decision?.hintType,
      beforeFeatures,
      beforeBlockPositions: beforePositions,
      beforeEvaluation,
    };

    activeTutorInterventionRef.current = intervention;
    setActiveTutorIntervention(intervention);

    appendEvent('TUTOR_INTERVENTION_START', {
      interventionId: intervention.id,
      cycle,
      levelId: currentLevel.id,
      hint,
    });

    appendEvent('HINT_READ', {
      interventionId: intervention.id,
      cycle,
      hint,
      levelId: currentLevel.id,
      readAt: startedAt,
    });
  };

  const handleTutorObservation = async (
    payload: TutorObservationPayload,
  ): Promise<void> => {
    setIsTutorReassessing(true);

    try {
      const intervention = activeTutorInterventionRef.current;
      const selfReportedResult = payload.result as TutorSelfReportedResult;
      const endedAt = Date.now();
      const afterPositions = blocksRef.current.map(({ x, y, z }) => ({ x, y, z }));
      const afterEvaluation = evaluateConstruction(
        afterPositions,
        currentLevel.targets,
        currentLevel.gridSize,
      );

      const fallbackBeforeFeatures = extractFeatures(logsRef.current);
      const effectiveIntervention: TutorInterventionWindow =
        intervention ?? {
          id: createId(),
          cycle: payload.cycle,
          levelId: currentLevel.id,
          startedAt: endedAt,
          startEventIndex: logsRef.current.length,
          hint: payload.hint,
          hintLevel: payload.cycle >= 3 ? 3 : payload.cycle === 2 ? 2 : 1,
          beforeFeatures: fallbackBeforeFeatures,
          beforeBlockPositions: afterPositions,
          beforeEvaluation: afterEvaluation,
        };

      const windowLogs = logsRef.current
        .filter(log => log.timestamp >= effectiveIntervention.startedAt)
        .sort((a, b) => a.timestamp - b.timestamp);
      const afterFeatures = extractFeatures(windowLogs);
      const beforeEvaluation =
        effectiveIntervention.beforeEvaluation ??
        evaluateConstruction(
          effectiveIntervention.beforeBlockPositions,
          currentLevel.targets,
          currentLevel.gridSize,
        );
      const outcome = evaluateTutorOutcome(beforeEvaluation, afterEvaluation);

      const { event, updatedLogs } = appendEvent('TUTOR_REASSESSMENT', {
        interventionId: effectiveIntervention.id,
        tutorCycle: payload.cycle,
        selfReportedResult,
        objectiveResult: outcome.result,
        improvementScore: outcome.improvementScore,
        evidence: outcome.evidence,
        reflectionAnswer: payload.reflectionAnswer,
        diagnosisRuleId: payload.diagnosis?.ruleId,
        levelId: currentLevel.id,
      });

      const completedIntervention: TutorInterventionWindow = {
        ...effectiveIntervention,
        endedAt,
        endEventIndex: updatedLogs.length,
        afterFeatures,
        afterBlockPositions: afterPositions,
        afterEvaluation,
        objectiveResult: outcome.result,
        selfReportedResult,
        improvementScore: outcome.improvementScore,
        evidence: outcome.evidence,
      };

      setTutorInterventionHistory(history => [
        ...history,
        completedIntervention,
      ]);
      activeTutorInterventionRef.current = null;
      setActiveTutorIntervention(null);

      const objectiveSuccess = outcome.result === 'SUCCESS';
      const observations = createLevelKnowledgeObservations({
        primarySkill: currentLevel.primarySkill,
        secondarySkills: ['planning', 'workingMemory'],
        success: objectiveSuccess,
        difficulty: currentLevel.difficulty,
        hintUsed: true,
        hintLevel: completedIntervention.hintLevel,
        completionRate: afterEvaluation.completionRate,
        score: clamp01(
          afterEvaluation.completionRate * 0.7 +
          afterEvaluation.precision * 0.3,
        ),
        levelId: currentLevel.id,
        observationId: event.id,
        timestamp: event.timestamp,
      });

      runPipeline(updatedLogs, {
        knowledgeObservations: observations,
        generateFeedback: true,
        levelCompleted: objectiveSuccess,
        triggerEventId: event.id,
        triggerType: 'TUTOR_REASSESSMENT',
        analysisLogs: windowLogs.length > 0 ? windowLogs : updatedLogs,
        interventionId: completedIntervention.id,
        interventionOutcome: outcome.result,
      });
    } finally {
      setIsTutorReassessing(false);
    }
  };

  const handleNextTask = (): void => {
    if (!nextRecommendedLevel) {
      setView('path');
      return;
    }

    startLevel(nextRecommendedLevel.id);
  };

  // --- Research Export ---
  const handleExportEvents = () => downloadTextFile(`${participantId}_events.csv`, exportEventsToCSV(logs), 'text/csv');
  const handleExportModel = () => {
    const researchData: ResearchSessionData = {
      schemaVersion: '3.0',
      exportedAt: Date.now(),
      participantId,
      group,
      events: logs,
      assessments: [preTestResult, postTestResult].filter(Boolean) as AssessmentResult[],
      finalPlayerModel: playerModel,
      playerModelHistory,
      tutorInterventions: tutorInterventionHistory,
      decisionHistory,
      completedLevelIds: completedLevels,
      metadata: { currentLevelId, playerModelConfidence },
    };

    downloadTextFile(
      `${participantId}_research-session.json`,
      JSON.stringify(researchData, null, 2),
      'application/json',
    );
  };

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
                xaiResult={xaiResult}
                topDiagnosis={diagnoses[0]}
                fallbackAbility={currentLevel.primarySkill}
                isReassessing={isTutorReassessing}
                maxCycles={3}
                onReflectionAnswered={handleReflectionAnswered}
                onApplyHint={handleApplyTutorHint}
                onObservationSubmitted={handleTutorObservation}
                onNextTask={handleNextTask}
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
                <p className="text-slate-500 mt-1">完整呈現 Event → Feature → Behavior Vector → Probability Diagnosis → Knowledge Tracing → ML Player Model → Decision Table → XAI 資料流。</p>
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
                {['Event Log', 'Feature Extraction', 'Behavior Vector', 'Probability Diagnosis', 'Knowledge Tracing', 'ML Player Model', 'Decision Table', 'Explainable AI'].map((stage, i) => (
                  <React.Fragment key={stage}>
                    <div className="flex-1 min-w-[110px] bg-indigo-50 border border-indigo-100 rounded-lg p-3 text-center">
                      <div className="font-bold text-indigo-700">{stage}</div>
                      <div className="text-indigo-400 mt-1">
                        {i === 0 && `${logs.length} 筆`}
                        {i === 1 && `${Object.keys(behaviorFeatures).length} 維特徵`}
                        {i === 2 && `${Object.keys(behaviorVector).length} 維向量`}
                        {i === 3 && `${diagnoses.length} 項診斷`}
                        {i === 4 && `${knowledgeState.totalObservations} 次更新`}
                        {i === 5 && `${modelPredictions.length} 項推論`}
                        {i === 6 && (decision ? decision.ruleId : '—')}
                        {i === 7 && (xaiFeedback ? '已產生' : '待觸發')}
                      </div>
                    </div>
                    {i < 7 && <div className="flex items-center text-slate-300">→</div>}
                  </React.Fragment>
                ))}
              </div>
            </div>

            {/* Behavior Pattern & Cognitive Diagnosis */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h3 className="font-bold text-slate-800 mb-4">
                  Behavior Vector Recognition
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {(Object.entries(behaviorVector) as Array<[string, number]>).map(([key, value]) => (
                    <div
                      key={key}
                      className="border border-slate-100 rounded-lg p-3 bg-slate-50"
                    >
                      <div className="flex justify-between items-center gap-2">
                        <span className="font-bold text-xs text-slate-700">
                          {key}
                        </span>
                        <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded font-mono">
                          {(value * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
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

            {/* Machine Learning Player Model Evidence */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <h3 className="font-bold text-slate-800 mb-4">
                Machine Learning Player Model — 推論證據
              </h3>
              {modelPredictions.length === 0 ? (
                <p className="text-sm text-slate-400">尚無模型推論紀錄。</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="text-slate-400 border-b border-slate-100">
                        <th className="py-2 pr-4">指標</th>
                        <th className="py-2 pr-4">公式</th>
                        <th className="py-2 pr-4">變化</th>
                        <th className="py-2 pr-4">信心</th>
                      </tr>
                    </thead>
                    <tbody>
                      {modelPredictions.map(prediction => (
                        <tr
                          key={prediction.metric}
                          className="border-b border-slate-50"
                        >
                          <td className="py-2 pr-4 font-bold text-slate-700">
                            {ABILITY_LABEL_MAP[prediction.metric] ?? prediction.metric}
                          </td>
                          <td className="py-2 pr-4 font-mono text-slate-500 max-w-[420px]">
                            {prediction.formula}
                          </td>
                          <td
                            className={`py-2 pr-4 font-mono ${
                              prediction.delta >= 0
                                ? 'text-green-600'
                                : 'text-red-600'
                            }`}
                          >
                            {(prediction.previousValue * 100).toFixed(1)} →{' '}
                            {(prediction.updatedValue * 100).toFixed(1)}
                            {' '}
                            ({prediction.delta >= 0 ? '+' : ''}
                            {(prediction.delta * 100).toFixed(1)})
                          </td>
                          <td className="py-2 pr-4 font-mono text-indigo-600">
                            {(prediction.confidence * 100).toFixed(0)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Knowledge Tracing Evidence */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <h3 className="font-bold text-slate-800 mb-4">
                Knowledge Tracing — 知識掌握追蹤
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-4">
                {ABILITY_KEYS.map(ability => {
                  const skill = knowledgeState.skills[ability];
                  return (
                  <div
                    key={skill.ability}
                    className="bg-slate-50 border border-slate-100 rounded-lg p-3"
                  >
                    <div className="text-[11px] font-bold text-slate-500">
                      {ABILITY_LABEL_MAP[skill.ability]}
                    </div>
                    <div className="text-xl font-black text-slate-700 mt-1">
                      {(skill.mastery * 100).toFixed(0)}%
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">
                      {skill.trend} · {skill.observations} 次
                    </div>
                  </div>
                  );
                })}
              </div>
              {knowledgeEvidence.length > 0 && (
                <div className="space-y-2">
                  {knowledgeEvidence.map(item => (
                    <div
                      key={`${item.ability}-${item.updatedMastery}`}
                      className="text-xs bg-indigo-50 border border-indigo-100 text-indigo-800 rounded-lg p-3"
                    >
                      {item.explanation}
                    </div>
                  ))}
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
                  {decisionResult && (
                    <div className="text-slate-500 mt-2">
                      Priority {decisionResult.selectedRule.priority} ·
                      Matching Score{' '}
                      {(decisionResult.selectedRule.matchingScore * 100).toFixed(0)}%
                    </div>
                  )}
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
                <div className="absolute top-6 right-6 bg-green-100 text-green-700 text-xs font-bold px-2 py-1 rounded border border-green-200">模型推論信心: {(playerModelConfidence * 100).toFixed(0)}%</div>
                <h3 className="font-bold text-slate-800 mb-4 flex items-center"><User className="w-5 h-5 mr-2 text-purple-600" /> 特徵驅動玩家模型</h3>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="65%" data={[
                      { subject: '心理旋轉', A: playerModel.mentalRotation * 100, fullMark: 100 },
                      { subject: '空間視覺', A: playerModel.spatialVisualization * 100, fullMark: 100 },
                      { subject: '視角轉換', A: playerModel.perspectiveTaking * 100, fullMark: 100 },
                      { subject: '邏輯規劃', A: playerModel.planning * 100, fullMark: 100 },
                      { subject: '工作記憶', A: playerModel.workingMemory * 100, fullMark: 100 },
                      { subject: '堅持度', A: playerModel.persistence * 100, fullMark: 100 },
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
                    <LineChart data={playerModelHistory.map(snapshot => ({
                      time: new Date(snapshot.timestamp).toLocaleTimeString(),
                      spatialVisualization: snapshot.model.spatialVisualization * 100,
                      perspectiveTaking: snapshot.model.perspectiveTaking * 100,
                      planning: snapshot.model.planning * 100,
                      confidence: snapshot.overallConfidence * 100,
                    }))} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
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

            {/* Research Analytics Modules */}
            <div className="space-y-6">
              <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-5">
                <h3 className="font-bold text-indigo-900">研究型歷程分析模組</h3>
                <p className="mt-1 text-sm text-indigo-700">
                  以實際 Pipeline 更新、Tutor 介入、決策規則與 BKT 歷程支援 RQ2、RQ3 與 RQ4。
                </p>
              </div>

              <AbilityTrendChart
                snapshots={playerModelHistory}
                title="1. Player Model History — 玩家模型演化"
                maxPoints={40}
              />

              <PlayerModelSnapshotTable
                snapshots={playerModelHistory}
                title="Player Model Snapshot — 每次推理快照"
                maxRows={60}
              />

              <HintEffectPanel
                interventions={tutorInterventionHistory}
                title="2. Tutor Intervention Analysis — 提示介入效果"
              />

              <DecisionHistoryPanel
                decisions={decisionHistory}
                snapshots={playerModelHistory}
                interventions={tutorInterventionHistory}
                title="3. Decision History — 自適應決策與後續效果"
              />

              <KnowledgeEvolutionTimeline
                knowledgeState={knowledgeState}
                title="4. Knowledge Evolution Timeline — 知識掌握演化"
                maxPoints={50}
              />

              <EventTimeline
                events={logs}
                title="事件時間軸 — 提示前後與 Tutor Cycle 脈絡"
                maxItems={100}
              />
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