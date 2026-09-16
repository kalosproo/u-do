const LABEL = {
  live: "Live",
  reconnecting: "Reconnecting",
  offline: "Offline",
  loading: "Connecting",
  idle: "Paused",
};

/**
 * The only moving thing on the page, and it moves for a reason: it is the
 * difference between a number you can act on and a number cached from an hour
 * ago.
 */
export default function ConnectionBadge({ state = "loading" }) {
  return (
    <span className="live" data-state={state} role="status" aria-live="polite">
      <span className="live-dot" aria-hidden="true" />
      {LABEL[state] || LABEL.loading}
    </span>
  );
}
