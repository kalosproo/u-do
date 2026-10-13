import { useEffect, useRef } from "react";

const CLIENT = "ca-pub-1234327380102132";
const SLOT = "4768251063";

/**
 * One AdSense unit.
 *
 * This used to render the start-up call as a <script> element inside JSX.
 * React inserts such a script into the page but never runs it, so the slot
 * never asked AdSense for an ad and has been an empty box all along. The call
 * is made from an effect instead, once per mounted slot.
 *
 * Hidden entirely for plans that do not show ads (Pro), so a paying account
 * never sees an empty frame where an ad would have been.
 */
export default function AdSlot({ enabled = true }) {
  const pushed = useRef(false);

  useEffect(() => {
    if (!enabled || pushed.current) return;
    pushed.current = true;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // Blocked by an ad blocker, or the script has not loaded. Nothing to do.
    }
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div className="adsense-container">
      <ins
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client={CLIENT}
        data-ad-slot={SLOT}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}
