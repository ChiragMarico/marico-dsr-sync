import React from 'react';
import Svg, { Defs, LinearGradient, Stop, Text as SvgText } from 'react-native-svg';

/**
 * Sync "S" mark — bold S with the green→blue brand gradient. Placeholder for
 * the official Sync logo; swaps out when the brand team provides the asset.
 */
export function SyncMark({ size = 28, onDark = false }: { size?: number; onDark?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <Defs>
        <LinearGradient id="syncg" x1="0.1" y1="0" x2="0.9" y2="1">
          <Stop offset="0" stopColor="#8CC63F" />
          <Stop offset="1" stopColor="#1C5AA8" />
        </LinearGradient>
      </Defs>
      <SvgText
        x="16"
        y="25"
        fontSize="30"
        fontWeight="900"
        fill={onDark ? '#FFFFFF' : 'url(#syncg)'}
        textAnchor="middle"
        fontFamily="System"
      >
        S
      </SvgText>
    </Svg>
  );
}
