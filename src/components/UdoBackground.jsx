import { useEffect, useRef } from "react";

/**
 * The ambient background.
 *
 * Purely decorative: fixed to the viewport, behind everything, and inert to
 * the pointer. Three layers, all monochrome, all driven from the same theme
 * tokens the rest of the app uses — so it follows a theme switch without
 * knowing a theme system exists.
 *
 *   A. two large orbs, slowly drifting and breathing
 *   B. a few hairline paths crossing the field
 *   C. a handful of micro particles
 *
 * The orbs run through an SVG turbulence filter whose frequency and
 * displacement are themselves animated, which is what stops the drift reading
 * as two ovals sliding around. It should never be noticed directly.
 */

const PARTICLES = [
  { cx: 14, cy: 22, r: 1.5 }, { cx: 27, cy: 68, r: 1.1 }, { cx: 41, cy: 12, r: 1.8 },
  { cx: 55, cy: 44, r: 1.2 }, { cx: 63, cy: 81, r: 1.6 }, { cx: 72, cy: 29, r: 1.0 },
  { cx: 84, cy: 57, r: 1.4 }, { cx: 91, cy: 16, r: 1.2 }, { cx: 36, cy: 91, r: 1.3 },
];

const LINES = [
  "M -5 28 C 25 22, 60 34, 105 24",
  "M -5 55 C 30 62, 68 48, 105 58",
  "M -5 78 C 22 84, 64 72, 105 82",
  "M 18 -5 C 26 30, 14 66, 22 105",
];

function UdoBackground() {
  const rootRef = useRef(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    // Enforced here, not only in CSS: the spec requires the JS layer to stand
    // down too, so nothing is scheduled at all rather than merely hidden.
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    // Coarse pointer means touch: no cursor parallax, and a calmer field.
    const coarseQuery = window.matchMedia("(pointer: coarse), (max-width: 768px)");

    let detachPointer = null;

    const build = () => {
      if (motionQuery.matches) return;

      const isTouch = coarseQuery.matches;

      {
        /* ------------------------------------------------------------------
           One clock, no loops.

           Every layer used to run its own keyframe loop that ended on the
           value it started from, so the whole field returned to its opening
           pose on a fixed cycle and you could feel the seam. Here each layer
           is the sum of two sines whose periods share no common factor, so
           the combined pose has no practical repeat — the field keeps moving
           somewhere it has not been.

           Only transform and opacity are written, and only on elements that
           are their own layer, so the whole thing stays on the compositor.
           ------------------------------------------------------------------ */
        const TAU = Math.PI * 2;

        // Amplitudes are viewBox units — the canvas is 100 wide, so 10 is a
        // tenth of the field. Restraint is the point: ambient motion should be
        // noticed only if you look for it. Periods are seconds, and coprime.
        const LAYERS = [
          { sel: ".udo-orb-1-wrap", ax: [10, 53], bx: [5, 31], ay: [8, 47], by: [4, 29], sx: [0.07, 67], sy: [0.06, 43], parallax: 4.5 },
          { sel: ".udo-orb-2-wrap", ax: [8, 61], bx: [4, 37], ay: [9, 43], by: [5, 23], sx: [0.06, 71], sy: [0.08, 59], parallax: -3.2 },
          // Furthest back, so it moves least — the parallax cue that sells depth.
          { sel: ".udo-orb-3-wrap", ax: [6, 89], bx: [3, 41], ay: [5, 79], by: [3, 53], sx: [0.05, 97], sy: [0.04, 73], parallax: 1.4 },
        ];

        const nodes = LAYERS.map((layer) => ({
          ...layer,
          el: root.querySelector(layer.sel),
        })).filter((layer) => layer.el);

        const lines = [...root.querySelectorAll(".udo-line")];
        const motes = [...root.querySelectorAll(".udo-particle")];

        // Pointer target and the value chasing it. Lerping toward the target
        // every frame is what gives the parallax weight: it arrives late and
        // settles, rather than snapping to the cursor.
        let targetX = 0;
        let targetY = 0;
        let easedX = 0;
        let easedY = 0;

        const started = performance.now();
        let raf = 0;

        const frame = (now) => {
          const t = (now - started) / 1000;

          // ~0.06 per frame reaches the target in about a second, and keeps
          // easing the whole way: no arrival edge.
          easedX += (targetX - easedX) * 0.06;
          easedY += (targetY - easedY) * 0.06;

          for (const layer of nodes) {
            const x =
              layer.ax[0] * Math.sin((TAU * t) / layer.ax[1]) +
              layer.bx[0] * Math.sin((TAU * t) / layer.bx[1] + 1.7) +
              easedX * layer.parallax;
            const y =
              layer.ay[0] * Math.sin((TAU * t) / layer.ay[1] + 0.9) +
              layer.by[0] * Math.sin((TAU * t) / layer.by[1] + 2.3) +
              easedY * layer.parallax;
            // Each axis breathes on its own period, so the ellipse is never the
            // same shape twice — the irregularity the filter used to supply,
            // for the cost of two sines instead of a full-frame raster pass.
            const sx = 1 + layer.sx[0] * Math.sin((TAU * t) / layer.sx[1]);
            const sy = 1 + layer.sy[0] * Math.sin((TAU * t) / layer.sy[1] + 1.1);

            layer.el.style.transform =
              `translate(${x.toFixed(3)}px, ${y.toFixed(3)}px) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`;
          }

          // Hairlines: a long slow slide, each on its own phase.
          for (let i = 0; i < lines.length; i++) {
            const ph = i * 1.9;
            const x = 3.4 * Math.sin((TAU * t) / (38 + i * 7) + ph);
            const y = 2.1 * Math.sin((TAU * t) / (29 + i * 5) + ph * 1.3);
            lines[i].style.transform = `translate(${x.toFixed(3)}px, ${y.toFixed(3)}px)`;
          }

          // Motes drift and breathe in brightness. The two periods differ, so a
          // mote is rarely at its brightest in the same place twice.
          for (let i = 0; i < motes.length; i++) {
            const ph = i * 0.83;
            const x = 2.6 * Math.sin((TAU * t) / (23 + i * 3) + ph);
            const y = 3.4 * Math.sin((TAU * t) / (19 + i * 4) + ph * 1.6);
            const glow = 0.5 + 0.5 * Math.sin((TAU * t) / (13 + i * 2) + ph * 2.1);
            motes[i].style.transform = `translate(${x.toFixed(3)}px, ${y.toFixed(3)}px)`;
            motes[i].style.opacity = ((isTouch ? 0.03 : 0.04) + glow * (isTouch ? 0.06 : 0.13)).toFixed(3);
          }

          raf = requestAnimationFrame(frame);
        };

        raf = requestAnimationFrame(frame);

        const onPointerMove = (event) => {
          // -1..1 from the centre of the viewport. The layer's own parallax
          // factor scales it, so near layers travel further than far ones.
          const clamp = (v) => Math.max(-1, Math.min(1, v));
          targetX = clamp((event.clientX / window.innerWidth) * 2 - 1);
          targetY = clamp((event.clientY / window.innerHeight) * 2 - 1);
        };

        if (!isTouch) {
          window.addEventListener("pointermove", onPointerMove, { passive: true });
        }

        detachPointer = () => {
          cancelAnimationFrame(raf);
          window.removeEventListener("pointermove", onPointerMove);
          // Hand every element back the pose the stylesheet gives it, so a
          // rebuild or a stand-down never leaves a transform stranded.
          for (const layer of nodes) layer.el.style.transform = "";
          for (const line of lines) line.style.transform = "";
          for (const mote of motes) {
            mote.style.transform = "";
            mote.style.opacity = "";
          }
        };
      }
    };

    const teardown = () => {
      detachPointer?.();
      detachPointer = null;
    };

    build();

    // Rebuild when the user changes either preference mid-session, so the
    // running animations match the current setting rather than the one at
    // mount time.
    const rebuild = () => {
      teardown();
      build();
    };

    motionQuery.addEventListener("change", rebuild);
    coarseQuery.addEventListener("change", rebuild);

    return () => {
      motionQuery.removeEventListener("change", rebuild);
      coarseQuery.removeEventListener("change", rebuild);
      teardown();
    };
  }, []);

  return (
    <div className="udo-background" ref={rootRef} aria-hidden="true">
      <svg
        className="udo-canvas"
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid slice"
        focusable="false"
      >
        <defs>
          {/* An orb is a pool of light. The stops take it from a carrying
              centre to nothing at the rim, so there is no edge to notice —
              a flat fill drew a visible disc across any sparse page. Colours
              live in the stylesheet, like every other colour in the app. */}
          <radialGradient id="udo-orb-fade">
            <stop className="udo-stop-core" offset="0%" />
            <stop className="udo-stop-mid" offset="45%" />
            <stop className="udo-stop-edge" offset="100%" />
          </radialGradient>

          <radialGradient id="udo-mote-fade">
            <stop className="udo-stop-mote" offset="0%" />
            <stop className="udo-stop-edge" offset="100%" />
          </radialGradient>

        </defs>

        {/* A. orbs. The wrapper carries the cursor offset so it never fights
            the drift animation on the shape itself. */}
        <g>
          {/* A third orb, larger and slower than the other two. Two shapes of
              similar size read as two shapes; a third at a different scale
              reads as depth. */}
          <g className="udo-orb-3-wrap">
            <ellipse className="udo-orb udo-orb-3" cx="52" cy="46" rx="46" ry="40" />
          </g>
          <g className="udo-orb-1-wrap">
            <ellipse className="udo-orb udo-orb-1" cx="24" cy="30" rx="30" ry="26" />
          </g>
          <g className="udo-orb-2-wrap">
            <ellipse className="udo-orb udo-orb-2" cx="78" cy="72" rx="26" ry="30" />
          </g>
        </g>

        {/* B. hairlines */}
        <g className="udo-lines">
          {LINES.map((d, i) => (
            <path key={d} className={`udo-line udo-line-${i + 1}`} d={d} />
          ))}
        </g>

        {/* C. micro particles */}
        <g className="udo-particles">
          {PARTICLES.map((p) => (
            <circle
              key={`${p.cx}-${p.cy}`}
              className="udo-particle"
              cx={p.cx}
              cy={p.cy}
              r={p.r}
            />
          ))}
        </g>
      </svg>
    </div>
  );
}

export default UdoBackground;
