import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Polygon, Line, Circle, Text as SvgText, G } from 'react-native-svg';
import theme from '@/constants/theme';

interface RadarDataPoint {
  label: string;
  value: number; // 0–100
  color?: string;
}

interface RadarChartProps {
  data: RadarDataPoint[];
  size?: number;
  fillColor?: string;
  fillOpacity?: number;
  strokeColor?: string;
  gridColor?: string;
  labelColor?: string;
}

const GRID_LEVELS = 4; // 25%, 50%, 75%, 100%

function polarToCartesian(cx: number, cy: number, radius: number, index: number, total: number): [number, number] {
  const angle = -Math.PI / 2 + (2 * Math.PI * index) / total;
  return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
}

export default function RadarChart({
  data,
  size = 220,
  fillColor = '#D97706',
  fillOpacity = 0.25,
  strokeColor = '#D97706',
  gridColor = theme.border,
  labelColor = theme.textSecondary,
}: RadarChartProps) {
  const n = data.length;
  if (n < 3) return null;

  const cx = size / 2;
  const cy = size / 2;
  const maxRadius = size / 2 - 36; // Leave room for labels
  const labelRadius = maxRadius + 22;

  // Grid polygons (concentric)
  const gridPolygons: string[] = [];
  for (let level = 1; level <= GRID_LEVELS; level++) {
    const r = (maxRadius * level) / GRID_LEVELS;
    const points = Array.from({ length: n }, (_, i) => {
      const [x, y] = polarToCartesian(cx, cy, r, i, n);
      return `${x},${y}`;
    }).join(' ');
    gridPolygons.push(points);
  }

  // Axis lines
  const axisLines = Array.from({ length: n }, (_, i) => {
    const [x, y] = polarToCartesian(cx, cy, maxRadius, i, n);
    return { x1: cx, y1: cy, x2: x, y2: y };
  });

  // Data polygon
  const dataPoints = data.map((d, i) => {
    const r = (maxRadius * Math.min(d.value, 100)) / 100;
    const [x, y] = polarToCartesian(cx, cy, r, i, n);
    return { x, y, value: d.value };
  });
  const dataPolygon = dataPoints.map(p => `${p.x},${p.y}`).join(' ');

  // Label positions
  const labels = data.map((d, i) => {
    const [x, y] = polarToCartesian(cx, cy, labelRadius, i, n);
    let anchor: 'middle' | 'start' | 'end' = 'middle';
    if (x < cx - 10) anchor = 'end';
    else if (x > cx + 10) anchor = 'start';
    return { x, y: y + 4, label: d.label, value: d.value, anchor, color: d.color };
  });

  return (
    <View style={[styles.container, { width: size, height: size + 24 }]}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Grid */}
        {gridPolygons.map((points, i) => (
          <Polygon
            key={`grid-${i}`}
            points={points}
            fill="none"
            stroke={gridColor}
            strokeWidth={i === GRID_LEVELS - 1 ? 1.5 : 0.7}
            strokeDasharray={i < GRID_LEVELS - 1 ? '3,3' : undefined}
            opacity={i === GRID_LEVELS - 1 ? 0.6 : 0.35}
          />
        ))}

        {/* Axis lines */}
        {axisLines.map((line, i) => (
          <Line
            key={`axis-${i}`}
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            stroke={gridColor}
            strokeWidth={0.7}
            opacity={0.4}
          />
        ))}

        {/* Data area */}
        <Polygon
          points={dataPolygon}
          fill={fillColor}
          fillOpacity={fillOpacity}
          stroke={strokeColor}
          strokeWidth={2}
          strokeLinejoin="round"
        />

        {/* Data dots */}
        {dataPoints.map((p, i) => (
          <Circle
            key={`dot-${i}`}
            cx={p.x}
            cy={p.y}
            r={4}
            fill={strokeColor}
            stroke="#FFF"
            strokeWidth={2}
          />
        ))}

        {/* Labels */}
        {labels.map((lbl, i) => (
          <G key={`label-${i}`}>
            <SvgText
              x={lbl.x}
              y={lbl.y - 6}
              textAnchor={lbl.anchor}
              fontSize={11}
              fontWeight="700"
              fill={lbl.color || labelColor}
            >
              {lbl.label}
            </SvgText>
            <SvgText
              x={lbl.x}
              y={lbl.y + 8}
              textAnchor={lbl.anchor}
              fontSize={12}
              fontWeight="800"
              fill={strokeColor}
            >
              {lbl.value}%
            </SvgText>
          </G>
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
