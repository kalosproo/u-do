/**
 * What this deployment shows instead of a white page when its Firebase config
 * is incomplete. The admin console is a separate Vercel project from the
 * consumer app, so it needs its own copy of every value, and forgetting one is
 * the single most likely way for a fresh deployment to come up dead.
 */
export default function SetupNeeded({ missing = [] }) {
  return (
    <div className="gate">
      <div className="gate-card">
        <h1>Not configured</h1>
        <p className="notice">
          {missing.length === 1
            ? "One environment variable is missing, so Firebase could not start."
            : `${missing.length} environment variables are missing, so Firebase could not start.`}
        </p>

        <ul className="env-list">
          {missing.map((name) => (
            <li key={name}>
              <code>{name}</code>
            </li>
          ))}
        </ul>

        <p>
          Add them to this Vercel project under Settings → Environment Variables,
          then redeploy. The values are the same ones the consumer app uses —
          Firebase Console → Project settings → Your apps. Locally, copy{" "}
          <code>.env.example</code> to <code>.env.local</code> and fill it in.
        </p>
      </div>
    </div>
  );
}
