import { useState } from "react";
import { FiTrash2 } from "react-icons/fi";
import { useAuthGuard } from "../hooks/useAuthGuard";

/**
 * Deletes exactly one area of the workspace.
 *
 * Each page passes its own `clear` from its own service, so Tasks can never
 * reach habits and Finance can never reach tasks. The typed confirmation is
 * deliberate: this is unrecoverable, so a mis-click must not be enough.
 *
 * Renders as a row inside PageMenu rather than as a button in the page
 * header — a destructive action should take a deliberate detour to reach,
 * not sit next to Add.
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
      className="page-menu-item is-danger"
      role="menuitem"
      onClick={run}
      disabled={busy || !count}
      title={count ? `Delete all ${noun}` : `No ${noun} to clear`}
    >
      <FiTrash2 />
      <span className="page-menu-item-text">{busy ? "Clearing…" : label}</span>
      <span className="page-menu-item-count">{count || "none"}</span>
    </button>
  );
}

export default ClearDataButton;
