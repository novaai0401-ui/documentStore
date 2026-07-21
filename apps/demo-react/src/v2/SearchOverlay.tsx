/**
 * Render yellow rectangles for each search hit on top of a page render.
 * Matches are indexed at PDF scale=1 (see useTextSearch); we multiply
 * by the user's current zoom so highlights stay aligned when they zoom.
 */
import type { CSSProperties } from 'react';
import type { SearchMatch } from './useTextSearch.js';

interface Props {
  pageNumber: number;
  /** User's current render scale — multiplies the indexed coords. */
  scale: number;
  matches: SearchMatch[];
  currentIndex: number;
}

export function SearchOverlay({ pageNumber, scale, matches, currentIndex }: Props) {
  const pageMatches = matches.filter((m) => m.page === pageNumber);
  if (pageMatches.length === 0) return null;
  return (
    <div className="v2-search-layer" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 6 }}>
      {pageMatches.map((m) => {
        const isCurrent = m.index === currentIndex;
        const style: CSSProperties = {
          position: 'absolute',
          left: m.x * scale,
          top: m.y * scale,
          width: m.width * scale,
          height: m.height * scale,
          background: isCurrent ? 'rgba(249, 115, 22, 0.55)' : 'rgba(250, 204, 21, 0.45)',
          border: '1px solid ' + (isCurrent ? 'rgba(154, 52, 18, 0.7)' : 'rgba(180, 130, 0, 0.6)'),
          borderRadius: 2,
        };
        return <div key={m.index} style={style} />;
      })}
    </div>
  );
}
