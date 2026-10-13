import { formatCount } from "../utils/format.js";

/**
 * Renders a metric, an "in progress" state, or the reason it cannot be
 * computed. There is no fourth branch that guesses a number.
 */
export default function Figure({ label, metric, loading, tone, meta, format = formatCount }) {
  return (
    <div className="figure">
      <div className="figure-label">{label}</div>

      {loading && !metric ? (
        <div className="figure-value" data-placeholder="true">
          —
        </div>
      ) : !metric ? (
        <p className="figure-unsupported">Not loaded</p>
      ) : metric.supported ? (
        <>
          <div className="figure-value" data-tone={tone}>
            {format(metric.value)}
          </div>
          {meta ? <div className="figure-meta">{meta}</div> : null}
        </>
      ) : (
        <p className="figure-unsupported">{metric.reason}</p>
      )}
    </div>
  );
}

