import { useLocation } from "react-router-dom";

import { SECTIONS } from "../navigation.js";

/**
 * A section whose backend exists but whose screen is a later phase. It says
 * which phase and what data is already landing, so the console never implies
 * a feature is broken when it is simply not built yet.
 */
export default function NotInstrumented() {
  const { pathname } = useLocation();
  const section = SECTIONS.find((entry) => entry.path === pathname);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{section?.label || "Section"}</h1>
          <p className="page-note">
            The collections behind this section exist and rules already protect them.
            The screen lands in phase {section?.phase ?? "2"}.
          </p>
        </div>
      </div>

      <div className="panel">
        <div className="panel-pad">
          <p className="page-note" style={{ margin: 0 }}>
            Nothing is being hidden here — there is simply no view yet. Until then,
            the Overview carries every figure that can be computed from current data.
          </p>
        </div>
      </div>
    </>
  );
}
