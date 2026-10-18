import { useEffect, useState } from "react";
import { FiWifiOff } from "react-icons/fi";

/**
 * A quiet pill when the connection drops, and a brief "Back online" when it
 * returns. Firestore keeps writes made while offline and sends them on
 * reconnect, so nothing is lost — as long as the tab stays open, which is
 * what the notice says.
 */
function OfflineNotice() {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const [justBack, setJustBack] = useState(false);

  useEffect(() => {
    let timer;
    const goOffline = () => {
      clearTimeout(timer);
      setJustBack(false);
      setOnline(false);
    };
    const goOnline = () => {
      setOnline(true);
      setJustBack(true);
      timer = setTimeout(() => setJustBack(false), 2500);
    };
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  if (online && !justBack) return null;

  return (
    <div className="offline-notice" role="status" aria-live="polite">
      {online ? (
        "Back online."
      ) : (
        <>
          <FiWifiOff aria-hidden="true" /> Offline — changes sync when you’re back
        </>
      )}
    </div>
  );
}

export default OfflineNotice;
