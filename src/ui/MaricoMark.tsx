import React from 'react';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

/**
 * Marico "M" mark — two cobalt pillars around a lima leaf. Placeholder for the
 * official logo; swaps out when the brand team provides the real asset.
 */
export function MaricoMark({ size = 28, onDark = false }: { size?: number; onDark?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <Defs>
        <LinearGradient id="mgm" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#2B5CFF" />
          <Stop offset="1" stopColor="#3E7BE0" />
        </LinearGradient>
        <LinearGradient id="lgm" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#A9EA57" />
          <Stop offset="1" stopColor="#6BB52E" />
        </LinearGradient>
      </Defs>
      <Rect x="4" y="7" width="4.6" height="18" rx="2.3" fill={onDark ? '#FFFFFF' : 'url(#mgm)'} />
      <Rect x="23.4" y="7" width="4.6" height="18" rx="2.3" fill={onDark ? '#FFFFFF' : 'url(#mgm)'} />
      <Path d="M16 6.5C11.8 12.5 11.8 19 16 25.5C20.2 19 20.2 12.5 16 6.5Z" fill="url(#lgm)" />
    </Svg>
  );
}
