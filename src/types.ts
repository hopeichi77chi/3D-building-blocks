// ============================================================================
// XAI-ASRITS 共用型別定義
// Explainable AI-based Adaptive Spatial Reasoning Intelligent Tutoring System
// Version 3.0 — Dynamic Player Model & Closed-loop Tutor Research Edition
// ============================================================================

// ---------------------------------------------------------------------------
// 0. Common Types
// ---------------------------------------------------------------------------

export interface Position {
  x: number;
  y: number;
  z: number;
}

export interface Block extends Position {
  id: string;
  color: string;
}

export type LearningTrend = 'UP' | 'STABLE' | 'DOWN';

export type ConfidenceLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export type NumericRange = number;

// ---------------------------------------------------------------------------
// 1. Learning Analytics Layer — Raw Events
// ---------------------------------------------------------------------------

export type EventType =
  | 'SESSION_START'
  | 'SESSION_END'
  | 'LEVEL_START'
  | 'LEVEL_COMPLETE'
  | 'PLACE_BLOCK'
  | 'REMOVE_BLOCK'
  | 'ROTATE_CAMERA'
  | 'ZOOM_CAMERA'
  | 'VIEW_TARGET'
  | 'MOVE_CAMERA'
  | 'SELECT_BLOCK'
  | 'MOVE_BLOCK'
  | 'ROTATE_BLOCK'
  | 'PLACE_SUCCESS'
  | 'PLACE_FAIL'
  | 'HINT_REQUEST'
  | 'HINT_READ'
  | 'HINT_APPLIED'
  | 'TUTOR_INTERVENTION_START'
  | 'TUTOR_INTERVENTION_END'
  | 'TUTOR_REASSESSMENT'
  | 'REFLECTION_ANSWER'
  | 'SUBMIT'
  | 'ERROR'
  | 'UNDO'
  | 'REDO'
  | 'RESET'
  | 'ASSESSMENT_START'
  | 'ASSESSMENT_COMPLETE'
  | 'LOGOUT';

export type EventPayload = unknown;

export interface EventLog {
  id: string;
  timestamp: number;
  type: EventType;
  payload: EventPayload;

  participantId?: string;
  sessionId?: string;
  levelId?: string;
  interventionId?: string;
  tutorCycle?: number;
}

// ---------------------------------------------------------------------------
// 2. Learning Analytics Feature Extraction
// ---------------------------------------------------------------------------

export interface BehaviorFeatures {
  // Original features
  planningTime: number;
  idleTime: number;
  errorRate: number;
  retryRate: number;
  rotationFrequency: number;
  viewSwitchFrequency: number;
  constructionSpeed: number;
  hintDependencyRate: number;
  constructionOrderScore: number;

  // Extended learning analytics
  totalTime: number;
  averageResponseTime: number;
  firstCorrectTime: number;
  totalErrors: number;
  totalRetries: number;
  successRate: number;
  completionRate: number;
  cameraRotationCount: number;
  cameraZoomCount: number;
  cameraMoveCount: number;
  averageRotationAngle: number;
  averageZoomDistance: number;
  blockPlacementCount: number;
  blockMoveCount: number;
  blockRotationCount: number;
  blockRemovalCount: number;
  blockReplacementCount: number;
  undoCount: number;
  redoCount: number;
  hintRequestCount: number;
  hintReadingTime: number;
  hoverTime: number;
  dragDistance: number;
  explorationDistance: number;
  attentionSwitchCount: number;
  perspectiveChangeCount: number;
  sequenceConsistency: number;
  planningScore: number;
  explorationScore: number;
  persistenceScore: number;
  efficiencyScore: number;
  confidenceScore: number;
  helpSeekingScore: number;
  cognitiveLoadEstimate: number;
}

export interface BehaviorFeatureWindow {
  startedAt: number;
  endedAt: number;
  eventCount: number;
  features: BehaviorFeatures;
}

// ---------------------------------------------------------------------------
// 3. Behavior Pattern Recognition
// ---------------------------------------------------------------------------

export type PatternId =
  | 'REPEATED_ROTATION'
  | 'REPEATED_TRIAL_ERROR'
  | 'BOTTOM_UP_STRATEGY'
  | 'HESITATION_IDLE'
  | 'HINT_OVERRELIANCE'
  | 'RAPID_TRIAL_ERROR'
  | 'SYSTEMATIC_PLANNING'
  | 'INSUFFICIENT_VIEW_CHECK'
  | 'HINT_EFFECTIVE'
  | 'HINT_INEFFECTIVE'
  | 'STRATEGY_SHIFT';

export interface BehaviorPattern {
  id: PatternId;
  name: string;
  description: string;
  strength: number;
  evidenceEventIds: string[];
}

export interface BehaviorVector {
  exploration: number;
  planning: number;
  persistence: number;
  confidence: number;
  impulsiveness: number;
  efficiency: number;
  helpSeeking: number;
  reflection: number;
}

// ---------------------------------------------------------------------------
// 4. Cognitive Diagnosis
// ---------------------------------------------------------------------------

export type AbilityKey =
  | 'mentalRotation'
  | 'spatialVisualization'
  | 'perspectiveTaking'
  | 'planning'
  | 'workingMemory'
  | 'persistence';

export type DiagnosisSeverity = 'low' | 'medium' | 'high';

export interface CognitiveDiagnosis {
  ruleId: string;
  ability: AbilityKey;
  label: string;
  severity: DiagnosisSeverity;
  confidence: number;
  triggeredBy: PatternId[];
  evidenceSummary: string;
}

// ---------------------------------------------------------------------------
// 5. Player Model
// ---------------------------------------------------------------------------

export interface PlayerModel {
  // Spatial ability
  mentalRotation: number;
  spatialVisualization: number;
  perspectiveTaking: number;
  planning: number;
  workingMemory: number;
  persistence: number;

  // Learning profile
  confidence: number;
  hintDependency: number;
  exploration: number;
  efficiency: number;
  helpSeeking: number;
  reflection: number;
  impulsiveness: number;
  selfRegulation: number;
  cognitiveLoad: number;
  engagement: number;
  motivation: number;

  // Knowledge tracing summary
  knowledgeMastery: number[];
  masteryLevel: number;
  predictedSuccessRate: number;
  learningTrend: LearningTrend;
}

/**
 * PlayerModel 中可進行數值推論、信心估計與趨勢追蹤的欄位。
 * 排除 knowledgeMastery 與 learningTrend，避免 DynamicMetricState
 * 對陣列或字串欄位產生不正確的型別。
 */
export type PlayerModelMetricKey =
  | AbilityKey
  | 'confidence'
  | 'hintDependency'
  | 'exploration'
  | 'efficiency'
  | 'helpSeeking'
  | 'reflection'
  | 'impulsiveness'
  | 'selfRegulation'
  | 'cognitiveLoad'
  | 'engagement'
  | 'motivation'
  | 'masteryLevel'
  | 'predictedSuccessRate';

export interface ModelUpdateContribution {
  feature: keyof BehaviorFeatures | 'diagnosis' | 'knowledgeTracing';
  weight: number;
  rawValue: number;
  contribution: number;
}

export interface ModelUpdateEvidence {
  ability: AbilityKey | 'hintDependency';
  formula: string;
  contributions: ModelUpdateContribution[];
  delta: number;
  before: number;
  after: number;
}

/**
 * 單一玩家模型指標的動態狀態。
 */
export interface DynamicMetricState {
  metric: PlayerModelMetricKey;
  value: number;
  previousValue: number;
  change: number;
  confidence: number;
  trend: LearningTrend;
  observations: number;
  lastUpdatedAt: number;
  evidenceIds: string[];
  evidenceSummary?: string[];
}

export type DynamicMetricStateMap = Partial<
  Record<PlayerModelMetricKey, DynamicMetricState>
>;

export type PlayerModelSnapshotTrigger =
  | 'INITIALIZATION'
  | 'GAME_EVENT'
  | 'LEVEL_COMPLETED'
  | 'HINT_INTERVENTION'
  | 'TUTOR_REASSESSMENT'
  | 'ASSESSMENT_UPDATE';

/**
 * 每次 AI Pipeline 更新後保存的完整玩家模型快照。
 */
export interface PlayerModelSnapshot {
  id: string;
  timestamp: number;
  participantId?: string;
  sessionId?: string;
  levelId: string;
  triggerEventId?: string;
  triggerType: PlayerModelSnapshotTrigger;

  model: PlayerModel;
  metricStates: DynamicMetricStateMap;

  diagnoses: CognitiveDiagnosis[];
  behaviorFeatures: BehaviorFeatures;
  behaviorVector: BehaviorVector;

  overallConfidence: number;
  previousMastery: number;
  currentMastery: number;
  masteryChange: number;

  decisionRuleId?: string;
  interventionId?: string;
}

// ---------------------------------------------------------------------------
// 6. Adaptive Decision
// ---------------------------------------------------------------------------

export type HintType =
  | 'STRUCTURAL'
  | 'PERSPECTIVE'
  | 'PLANNING'
  | 'MOTIVATIONAL'
  | 'NONE';

export type HintTiming = 'IMMEDIATE' | 'DELAYED';
export type HintDetailLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface AdaptiveDecision {
  ruleId: string;
  condition: string;
  action: string;
  hintType: HintType;
  hintTiming: HintTiming;
  hintDetailLevel: HintDetailLevel;
  difficultyAdjustment: -1 | 0 | 1;
  recommendedSkillFocus: AbilityKey;
}

export interface AdaptiveDecisionContext {
  previousHintEffective?: boolean;
  previousHintLevel?: number;
  interventionImprovementScore?: number;
  consecutiveNoImprovementCount?: number;
  previousDecisionRuleId?: string;
}

export interface AdaptiveDecisionHistoryEntry {
  id: string;
  timestamp: number;
  levelId: string;
  decision: AdaptiveDecision;
  diagnosisRuleIds: string[];
  playerModelSnapshotId?: string;
  interventionId?: string;
  outcome?: TutorObjectiveResult;
}

// ---------------------------------------------------------------------------
// 7. Explainable AI
// ---------------------------------------------------------------------------

export interface XAIFeedback {
  diagnosis: string;
  evidence: string;
  reason: string;
  confidence: number;
  relatedAbility: string;
  hint: string;
  alternativeStrategy: string;
  expectedImprovement: string;
  nextRecommendation: string;
}

export interface XAIResult {
  diagnosis: string;
  evidence: string[];
  reasoning: string;
  confidence: number;
  decisionRule: string;
  alternativeStrategy: string;
  recommendation: string;
  prediction: string;
}

// ---------------------------------------------------------------------------
// 8. Closed-loop AI Tutor
// ---------------------------------------------------------------------------

export type TutorStage =
  | 'DIAGNOSIS'
  | 'REFLECTION'
  | 'QUESTION'
  | 'HINT'
  | 'APPLY_HINT'
  | 'OBSERVATION'
  | 'REASSESSMENT'
  | 'NEXT_TASK';

export interface ReflectionExchange {
  question: string;
  studentAnswer?: string;
  followUp?: string;
}

export type TutorSelfReportedResult =
  | 'SUCCESS'
  | 'PARTIAL'
  | 'STILL_STUCK';

export type TutorObjectiveResult =
  | 'SUCCESS'
  | 'PARTIAL'
  | 'NO_IMPROVEMENT';

export interface TutorObservationPayload {
  selfReportedResult: TutorSelfReportedResult;
  interventionId: string;
  cycle: number;
  question: string;
  reflectionAnswer: string;
  diagnosis?: CognitiveDiagnosis;
  fallbackAbility: AbilityKey;
  hint: string;
}

export interface ConstructionEvaluation {
  totalTargetBlocks: number;
  totalCurrentBlocks: number;
  correctBlocks: number;
  incorrectBlocks: number;
  missingBlocks: number;
  completionRate: number;
  precision: number;
  exactMatch: boolean;
}

export interface TutorInterventionEvaluation {
  result: TutorObjectiveResult;
  beforeConstruction: ConstructionEvaluation;
  afterConstruction: ConstructionEvaluation;
  completionGain: number;
  errorRateChange: number;
  efficiencyChange: number;
  improvementScore: number;
  evidence: string[];
}

export interface TutorInterventionWindow {
  id: string;
  cycle: number;
  levelId: string;
  startedAt: number;
  endedAt?: number;
  startEventIndex: number;
  endEventIndex?: number;

  hint: string;
  hintLevel: 1 | 2 | 3;
  hintType?: HintType;

  beforeFeatures: BehaviorFeatures;
  afterFeatures?: BehaviorFeatures;

  beforeBlockPositions: Position[];
  afterBlockPositions?: Position[];

  beforeEvaluation?: ConstructionEvaluation;
  afterEvaluation?: ConstructionEvaluation;

  objectiveResult?: TutorObjectiveResult;
  selfReportedResult?: TutorSelfReportedResult;
  improvementScore?: number;
  evidence?: string[];

  playerModelSnapshotBeforeId?: string;
  playerModelSnapshotAfterId?: string;
}

// ---------------------------------------------------------------------------
// 9. Game
// ---------------------------------------------------------------------------

export interface Level {
  id: string;
  name: string;
  gridSize: number;
  difficulty: number;
  primarySkill: AbilityKey;
  targets: Position[];
}

// ---------------------------------------------------------------------------
// 10. Learning Report
// ---------------------------------------------------------------------------

export interface AbilityGrowthSummary {
  ability: AbilityKey;
  initialValue: number;
  finalValue: number;
  change: number;
  confidence: number;
  trend: LearningTrend;
}

export interface HintEffectSummary {
  totalInterventions: number;
  successfulInterventions: number;
  partiallyEffectiveInterventions: number;
  ineffectiveInterventions: number;
  effectivenessRate: number;
  averageImprovementScore: number;
}

export interface LearningReport {
  generatedAt: number;
  playerModel: PlayerModel;
  diagnoses: CognitiveDiagnosis[];
  strengths: AbilityKey[];
  weaknesses: AbilityKey[];
  levelsCompleted: number;
  totalEvents: number;
  recommendation: string;

  abilityGrowth?: AbilityGrowthSummary[];
  hintEffectSummary?: HintEffectSummary;
  mostFrequentDiagnosisRuleId?: string;
  mostFrequentDecisionRuleId?: string;
}

// ---------------------------------------------------------------------------
// 11. Research Module
// ---------------------------------------------------------------------------

export type GroupAssignment = 'CONTROL' | 'EXPERIMENTAL';

export interface AssessmentItem {
  id: string;
  question: string;
  imageHint: string;
  options: string[];
  correctIndex: number;
}

export interface AssessmentResult {
  phase: 'PRE' | 'POST';
  score: number;
  totalItems: number;
  correctItems: number;
  timestamp: number;
}

export interface ResearchSessionData {
  schemaVersion: string;
  exportedAt: number;
  participantId: string;
  sessionId?: string;
  group?: GroupAssignment;

  events: EventLog[];
  assessments: AssessmentResult[];

  finalPlayerModel: PlayerModel;
  playerModelHistory: PlayerModelSnapshot[];
  tutorInterventions: TutorInterventionWindow[];
  decisionHistory?: AdaptiveDecisionHistoryEntry[];

  completedLevelIds?: string[];
  metadata?: Record<string, unknown>;
}