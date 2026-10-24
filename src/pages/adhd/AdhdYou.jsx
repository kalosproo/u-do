import { signOut } from "firebase/auth";
import { Link } from "react-router-dom";
import { FiLogOut, FiSettings } from "react-icons/fi";

import { AdhdPage, Chips } from "../../components/adhd/AdhdUI";
import { useAdhd } from "../../hooks/useAdhd";
import { useAuth } from "../../hooks/useAuth";
import { useTheme } from "../../hooks/useTheme";
import { auth } from "../../services/firebase";
import { resolveUserPhoto } from "../../utils/profilePhoto";

const THEMES = [
  ["dark", "Dark"],
  ["light", "Light"],
];

const MOTIONS = [
  ["lively", "Lively"],
  ["calm", "Calm"],
];

/**
 * You, in ADHD mode: the switch that brings the full app back, the theme,
 * and a way out. Everything else on the full profile page is one tap away.
 */
function AdhdYou() {
  const { user } = useAuth();
  const adhd = useAdhd();
  const { theme, setTheme } = useTheme();
  const name = user?.displayName || user?.email?.split("@")[0] || "You";
  const photo = resolveUserPhoto(user);

  return (
    <AdhdPage eyebrow="You" title="Hello," italic={`${name.split(" ")[0]}.`} sub={user?.email}>
      <div className="adhd-card adhd-you">
        {photo ? <img className="adhd-avatar is-big" src={photo} alt="" referrerPolicy="no-referrer" /> : <span className="adhd-avatar is-big">{name.charAt(0).toUpperCase()}</span>}
        <span>
          <strong>{name}</strong>
          <small>ADHD mode is on</small>
        </span>
      </div>

      <div className="adhd-card adhd-settings">
        <div className="adhd-toggle-row">
          <span>
            <strong>ADHD mode</strong>
            <small>Turn off to go back to the full app. Nothing you've added changes.</small>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={Boolean(adhd?.enabled)}
            aria-label="ADHD mode"
            className={`adhd-switch${adhd?.enabled ? " is-on" : ""}`}
            onClick={() => adhd?.setEnabled(!adhd.enabled)}
          >
            <span />
          </button>
        </div>
        <div className="adhd-toggle-row">
          <span>
            <strong>Look</strong>
            <small>Whatever is easier on your eyes</small>
          </span>
          <Chips options={THEMES} value={theme} onChange={setTheme} label="Theme" size="sm" />
        </div>
        <div className="adhd-toggle-row">
          <span>
            <strong>Motion</strong>
            <small>{adhd?.motion === "calm" ? "Still and quiet. No confetti." : "Confetti, sparks and swoops for every win"}</small>
          </span>
          <Chips options={MOTIONS} value={adhd?.motion || "lively"} onChange={(value) => adhd?.setMotion(value)} label="Motion" size="sm" />
        </div>
      </div>

      <Link to="/profile?full=1" className="adhd-card adhd-link-card">
        <FiSettings aria-hidden="true" />
        <span>
          <strong>All settings</strong>
          <small>Reminders, emails, your data, your account</small>
        </span>
      </Link>

      <button type="button" className="adhd-link adhd-link-center" onClick={() => signOut(auth)}>
        <FiLogOut aria-hidden="true" /> Sign out
      </button>
    </AdhdPage>
  );
}

export default AdhdYou;
