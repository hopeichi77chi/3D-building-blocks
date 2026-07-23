// ============================================================================
// XAI-ASRITS 共用型別定義
// Explainable AI-based Adaptive Spatial Reasoning Intelligent Tutoring System
// Version 2.0 (Research Edition)
// ============================================================================

export type Position = { x: number; y: number; z: number };
export type Block = Position & {
  id: string;
  color: string;
};

// ---------------------------------------------------------------------------
// 1. Learning Analytics Layer — 原始事件
// ---------------------------------------------------------------------------

export type EventType =
  | 'SESSION_START'
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
  | 'REFLECTION_ANSWER'
  | 'SUBMIT'
  | 'ERROR'
  | 'UNDO'
  | 'REDO'
  | 'RESET'
  | 'LOGOUT';

export interface EventLog {
  id: string;
  timestamp: number;
  type: EventType;
  payload: any;
}

// ---------------------------------------------------------------------------
// 2. Learning Analytics Feature Extraction
// ---------------------------------------------------------------------------

export interface BehaviorFeatures {

  //-------------------------
  // Original Features
  //-------------------------

  planningTime: number;

  idleTime: number;

  errorRate: number;

  retryRate: number;

  rotationFrequency: number;

  viewSwitchFrequency: number;

  constructionSpeed: number;

  hintDependencyRate: number;

  constructionOrderScore: number;

  //-------------------------
  // Extended Learning Analytics
  //-------------------------

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
  | 'INSUFFICIENT_VIEW_CHECK';

export interface BehaviorPattern {

  id: PatternId;

  name: string;

  description: string;

  strength: number;

  evidenceEventIds: string[];

}

// 新增：Behavior Vector

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

export interface CognitiveDiagnosis {

  ruleId: string;

  ability: AbilityKey;

  label: string;

  severity: 'low' | 'medium' | 'high';

  confidence: number;

  triggeredBy: PatternId[];

  evidenceSummary: string;

}

// ---------------------------------------------------------------------------
// 5. Player Model
// ---------------------------------------------------------------------------

export interface PlayerModel {

  //-------------------
  // Spatial Ability
  //-------------------

  mentalRotation: number;

  spatialVisualization: number;

  perspectiveTaking: number;

  planning: number;

  workingMemory: number;

  persistence: number;

  //-------------------
  // Learning Profile
  //-------------------

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

  //-------------------
  // Knowledge Tracing
  //-------------------

  knowledgeMastery: number[];

  masteryLevel: number;

  predictedSuccessRate: number;

  learningTrend: 'UP' | 'STABLE' | 'DOWN';

}

export interface ModelUpdateContribution {

  feature: keyof BehaviorFeatures | 'diagnosis';

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

// ---------------------------------------------------------------------------
// 6. Adaptive Decision
// ---------------------------------------------------------------------------

export type HintType =
  | 'STRUCTURAL'
  | 'PERSPECTIVE'
  | 'PLANNING'
  | 'MOTIVATIONAL'
  | 'NONE';

export interface AdaptiveDecision {

  ruleId: string;

  condition: string;

  action: string;

  hintType: HintType;

  hintTiming: 'IMMEDIATE' | 'DELAYED';

  hintDetailLevel: 'LOW' | 'MEDIUM' | 'HIGH';

  difficultyAdjustment: -1 | 0 | 1;

  recommendedSkillFocus: AbilityKey;

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

// 新增：完整 XAI 八要素

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
// 8. AI Tutor
// ---------------------------------------------------------------------------

export type TutorStage =
  | 'DIAGNOSIS'
  | 'REFLECTION'
  | 'QUESTION'
  | 'HINT'
  | 'NEXT_TASK';

export interface ReflectionExchange {

  question: string;

  studentAnswer?: string;

  followUp?: string;

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

export interface LearningReport {

  generatedAt: number;

  playerModel: PlayerModel;

  diagnoses: CognitiveDiagnosis[];

  strengths: AbilityKey[];

  weaknesses: AbilityKey[];

  levelsCompleted: number;

  totalEvents: number;

  recommendation: string;

}

// ---------------------------------------------------------------------------
// 11. Research Module
// ---------------------------------------------------------------------------

export type GroupAssignment =
  | 'CONTROL'
  | 'EXPERIMENTAL';

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