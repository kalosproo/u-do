import { useEffect, useState } from "react";

import { useAuth } from "../hooks/useAuth";
import { usePlan } from "../hooks/usePlan";
import { cancelPro, readProOffer, startPro } from "../services/billing";
import { formatMoney } from "../utils/money";

const dateLabel = (date) =>
  date ? date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "";

// The Android app opens the site with an android-app:// referrer, and a
// single-page app keeps the first referrer for the whole visit. Google Play
// requires its own billing for subscriptions bought inside an app, so the
// app shows the plan but never sells it.
const inAndroidApp = () => typeof document !== "undefined" && document.referrer.startsWith("android-app://");

/**
 * Plan and upgrade.
 *
 * Renders nothing for a Free account while Pro isn't on sale, so the app
 * looks exactly as it does today until a price and a Razorpay plan exist.
 * Every state shown here comes from billing/{uid}, which only the server
 * writes — paying moves it to Pro when Razorpay's webhook confirms, not when
 * the checkout window closes.
 */
function PlanCard() {
  const { user } = useAuth();
  const plan = usePlan();
  const [offer, setOffer] = useState(undefined);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState({ tone: "", text: "" });

  useEffect(() => {
    let live = true;
    readProOffer()
      .then((value) => live && setOffer(value))
      .catch(() => live && setOffer(null));
    return () => {
      live = false;
    };
  }, []);

  const isPro = plan.planId === "pro";
  const sub = plan.subscription;

  // Activated by the webhook while this card was waiting: clear the "activating" note.
  const shownNote = isPro && note.tone === "pending" ? { tone: "success", text: "You're on Pro. Thanks!" } : note;

  if (plan.loading || offer === undefined) return null;
  const canBuy = Boolean(offer) && !inAndroidApp();
  if (!isPro && !canBuy) return null;

  const upgrade = async () => {
    setBusy("upgrade");
    setNote({ tone: "", text: "" });
    try {
      const outcome = await startPro(user);
      if (outcome === "paid") setNote({ tone: "pending", text: "Payment received. Activating Pro — this takes a few seconds." });
    } catch (error) {
      setNote({ tone: "error", text: error.message });
    } finally {
      setBusy("");
    }
  };

  const cancel = async () => {
    const until = dateLabel(sub?.periodEnd);
    if (!window.confirm(`Cancel Pro? You keep it${until ? ` until ${until}` : " until the end of this period"}, then move to Free.`)) return;
    setBusy("cancel");
    try {
      await cancelPro();
      setNote({ tone: "success", text: "Cancelled. Nothing more will be charged." });
    } catch (error) {
      setNote({ tone: "error", text: error.message });
    } finally {
      setBusy("");
    }
  };

  let summary;
  if (isPro && sub?.cancelAtPeriodEnd) summary = `Pro until ${dateLabel(sub.periodEnd) || "the end of this period"}, then Free.`;
  else if (isPro) summary = sub?.periodEnd ? `Pro. Renews ${dateLabel(sub.periodEnd)}.` : "Pro.";
  else if (sub?.status === "halted") summary = "Free. Your last Pro payment didn't go through.";
  else summary = "Free.";

  return (
    <article className="panel profile-card">
      <div className="panel-head">
        <h3 className="panel-title">Plan</h3>
      </div>

      <p className="profile-data-copy">{summary}</p>

      {!isPro && canBuy ? (
        <>
          <p className="panel-note">
            Pro removes ads. {formatMoney(offer.priceMinor, offer.currency)} a {offer.interval}, cancel any time.
          </p>
          <div className="profile-actions">
            <button type="button" className="btn btn-primary" onClick={upgrade} disabled={busy !== "" || note.tone === "pending"}>
              {busy === "upgrade" ? "Opening checkout…" : "Upgrade to Pro"}
            </button>
          </div>
        </>
      ) : null}

      {isPro && sub && !sub.cancelAtPeriodEnd ? (
        <div className="profile-actions">
          <button type="button" className="btn" onClick={cancel} disabled={busy !== ""}>
            {busy === "cancel" ? "Cancelling…" : "Cancel Pro"}
          </button>
        </div>
      ) : null}

      {shownNote.text ? (
        <p className={`profile-status ${shownNote.tone && shownNote.tone !== "pending" ? `is-${shownNote.tone}` : ""}`}>{shownNote.text}</p>
      ) : null}
    </article>
  );
}

export default PlanCard;
