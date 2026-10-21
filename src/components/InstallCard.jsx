import { useEffect, useState } from "react";
import { FiDownload, FiX } from "react-icons/fi";

import { canPromptInstall, isInstalled, isIOS, promptInstall, subscribeInstall } from "../services/install";
import InstallGuide from "./InstallGuide";

const DISMISS_KEY = "u_do_install_dismissed";
const QUIET_DAYS = 14;

const dismissedRecently = () => {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return Date.now() - at < QUIET_DAYS * 86_400_000;
  } catch {
    return false;
  }
};

const onPhone = () => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;

/**
 * "Install U.Do", on Home, on phones that haven't installed it. Android gets
 * the browser's own install dialog; iPhone gets the three-step guide. Closing
 * it keeps it away for two weeks. `inline` is the Reminders-card version,
 * which always shows on iPhone because push needs the install there.
 */
function InstallCard({ inline = false }) {
  const [, setTick] = useState(0);
  const [hidden, setHidden] = useState(() => !inline && dismissedRecently());
  const [guide, setGuide] = useState(false);

  useEffect(() => subscribeInstall(() => setTick((n) => n + 1)), []);

  const ios = isIOS();
  const promptable = canPromptInstall();
  if (isInstalled() || hidden || (!ios && !promptable) || (!inline && !onPhone())) return null;

  const install = async () => {
    if (ios) setGuide(true);
    else await promptInstall();
  };

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* Hidden for this visit anyway. */
    }
    setHidden(true);
  };

  const button = (
    <button type="button" className="btn btn-primary" onClick={install}>
      <FiDownload /> {ios ? "Show me how" : "Install U.Do"}
    </button>
  );

  return (
    <>
      {inline ? (
        <div className="install-inline">{button}</div>
      ) : (
        <section className="panel install-card" aria-label="Install U.Do">
          <img src="/icon-192.png" alt="" className="install-card-icon" />
          <div className="install-card-copy">
            <strong>Install U.Do on your phone</strong>
            <span className="panel-note">Opens full screen like an app, and lets reminders reach you.</span>
          </div>
          <div className="install-card-actions">
            {button}
            <button type="button" className="icon-btn" onClick={dismiss} aria-label="Not now">
              <FiX />
            </button>
          </div>
        </section>
      )}
      {guide ? <InstallGuide onClose={() => setGuide(false)} /> : null}
    </>
  );
}

export default InstallCard;
