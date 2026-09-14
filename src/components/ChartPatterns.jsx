import { SERIES_COUNT, patternId, seriesTone } from "../utils/chartSeries";

/**
 * Emits one <pattern> per series into a chart's <defs>.
 *
 * Recharts renders its own <svg>, so dropping this in as a child of the chart
 * puts the definitions in the same document as the slices that reference them.
 * `scope` keeps two charts on one page from colliding on ids.
 */
function ChartPatterns({ scope }) {
  return (
    <defs>
      {Array.from({ length: SERIES_COUNT }, (_, i) => (
        <pattern
          key={i}
          id={patternId(scope, i)}
          patternUnits="userSpaceOnUse"
          width="8"
          height="8"
        >
          <rect width="8" height="8" fill={seriesTone(i)} />

          {/* Series 0 stays solid. The marks are drawn in --surface, the
              ground behind the chart, so they read on any tone. */}
          {i === 1 ? <path d="M0 8 L8 0" stroke="var(--surface)" strokeWidth="2" /> : null}
          {i === 2 ? <path d="M0 0 L8 8" stroke="var(--surface)" strokeWidth="2" /> : null}
          {i === 3 ? <path d="M0 4 L8 4" stroke="var(--surface)" strokeWidth="2" /> : null}
          {i === 4 ? <path d="M4 0 L4 8" stroke="var(--surface)" strokeWidth="2" /> : null}
          {i === 5 ? <circle cx="4" cy="4" r="1.6" fill="var(--surface)" /> : null}
        </pattern>
      ))}
    </defs>
  );
}

export default ChartPatterns;
