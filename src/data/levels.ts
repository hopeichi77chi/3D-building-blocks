import { Level } from '../types';

// 依「想法.md」第 7 節：100 關 / 10 個能力階段 / 每階段 10 關
// 此處提供每一能力階段的代表關卡（可依 generator 規則擴充為完整 100 關）
export const LEVEL_POOL: Level[] = [
  { id: 'L1-BASIC', name: '基礎空間感知 (L型)', gridSize: 4, difficulty: 2, primarySkill: 'spatialVisualization',
    targets: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 1, z: 0 }] },
  { id: 'L2-PLAN', name: '結構規劃訓練 (橋樑)', gridSize: 4, difficulty: 4, primarySkill: 'planning',
    targets: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 2, z: 0 }, { x: 1, y: 2, z: 0 }, { x: 2, y: 2, z: 0 }, { x: 2, y: 1, z: 0 }, { x: 2, y: 0, z: 0 }] },
  { id: 'L3-ROT', name: '視角轉換強化 (立體螺旋)', gridSize: 5, difficulty: 6, primarySkill: 'perspectiveTaking',
    targets: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 2, y: 0, z: 1 }, { x: 2, y: 0, z: 2 }, { x: 2, y: 1, z: 2 }, { x: 1, y: 1, z: 2 }, { x: 0, y: 1, z: 2 }, { x: 0, y: 2, z: 2 }] },
  { id: 'L4-VIS', name: '深度視覺化 (空間金字塔)', gridSize: 5, difficulty: 8, primarySkill: 'spatialVisualization',
    targets: [{ x: 1, y: 0, z: 1 }, { x: 2, y: 0, z: 1 }, { x: 3, y: 0, z: 1 }, { x: 1, y: 0, z: 2 }, { x: 2, y: 0, z: 2 }, { x: 3, y: 0, z: 2 }, { x: 1, y: 0, z: 3 }, { x: 2, y: 0, z: 3 }, { x: 3, y: 0, z: 3 }, { x: 2, y: 1, z: 2 }] },
  { id: 'L5-COMPLEX', name: '綜合空間推理 (懸空核心)', gridSize: 5, difficulty: 10, primarySkill: 'planning',
    targets: [{ x: 2, y: 0, z: 2 }, { x: 2, y: 1, z: 2 }, { x: 1, y: 1, z: 2 }, { x: 3, y: 1, z: 2 }, { x: 2, y: 1, z: 1 }, { x: 2, y: 1, z: 3 }, { x: 2, y: 2, z: 1 }] },
  { id: 'L6-MENTALROT', name: '心理旋轉訓練 (鏡像結構)', gridSize: 5, difficulty: 5, primarySkill: 'mentalRotation',
    targets: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }, { x: 1, y: 1, z: 1 }, { x: 2, y: 1, z: 1 }] },
  { id: 'L7-MEMORY', name: '工作記憶挑戰 (隱藏後重建)', gridSize: 5, difficulty: 7, primarySkill: 'workingMemory',
    targets: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 2, y: 1, z: 0 }, { x: 1, y: 1, z: 0 }] },
  { id: 'L8-PERSIST', name: '毅力挑戰 (多層結構)', gridSize: 6, difficulty: 9, primarySkill: 'persistence',
    targets: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 1, y: 1, z: 0 }, { x: 2, y: 1, z: 0 }, { x: 1, y: 2, z: 0 }, { x: 1, y: 3, z: 0 }] },
];

export function getNextUnassignedDifficulty(existing: Level[]): number {
  return Math.min(10, existing.length + 1);
}
