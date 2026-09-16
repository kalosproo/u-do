import { usePlan } from "../hooks/usePlan";

/**
 * A small, quiet indicator of the current plan.
 *
 * Styles are inline so that dropping this in touches no existing stylesheet —
 * nothing in the current UI changes unless this component is mounted.
 */
export default function PlanBadge({ className = "" }) {
  const { label, planId, loading } = usePlan();

  if (loading) return null;

  return (
    <span
      className={className}
      title={planId === "pro" ? "Pro plan" : "Free plan"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 11.5,
        lineHeight: 1.6,
        letterSpacing: "0.01em",
        border: "1px solid currentColor",
        opacity: planId === "pro" ? 1 : 0.6,
      }}
    >
      {label}
    </span>
  );
}
