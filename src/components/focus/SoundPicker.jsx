import { useEffect, useRef, useState } from "react";
import { FiVolume2, FiVolumeX } from "react-icons/fi";

import { useFocus } from "../../hooks/useFocus";
import { SOUNDS } from "../../utils/ambient";

/**
 * Focus sounds: a small button in the timer's top bar that opens a panel of
 * sounds and a volume slider. Generated in the browser (utils/ambient.js);
 * they play only while focus runs.
 */
function SoundPicker() {
  const focus = useFocus();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (!ref.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const { sound, setSound } = focus;
  const on = sound.kind !== "off";

  return (
    <div className="focus-sound" ref={ref}>
      <button
        type="button"
        className={`focus-icon-btn ${on ? "is-on" : ""}`}
        onClick={() => setOpen((value) => !value)}
        aria-label="Focus sounds"
        aria-expanded={open}
        title="Focus sounds"
      >
        {on ? <FiVolume2 /> : <FiVolumeX />}
      </button>

      {open ? (
        <div className="focus-sound-panel" role="dialog" aria-label="Focus sounds">
          <p className="eyebrow">SOUND</p>
          <div className="focus-sound-options">
            {SOUNDS.map(([kind, label]) => (
              <button
                key={kind}
                type="button"
                className={`chip ${sound.kind === kind ? "active" : ""}`}
                aria-pressed={sound.kind === kind}
                onClick={() => setSound({ kind })}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="focus-sound-volume">
            <span>Volume</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={sound.volume}
              disabled={!on}
              onChange={(event) => setSound({ volume: Number(event.target.value) })}
            />
          </label>
          <p className="panel-note">Plays while you focus. Fades out on breaks and pauses.</p>
        </div>
      ) : null}
    </div>
  );
}

export default SoundPicker;
