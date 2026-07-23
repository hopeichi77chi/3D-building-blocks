import React, { useState, useRef } from 'react';
import { Block } from '../types';

// ============================================================================
// Scene3D — 輕量自製 3D 等角投影渲染器（純 SVG，無需 WebGL）
// ============================================================================

const shadeColor = (color: string, percent: number) => {
  let R = parseInt(color.substring(1, 3), 16);
  let G = parseInt(color.substring(3, 5), 16);
  let B = parseInt(color.substring(5, 7), 16);
  R = Math.floor((R * (100 + percent)) / 100);
  G = Math.floor((G * (100 + percent)) / 100);
  B = Math.floor((B * (100 + percent)) / 100);
  R = R < 255 ? R : 255; G = G < 255 ? G : 255; B = B < 255 ? B : 255;
  R = R > 0 ? R : 0; G = G > 0 ? G : 0; B = B > 0 ? B : 0;
  return '#' + [R, G, B].map(v => (v.toString(16).length === 1 ? '0' + v.toString(16) : v.toString(16))).join('');
};

const transformPoint = (x: number, y: number, z: number, yaw: number, pitch: number, zoom: number, gridSize: number) => {
  const cx = x - gridSize / 2, cy = y, cz = z - gridSize / 2;
  const x1 = cx * Math.cos(yaw) - cz * Math.sin(yaw);
  const z1 = cx * Math.sin(yaw) + cz * Math.cos(yaw);
  const y2 = cy * Math.cos(pitch) - z1 * Math.sin(pitch);
  const z2 = cy * Math.sin(pitch) + z1 * Math.cos(pitch);
  return { px: x1 * zoom, py: -y2 * zoom, depth: z2 };
};

const transformNormal = (nx: number, ny: number, nz: number, yaw: number, pitch: number) => {
  const nx1 = nx * Math.cos(yaw) - nz * Math.sin(yaw);
  const nz1 = nx * Math.sin(yaw) + nz * Math.cos(yaw);
  const ny2 = ny * Math.cos(pitch) - nz1 * Math.sin(pitch);
  const nz2 = ny * Math.sin(pitch) + nz1 * Math.cos(pitch);
  return { nx: nx1, ny: ny2, nz: nz2 };
};

const CUBE_FACES = [
  { normal: [0, 1, 0], vertices: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], colorOffset: 10 },
  { normal: [1, 0, 0], vertices: [[1, 1, 1], [1, 0, 1], [1, 0, 0], [1, 1, 0]], colorOffset: -10 },
  { normal: [0, 0, 1], vertices: [[0, 1, 1], [0, 0, 1], [1, 0, 1], [1, 1, 1]], colorOffset: -20 },
  { normal: [-1, 0, 0], vertices: [[0, 1, 0], [0, 0, 0], [0, 0, 1], [0, 1, 1]], colorOffset: -15 },
  { normal: [0, 0, -1], vertices: [[1, 1, 0], [1, 0, 0], [0, 0, 0], [0, 1, 0]], colorOffset: -25 },
  { normal: [0, -1, 0], vertices: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], colorOffset: -40 },
];

interface Scene3DProps {
  blocks: Block[];
  readOnly?: boolean;
  gridSize?: number;
  onAddBlock?: (x: number, y: number, z: number) => void;
  onRemoveBlock?: (id: string) => void;
  onLogCamera?: (yaw: number, pitch: number) => void;
}

export const Scene3D: React.FC<Scene3DProps> = ({ blocks, readOnly, gridSize = 4, onAddBlock, onRemoveBlock, onLogCamera }) => {
  const [cam, setCam] = useState({ yaw: Math.PI / 4, pitch: Math.PI / 6, zoom: 40 });
  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });

  const handlePointerMove = (e: React.PointerEvent) => {
    if (e.buttons > 0) {
      const dx = e.clientX - lastMouse.current.x;
      const dy = e.clientY - lastMouse.current.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) isDragging.current = true;
      setCam(prev => ({
        ...prev,
        yaw: prev.yaw - dx * 0.01,
        pitch: Math.max(-Math.PI / 2, Math.min(Math.PI / 2, prev.pitch + dy * 0.01)),
      }));
      lastMouse.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handlePointerUp = () => {
    if (isDragging.current && onLogCamera) onLogCamera(cam.yaw, cam.pitch);
    setTimeout(() => { isDragging.current = false; }, 50);
  };

  const handleFaceClick = (e: React.PointerEvent, nx: number, ny: number, nz: number, blockId: string | null) => {
    if (readOnly || isDragging.current) return;
    e.stopPropagation();
    if (e.shiftKey && blockId && onRemoveBlock) onRemoveBlock(blockId);
    else if (nx >= 0 && nx < gridSize && ny >= 0 && ny < gridSize && nz >= 0 && nz < gridSize && onAddBlock) onAddBlock(nx, ny, nz);
  };

  const renderElements: any[] = [];

  const axes = [
    { id: 'X', color: '#ef4444', p: [gridSize + 1, 0, 0] },
    { id: 'Y', color: '#22c55e', p: [0, gridSize + 1, 0] },
    { id: 'Z', color: '#3b82f6', p: [0, 0, gridSize + 1] },
  ];
  axes.forEach(axis => {
    const p1 = transformPoint(0, 0, 0, cam.yaw, cam.pitch, cam.zoom, gridSize);
    const p2 = transformPoint(axis.p[0], axis.p[1], axis.p[2], cam.yaw, cam.pitch, cam.zoom, gridSize);
    renderElements.push({ type: 'line', depth: (p1.depth + p2.depth) / 2, id: `axis-${axis.id}`, x1: p1.px, y1: p1.py, x2: p2.px, y2: p2.py, color: axis.color, text: axis.id });
  });

  for (let x = 0; x < gridSize; x++) {
    for (let z = 0; z < gridSize; z++) {
      const tNorm = transformNormal(0, 1, 0, cam.yaw, cam.pitch);
      if (tNorm.nz > -0.1) {
        const pts = [[0, 0, 1], [1, 0, 1], [1, 0, 0], [0, 0, 0]].map(v => transformPoint(x + v[0], 0, z + v[2], cam.yaw, cam.pitch, cam.zoom, gridSize));
        const center = transformPoint(x + 0.5, 0, z + 0.5, cam.yaw, cam.pitch, cam.zoom, gridSize);
        renderElements.push({
          type: 'poly', depth: center.depth, id: `grid-${x}-${z}`,
          points: pts.map(p => `${p.px},${p.py}`).join(' '), fill: '#f1f5f9', stroke: '#cbd5e1',
          onClick: (e: React.PointerEvent) => handleFaceClick(e, x, 0, z, null),
        });
      }
    }
  }

  const blockMap = new Set(blocks.map(b => `${b.x},${b.y},${b.z}`));
  blocks.forEach(b => {
    CUBE_FACES.forEach((face, fIdx) => {
      const nx = b.x + face.normal[0], ny = b.y + face.normal[1], nz = b.z + face.normal[2];
      if (blockMap.has(`${nx},${ny},${nz}`)) return;
      const tNorm = transformNormal(face.normal[0], face.normal[1], face.normal[2], cam.yaw, cam.pitch);
      if (tNorm.nz > 0.001) {
        const pts = face.vertices.map(v => transformPoint(b.x + v[0], b.y + v[1], b.z + v[2], cam.yaw, cam.pitch, cam.zoom, gridSize));
        const center = transformPoint(b.x + 0.5 + face.normal[0] * 0.5, b.y + 0.5 + face.normal[1] * 0.5, b.z + 0.5 + face.normal[2] * 0.5, cam.yaw, cam.pitch, cam.zoom, gridSize);
        renderElements.push({
          type: 'poly', depth: center.depth, id: `block-${b.id}-face-${fIdx}`,
          points: pts.map(p => `${p.px},${p.py}`).join(' '),
          fill: shadeColor(b.color, face.colorOffset), stroke: shadeColor(b.color, face.colorOffset - 10),
          onClick: (e: React.PointerEvent) => handleFaceClick(e, nx, ny, nz, b.id),
        });
      }
    });
  });

  renderElements.sort((a, b) => a.depth - b.depth);

  return (
    <svg
      width="100%" height="100%" viewBox="-200 -200 400 400"
      className={`overflow-hidden select-none touch-none ${readOnly ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'}`}
      onPointerDown={(e) => { isDragging.current = false; lastMouse.current = { x: e.clientX, y: e.clientY }; }}
      onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerLeave={handlePointerUp}
      onWheel={(e) => setCam(prev => ({ ...prev, zoom: Math.max(10, Math.min(100, prev.zoom - e.deltaY * 0.05)) }))}
    >
      {renderElements.map(el => el.type === 'line' ? (
        <g key={el.id}>
          <line x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2} stroke={el.color} strokeWidth="2" strokeDasharray="4 2" />
          <text x={el.x2 + 5} y={el.y2 + 5} fill={el.color} fontSize="12" fontWeight="bold">{el.text}</text>
        </g>
      ) : (
        <polygon
          key={el.id} points={el.points} fill={el.fill} stroke={el.stroke} strokeWidth="0.5" strokeLinejoin="round"
          className={!readOnly ? 'hover:brightness-110 transition-all' : ''}
          onPointerUp={(e) => { if (!isDragging.current) el.onClick(e); }}
        />
      ))}
    </svg>
  );
};
