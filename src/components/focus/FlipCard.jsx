import { useState } from "react";

/**
 * One split-flap card holding a pair of digits — minutes, or seconds. When
 * the value changes, the old top half falls
 * forward over the new one and the new bottom half lands under it — the
 * flip clock from desk clocks and study-with-me videos.
 *
 * The previous value is kept by adjusting state during render (React's
 * documented pattern for "what was it last time"), so each change plays the
 * flip exactly once, keyed by the pair.
 */
function FlipCard({ value }) {
  const [shown, setShown] = useState({ current: value, previous: value });
  if (shown.current !== value) setShown({ current: value, previous: shown.current });

  const { current, previous } = shown;
  const flipping = current !== previous;

  return (
    <span className="flip-card" aria-hidden="true">
      <span className="flip-half flip-top">
        <span>{current}</span>
      </span>
      <span className="flip-half flip-bottom">
        <span>{flipping ? previous : current}</span>
      </span>
      {flipping ? (
        <span key={`${previous}-${current}`} className="flip-leaf">
          <span className="flip-half flip-top flip-leaf-front">
            <span>{previous}</span>
          </span>
          <span className="flip-half flip-bottom flip-leaf-back">
            <span>{current}</span>
          </span>
        </span>
      ) : null}
    </span>
  );
}

export default FlipCard;
