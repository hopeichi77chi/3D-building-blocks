import React, { useMemo, useRef, useState } from 'react';
import { Layers3, MousePointer2, Minus, Plus } from 'lucide-react';
import type { Block } from '../types';

// ============================================================================
// Scene3D — 輕量自製 3D 等角投影渲染器（純 SVG，無需 WebGL）
//
// 放置模式：
// 1. SURFACE：點擊地板或積木外露表面，在相鄰座標放置。
// 2. LAYER：指定 Y 高度後，直接點擊半透明平面，可放置沒有下方支撐的懸空積木。
// ============================================================================

type PlacementMode = 'SURFACE' | 'LAYER';

const shadeColor = (color: string, percent: number): string => {
  let red = Number.parseInt(color.substring(1, 3), 16);
  let green = Number.parseInt(color.substring(3, 5), 16);
  let blue = Number.parseInt(color.substring(5, 7), 16);

  red = Math.floor((red * (100 + percent)) / 100);
  green = Math.floor((green * (100 + percent)) / 100);
  blue = Math.floor((blue * (100 + percent)) / 100);

  red = Math.min(255, Math.max(0, red));
  green = Math.min(255, Math.max(0, green));
  blue = Math.min(255, Math.max(0, blue));

  return `#${[red, green, blue]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')}`;
};

const transformPoint = (
  x: number,
  y: number,
  z: number,
  yaw: number,
  pitch: number,
  zoom: number,
  gridSize: number,
) => {
  const centeredX = x - gridSize / 2;
  const centeredY = y;
  const centeredZ = z - gridSize / 2;
  const rotatedX = centeredX * Math.cos(yaw) - centeredZ * Math.sin(yaw);
  const rotatedZ = centeredX * Math.sin(yaw) + centeredZ * Math.cos(yaw);
  const projectedY = centeredY * Math.cos(pitch) - rotatedZ * Math.sin(pitch);
  const depth = centeredY * Math.sin(pitch) + rotatedZ * Math.cos(pitch);

  return {
    px: rotatedX * zoom,
    py: -projectedY * zoom,
    depth,
  };
};

const transformNormal = (
  nx: number,
  ny: number,
  nz: number,
  yaw: number,
  pitch: number,
) => {
  const rotatedX = nx * Math.cos(yaw) - nz * Math.sin(yaw);
  const rotatedZ = nx * Math.sin(yaw) + nz * Math.cos(yaw);
  const projectedY = ny * Math.cos(pitch) - rotatedZ * Math.sin(pitch);
  const depth = ny * Math.sin(pitch) + rotatedZ * Math.cos(pitch);

  return { nx: rotatedX, ny: projectedY, nz: depth };
};

const CUBE_FACES = [
  { normal: [0, 1, 0], vertices: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], colorOffset: 10 },
  { normal: [1, 0, 0], vertices: [[1, 1, 1], [1, 0, 1], [1, 0, 0], [1, 1, 0]], colorOffset: -10 },
  { normal: [0, 0, 1], vertices: [[0, 1, 1], [0, 0, 1], [1, 0, 1], [1, 1, 1]], colorOffset: -20 },
  { normal: [-1, 0, 0], vertices: [[0, 1, 0], [0, 0, 0], [0, 0, 1], [0, 1, 1]], colorOffset: -15 },
  { normal: [0, 0, -1], vertices: [[1, 1, 0], [1, 0, 0], [0, 0, 0], [0, 1, 0]], colorOffset: -25 },
  { normal: [0, -1, 0], vertices: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], colorOffset: -40 },
] as const;

interface Scene3DProps {
  blocks: Block[];
  readOnly?: boolean;
  gridSize?: number;
  onAddBlock?: (x: number, y: number, z: number) => void;
  onRemoveBlock?: (id: string) => void;
  onLogCamera?: (yaw: number, pitch: number) => void;
}

interface RenderPolygon {
  type: 'poly';
  depth: number;
  id: string;
  points: string;
  fill: string;
  stroke: string;
  strokeWidth?: number;
  strokeDasharray?: string;
  opacity?: number;
  className?: string;
  onClick: (event: React.PointerEvent<SVGPolygonElement>) => void;
}

interface RenderLine {
  type: 'line';
  depth: number;
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  text: string;
}

type RenderElement = RenderPolygon | RenderLine;

export const Scene3D: React.FC<Scene3DProps> = ({
  blocks,
  readOnly = false,
  gridSize = 4,
  onAddBlock,
  onRemoveBlock,
  onLogCamera,
}) => {
  const [camera, setCamera] = useState({
    yaw: Math.PI / 4,
    pitch: Math.PI / 6,
    zoom: 40,
  });
  const [placementMode, setPlacementMode] = useState<PlacementMode>('SURFACE');
  const [placementLayer, setPlacementLayer] = useState(0);
  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });

  const occupiedPositions = useMemo(
    () => new Set(blocks.map((block) => `${block.x},${block.y},${block.z}`)),
    [blocks],
  );

  const isInsideGrid = (x: number, y: number, z: number): boolean =>
    x >= 0 && x < gridSize && y >= 0 && y < gridSize && z >= 0 && z < gridSize;

  const tryAddBlock = (x: number, y: number, z: number): void => {
    if (!onAddBlock || !isInsideGrid(x, y, z)) return;
    if (occupiedPositions.has(`${x},${y},${z}`)) return;
    onAddBlock(x, y, z);
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>): void => {
    if (event.buttons <= 0) return;

    const dx = event.clientX - lastMouse.current.x;
    const dy = event.clientY - lastMouse.current.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) isDragging.current = true;

    setCamera((previous) => ({
      ...previous,
      yaw: previous.yaw - dx * 0.01,
      pitch: Math.max(
        -Math.PI / 2,
        Math.min(Math.PI / 2, previous.pitch + dy * 0.01),
      ),
    }));
    lastMouse.current = { x: event.clientX, y: event.clientY };
  };

  const handlePointerUp = (): void => {
    if (isDragging.current && onLogCamera) {
      onLogCamera(camera.yaw, camera.pitch);
    }
    window.setTimeout(() => {
      isDragging.current = false;
    }, 50);
  };

  const handleSurfaceClick = (
    event: React.PointerEvent<SVGPolygonElement>,
    x: number,
    y: number,
    z: number,
    blockId: string | null,
  ): void => {
    if (readOnly || isDragging.current || placementMode !== 'SURFACE') return;
    event.stopPropagation();

    if (event.shiftKey && blockId && onRemoveBlock) {
      onRemoveBlock(blockId);
      return;
    }

    tryAddBlock(x, y, z);
  };

  const handleLayerCellClick = (
    event: React.PointerEvent<SVGPolygonElement>,
    x: number,
    z: number,
  ): void => {
    if (readOnly || isDragging.current || placementMode !== 'LAYER') return;
    event.stopPropagation();
    tryAddBlock(x, placementLayer, z);
  };

  const renderElements: RenderElement[] = [];

  const axes = [
    { id: 'X', color: '#ef4444', point: [gridSize + 1, 0, 0] },
    { id: 'Y', color: '#22c55e', point: [0, gridSize + 1, 0] },
    { id: 'Z', color: '#3b82f6', point: [0, 0, gridSize + 1] },
  ];

  axes.forEach((axis) => {
    const start = transformPoint(0, 0, 0, camera.yaw, camera.pitch, camera.zoom, gridSize);
    const end = transformPoint(
      axis.point[0],
      axis.point[1],
      axis.point[2],
      camera.yaw,
      camera.pitch,
      camera.zoom,
      gridSize,
    );
    renderElements.push({
      type: 'line',
      depth: (start.depth + end.depth) / 2,
      id: `axis-${axis.id}`,
      x1: start.px,
      y1: start.py,
      x2: end.px,
      y2: end.py,
      color: axis.color,
      text: axis.id,
    });
  });

  // 地板平面：一般表面放置模式使用。
  for (let x = 0; x < gridSize; x += 1) {
    for (let z = 0; z < gridSize; z += 1) {
      const transformedNormal = transformNormal(0, 1, 0, camera.yaw, camera.pitch);
      if (transformedNormal.nz <= -0.1) continue;

      const points = [[0, 0, 1], [1, 0, 1], [1, 0, 0], [0, 0, 0]].map((offset) =>
        transformPoint(
          x + offset[0],
          0,
          z + offset[2],
          camera.yaw,
          camera.pitch,
          camera.zoom,
          gridSize,
        ),
      );
      const center = transformPoint(
        x + 0.5,
        0,
        z + 0.5,
        camera.yaw,
        camera.pitch,
        camera.zoom,
        gridSize,
      );

      renderElements.push({
        type: 'poly',
        depth: center.depth,
        id: `grid-${x}-${z}`,
        points: points.map((point) => `${point.px},${point.py}`).join(' '),
        fill: '#f1f5f9',
        stroke: '#cbd5e1',
        className: placementMode === 'SURFACE' && !readOnly ? 'hover:brightness-95' : '',
        onClick: (event) => handleSurfaceClick(event, x, 0, z, null),
      });
    }
  }

  blocks.forEach((block) => {
    CUBE_FACES.forEach((face, faceIndex) => {
      const targetX = block.x + face.normal[0];
      const targetY = block.y + face.normal[1];
      const targetZ = block.z + face.normal[2];
      if (occupiedPositions.has(`${targetX},${targetY},${targetZ}`)) return;

      const transformedNormal = transformNormal(
        face.normal[0],
        face.normal[1],
        face.normal[2],
        camera.yaw,
        camera.pitch,
      );
      if (transformedNormal.nz <= 0.001) return;

      const points = face.vertices.map((offset) =>
        transformPoint(
          block.x + offset[0],
          block.y + offset[1],
          block.z + offset[2],
          camera.yaw,
          camera.pitch,
          camera.zoom,
          gridSize,
        ),
      );
      const center = transformPoint(
        block.x + 0.5 + face.normal[0] * 0.5,
        block.y + 0.5 + face.normal[1] * 0.5,
        block.z + 0.5 + face.normal[2] * 0.5,
        camera.yaw,
        camera.pitch,
        camera.zoom,
        gridSize,
      );

      renderElements.push({
        type: 'poly',
        depth: center.depth,
        id: `block-${block.id}-face-${faceIndex}`,
        points: points.map((point) => `${point.px},${point.py}`).join(' '),
        fill: shadeColor(block.color, face.colorOffset),
        stroke: shadeColor(block.color, face.colorOffset - 10),
        className: !readOnly && placementMode === 'SURFACE'
          ? 'hover:brightness-110 transition-all'
          : '',
        onClick: (event) =>
          handleSurfaceClick(event, targetX, targetY, targetZ, block.id),
      });
    });
  });

  renderElements.sort((first, second) => first.depth - second.depth);

  // 指定高度層放置平面必須最後繪製，才能點擊沒有支撐面的空間座標。
  const layerElements: RenderPolygon[] = [];
  if (!readOnly && placementMode === 'LAYER') {
    for (let x = 0; x < gridSize; x += 1) {
      for (let z = 0; z < gridSize; z += 1) {
        const points = [[0, 0, 1], [1, 0, 1], [1, 0, 0], [0, 0, 0]].map((offset) =>
          transformPoint(
            x + offset[0],
            placementLayer,
            z + offset[2],
            camera.yaw,
            camera.pitch,
            camera.zoom,
            gridSize,
          ),
        );
        const center = transformPoint(
          x + 0.5,
          placementLayer,
          z + 0.5,
          camera.yaw,
          camera.pitch,
          camera.zoom,
          gridSize,
        );
        const occupied = occupiedPositions.has(`${x},${placementLayer},${z}`);

        layerElements.push({
          type: 'poly',
          depth: center.depth + 1000,
          id: `layer-${placementLayer}-${x}-${z}`,
          points: points.map((point) => `${point.px},${point.py}`).join(' '),
          fill: occupied ? '#ef4444' : '#6366f1',
          stroke: occupied ? '#b91c1c' : '#4338ca',
          strokeWidth: 1.2,
          strokeDasharray: occupied ? undefined : '4 3',
          opacity: occupied ? 0.22 : 0.16,
          className: occupied ? 'cursor-not-allowed' : 'hover:opacity-40 transition-opacity',
          onClick: (event) => handleLayerCellClick(event, x, z),
        });
      }
    }
  }

  return (
    <div className="relative h-full w-full overflow-hidden">
      {!readOnly && (
        <div className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white/95 p-2 shadow-lg backdrop-blur">
          <button
            type="button"
            onClick={() => setPlacementMode('SURFACE')}
            className={`flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold transition ${
              placementMode === 'SURFACE'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <MousePointer2 className="h-4 w-4" />
            表面放置
          </button>
          <button
            type="button"
            onClick={() => setPlacementMode('LAYER')}
            className={`flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold transition ${
              placementMode === 'LAYER'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Layers3 className="h-4 w-4" />
            指定高度／懸空
          </button>

          {placementMode === 'LAYER' && (
            <div className="flex items-center gap-1 rounded-lg border border-indigo-100 bg-indigo-50 px-2 py-1">
              <button
                type="button"
                onClick={() => setPlacementLayer((layer) => Math.max(0, layer - 1))}
                disabled={placementLayer <= 0}
                className="rounded p-1 text-indigo-700 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-30"
                aria-label="降低放置高度"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="min-w-16 text-center text-xs font-bold text-indigo-800">
                Y = {placementLayer}
              </span>
              <button
                type="button"
                onClick={() => setPlacementLayer((layer) => Math.min(gridSize - 1, layer + 1))}
                disabled={placementLayer >= gridSize - 1}
                className="rounded p-1 text-indigo-700 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-30"
                aria-label="提高放置高度"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          )}

          <span className="hidden text-[11px] text-slate-500 md:inline">
            Shift＋點積木可移除
          </span>
        </div>
      )}

      <svg
        width="100%"
        height="100%"
        viewBox="-200 -200 400 400"
        className={`select-none touch-none overflow-hidden ${
          readOnly ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'
        }`}
        onPointerDown={(event) => {
          isDragging.current = false;
          lastMouse.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onWheel={(event) =>
          setCamera((previous) => ({
            ...previous,
            zoom: Math.max(10, Math.min(100, previous.zoom - event.deltaY * 0.05)),
          }))
        }
      >
        {[...renderElements, ...layerElements].map((element) =>
          element.type === 'line' ? (
            <g key={element.id}>
              <line
                x1={element.x1}
                y1={element.y1}
                x2={element.x2}
                y2={element.y2}
                stroke={element.color}
                strokeWidth="2"
                strokeDasharray="4 2"
              />
              <text
                x={element.x2 + 5}
                y={element.y2 + 5}
                fill={element.color}
                fontSize="12"
                fontWeight="bold"
              >
                {element.text}
              </text>
            </g>
          ) : (
            <polygon
              key={element.id}
              points={element.points}
              fill={element.fill}
              stroke={element.stroke}
              strokeWidth={element.strokeWidth ?? 0.5}
              strokeDasharray={element.strokeDasharray}
              opacity={element.opacity}
              strokeLinejoin="round"
              className={element.className}
              onPointerUp={(event) => {
                if (!isDragging.current) element.onClick(event);
              }}
            />
          ),
        )}
      </svg>
    </div>
  );
};