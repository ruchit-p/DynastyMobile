import React from 'react';

interface Props {
  points: [number, number, number, number];
  width: number;
  height: number;
  style?: React.CSSProperties;
}

const FamilyConnector: React.FC<Props> = ({ points, width, height, style }) => {
  const [x1, y1, x2, y2] = points;

  // Calculate centered coordinates
  const startX = x1 * width + (width / 2);
  const startY = y1 * height + (height / 2);
  const endX = x2 * width + (width / 2);
  const endY = y2 * height + (height / 2);

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        overflow: 'visible',
        ...style,
      }}
    >
      <svg
        style={{
          position: 'absolute',
          width: '100%',
          height: '100%',
          overflow: 'visible',
          pointerEvents: 'none',
        }}
      >
        <path
          d={`M ${startX} ${startY} L ${endX} ${endY}`}
          stroke="#94a3b8"
          strokeWidth="1"
          fill="none"
        />
      </svg>
    </div>
  );
};

export default FamilyConnector; 