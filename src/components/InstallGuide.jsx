import { createPortal } from "react-dom";
import { FiPlusSquare, FiShare, FiX } from "react-icons/fi";

const STEPS = [
  { icon: <FiShare />, title: "Tap Share", body: "The square with an arrow, at the bottom of Safari (top right on iPad)." },
  { icon: <FiPlusSquare />, title: "Tap “Add to Home Screen”", body: "Scroll the list down a little if you don't see it." },
  { icon: <span className="install-step-add">Add</span>, title: "Tap Add", body: "Then open U.Do from your Home Screen — it runs full screen and can send reminders." },
];

/** The iPhone and iPad install walkthrough. Safari has no install button of its own. */
function InstallGuide({ onClose }) {
  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <section className="modal-card install-guide" role="dialog" aria-modal="true" aria-labelledby="install-title" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <h3 id="install-title">Add U.Do to your Home Screen</h3>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <FiX />
          </button>
        </div>
        <ol className="install-steps">
          {STEPS.map((step, i) => (
            <li key={step.title}>
              <span className="install-step-icon" aria-hidden="true">{step.icon}</span>
              <span>
                <strong>
                  {i + 1}. {step.title}
                </strong>
                <span className="panel-note">{step.body}</span>
              </span>
            </li>
          ))}
        </ol>
        <button type="button" className="btn btn-primary" onClick={onClose}>
          Got it
        </button>
      </section>
    </div>,
    document.body
  );
}

export default InstallGuide;
