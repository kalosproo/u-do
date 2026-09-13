import { useState } from "react";
import { FiTrash2 } from "react-icons/fi";
import { useAuthGuard } from "../hooks/useAuthGuard";

/**
 * Deletes exactly one area of the workspace.
 *
 * Each page passes its own `clear` from its own service, so Tasks can never
 * reach habits and Finance can never reach tasks. The typed confirmation is
 * deliberate: this is unrecoverable, so a mis-click must not be enough.
 */
function ClearDataButton({ label, noun, count = 0, clear, onCleared }) {
  const requireUser = useAuthGuard();
  const [busy, setBusy] = useState(false);

  const run = async () => {
    const user = requireUser();
    if (!user) return;

    if (!count) {
      window.alert(`There are no ${noun} to clear.`);
      return;
    }

    const typed = window.prompt(
      `This permanently deletes all ${count} ${noun} in this account.\n\n` +
        `Nothing else is touched.\n\nType DELETE to confirm.`
    );

    if (typed !== "DELETE") return;

    setBusy(true);
    try {
      const removed = await clear(user.uid);
      await onCleared?.(removed);
    } catch (error) {
      window.alert(error?.message || `Couldn't clear your ${noun}.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      className="btn btn-danger btn-sm"
      onClick={run}
      disabled={busy || !count}
      title={count ? `Delete all ${noun}` : `No ${noun} to clear`}
    >
      <FiTrash2 /> {busy ? "Clearing…" : label}
    </button>
  );
}

export default ClearDataButton;
