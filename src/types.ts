// ============================================================================
// XAI-ASRITS 共用型別定義
// Explainable AI-based Adaptive Spatial Reasoning Intelligent Tutoring System
// ============================================================================

export type Position = { x: number; y: number; z: number };
export type Block = Position & { id: string; color: string };

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
  | 'HINT_REQUEST'
  | 'HINT_READ'
  | 'REFLECTION_ANSWER'
  | 'SUBMIT'
  | 'ERROR'
  | 'UNDO'
  | 'RESET'
  | 'LOGOUT';

export interface EventLog {
  id: string;
  timestamp: number;
  type: EventType;
  payload: any;
}

// ---------------------------------------------------------------------------
// 2. Behavior Feature Extraction — 行為特徵（由 Event 萃取而來）
// ---------------------------------------------------------------------------
export interface BehaviorFeatures {
  planningTime: number;
  idleTime: number;
  errorRate: number;
  retryRate: number;
  rotationFrequency: number;
  viewSwitchFrequency: number;
  constructionSpeed: number;
  hintDependencyRate: number;
  constructionOrderScore: number;
}

// ---------------------------------------------------------------------------
// 3. Behavior Pattern Recognition — 行為模式辨識
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

// ---------------------------------------------------------------------------
// 4. Cognitive Diagnosis — 認知診斷
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
// 5. Player Model — 玩家能力模型（含證據追蹤）
// ---------------------------------------------------------------------------
export interface PlayerModel {
  mentalRotation: number;
  spatialVisualization: number;
  perspectiveTaking: number;
  planning: number;
  workingMemory: number;
  persistence: number;
  hintDependency: number;
  confidence: number;
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
// 6. Adaptive Decision — 自適應決策（Decision Table 輸出）
// ---------------------------------------------------------------------------
export type HintType = 'STRUCTURAL' | 'PERSPECTIVE' | 'PLANNING' | 'MOTIVATIONAL' | 'NONE';

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
// 7. Explainable AI Feedback — 可解釋回饋（八要素）
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

// ---------------------------------------------------------------------------
// 8. AI Tutor 對話流程 — Diagnosis -> Reflection -> Question -> Hint -> NextTask
// ---------------------------------------------------------------------------
export type TutorStage = 'DIAGNOSIS' | 'REFLECTION' | 'HINT' | 'NEXT_TASK';

export interface ReflectionExchange {
  question: string;
  studentAnswer?: string;
  followUp?: string;
}

// ---------------------------------------------------------------------------
// 9. Level / Game
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
// 11. Research Module — 前後測 / 分組
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
