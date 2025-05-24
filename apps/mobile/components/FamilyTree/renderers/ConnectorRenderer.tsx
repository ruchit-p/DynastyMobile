import React, { memo } from 'react';
import { View } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';
import type { ConnectorRendererProps } from '../types';

export const ConnectorRenderer = memo<ConnectorRendererProps>(({
  connectors,
  viewport,
  scale,
  scaleFactor,
}) => {
  if (!connectors || connectors.length === 0 || !viewport) {
    return null;
  }

  const visibleConnectors = connectors.filter(connector => {
    const points = connector.points;
    if (!points || points.length < 2) return false;

    const minX = Math.min(...points.map((p: any) => p.x)) * scaleFactor;
    const maxX = Math.max(...points.map((p: any) => p.x)) * scaleFactor;
    const minY = Math.min(...points.map((p: any) => p.y)) * scaleFactor;
    const maxY = Math.max(...points.map((p: any) => p.y)) * scaleFactor;

    return (
      maxX >= viewport.minX * scaleFactor &&
      minX <= viewport.maxX * scaleFactor &&
      maxY >= viewport.minY * scaleFactor &&
      minY <= viewport.maxY * scaleFactor
    );
  });

  return (
    <View style={{ position: 'absolute', top: 0, left: 0 }}>
      <Svg
        width={10000}
        height={10000}
        style={{ position: 'absolute' }}
      >
        {visibleConnectors.map((connector, index) => {
          const points = connector.points;
          if (points.length === 2) {
            return (
              <Line
                key={`connector-${index}`}
                x1={points[0].x * scaleFactor}
                y1={points[0].y * scaleFactor}
                x2={points[1].x * scaleFactor}
                y2={points[1].y * scaleFactor}
                stroke="#ccc"
                strokeWidth={1}
              />
            );
          } else {
            const pathData = points.reduce((acc: string, point: any, i: number) => {
              const x = point.x * scaleFactor;
              const y = point.y * scaleFactor;
              if (i === 0) return `M ${x} ${y}`;
              return `${acc} L ${x} ${y}`;
            }, '');

            return (
              <Path
                key={`connector-${index}`}
                d={pathData}
                stroke="#ccc"
                strokeWidth={1}
                fill="none"
              />
            );
          }
        })}
      </Svg>
    </View>
  );
});

ConnectorRenderer.displayName = 'ConnectorRenderer';