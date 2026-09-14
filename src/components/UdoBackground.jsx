import { useEffect, useRef } from "react";

/**
 * The ambient background.
 *
 * Purely decorative: fixed to the viewport, behind everything, and inert to
 * the pointer. Three layers, all monochrome, all driven from the same theme
 * tokens the rest of the app uses — so it follows a theme switch without
 * knowing a theme system exists.
 *
 *   A. three orbs, drifting, breathing and parallaxing
 *   B. two hairline fields, counter-rotating against each other
 *   C. micro particles that shimmer in place
 *   D. a few motes that cross the whole field and wrap
 *
 * Everything runs off one clock. Each layer is the sum of sines whose periods
 * share no common factor, so the field has no repeat you can catch, and the
 * only properties written are transform and opacity — nothing here can cost a
 * layout or a paint. It should never be noticed directly.
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

/* A second hairline field, set against the first. The two counter-rotate, so
   where they cross keeps changing — motion you read as depth rather than as
   lines moving. */
const LINES_B = [
  "M -5 14 C 30 20, 62 8, 105 16",
  "M -5 41 C 26 34, 70 46, 105 38",
  "M -5 67 C 34 74, 66 60, 105 70",
  "M 74 -5 C 66 32, 80 68, 72 105",
];

/* The bubble field.

   Sizes vary widely on purpose: a field of same-size circles reads as a
   pattern, a field of mixed ones reads as depth. x is where a bubble sits
   across the canvas, r its radius, rise how many units per second it climbs,
   sway how far it wanders on the way, and phase where in its climb it starts
   so they never travel as a pack. Larger bubbles rise a little faster and
   carry a little less ink, so the field does not get heavy where they cluster. */
const BUBBLES = [
  { x:  5, r: 2.9, rise: 1.5, sway: 3.4, phase:   0, ink: 0.55 },
  { x: 11, r: 1.1, rise: 0.8, sway: 2.1, phase:  74, ink: 0.95 },
  { x: 17, r: 2.0, rise: 1.2, sway: 2.8, phase:  31, ink: 0.75 },
  { x: 23, r: 0.8, rise: 0.7, sway: 1.6, phase: 108, ink: 1 },
  { x: 29, r: 3.3, rise: 1.7, sway: 4.0, phase:  52, ink: 0.48 },
  { x: 35, r: 1.4, rise: 0.9, sway: 2.4, phase:  12, ink: 0.9 },
  { x: 42, r: 2.3, rise: 1.3, sway: 3.0, phase:  91, ink: 0.68 },
  { x: 48, r: 0.9, rise: 0.75, sway: 1.9, phase:  39, ink: 1 },
  { x: 55, r: 2.7, rise: 1.45, sway: 3.6, phase: 120, ink: 0.58 },
  { x: 61, r: 1.2, rise: 0.85, sway: 2.2, phase:  63, ink: 0.92 },
  { x: 67, r: 3.0, rise: 1.6, sway: 3.8, phase:  20, ink: 0.52 },
  { x: 73, r: 1.6, rise: 1.0, sway: 2.6, phase:  99, ink: 0.85 },
  { x: 79, r: 0.7, rise: 0.7, sway: 1.5, phase:  45, ink: 1 },
  { x: 85, r: 2.5, rise: 1.35, sway: 3.2, phase:   7, ink: 0.62 },
  { x: 90, r: 1.3, rise: 0.9, sway: 2.3, phase:  82, ink: 0.9 },
  { x: 96, r: 2.1, rise: 1.25, sway: 2.9, phase: 57, ink: 0.72 },
];

/* Motes that cross the whole field and wrap. y is where each sits, speed is
   units per second, phase spreads them out so they never arrive together. */
const DRIFTERS = [
  { y: 18, r: 0.9, speed: 1.9, phase: 0 },
  { y: 37, r: 1.3, speed: 1.3, phase: 52 },
  { y: 59, r: 0.8, speed: 2.4, phase: 21 },
  { y: 73, r: 1.1, speed: 1.6, phase: 88 },
  { y: 88, r: 1.0, speed: 2.0, phase: 64 },
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
          { sel: ".udo-orb-1-wrap", ax: [10, 53], bx: [5, 31], ay: [8, 47], by: [4, 29], sx: [0.07, 67], sy: [0.06, 43], parallax: 4.5, depth: 1 },
          { sel: ".udo-orb-2-wrap", ax: [8, 61], bx: [4, 37], ay: [9, 43], by: [5, 23], sx: [0.06, 71], sy: [0.08, 59], parallax: -3.2, depth: 0.62 },
          // Furthest back, so it moves least — the parallax cue that sells depth.
          { sel: ".udo-orb-3-wrap", ax: [6, 89], bx: [3, 41], ay: [5, 79], by: [3, 53], sx: [0.05, 97], sy: [0.04, 73], parallax: 1.4, depth: 0.28 },
        ];

        const nodes = LAYERS.map((layer) => ({
          ...layer,
          el: root.querySelector(layer.sel),
        })).filter((layer) => layer.el);

        const lines = [...root.querySelectorAll(".udo-lines:not(.udo-lines-b) .udo-line")];
        const linesB = [...root.querySelectorAll(".udo-lines-b .udo-line")];
        const fieldA = root.querySelector(".udo-lines:not(.udo-lines-b)");
        const fieldB = root.querySelector(".udo-lines-b");
        const motes = [...root.querySelectorAll(".udo-particle")];
        const drifters = [...root.querySelectorAll(".udo-drifter")];
        const bubbles = [...root.querySelectorAll(".udo-bubble")];

        // Pointer target and the value chasing it. Lerping toward the target
        // every frame is what gives the parallax weight: it arrives late and
        // settles, rather than snapping to the cursor.
        let targetX = 0;
        let targetY = 0;
        let easedX = 0;
        let easedY = 0;

        // Scroll offset, eased the same way. Read inside the frame rather than
        // in a scroll listener: touching scrollY during a scroll event forces
        // the layout the browser was about to do anyway, and doing it here
        // costs nothing because a frame is already in flight.
        let easedScroll = 0;

        const started = performance.now();
        let raf = 0;

        const frame = (now) => {
          const t = (now - started) / 1000;

          // ~0.06 per frame reaches the target in about a second, and keeps
          // easing the whole way: no arrival edge.
          easedX += (targetX - easedX) * 0.06;
          easedY += (targetY - easedY) * 0.06;

          // Capped, so a long page does not slide the field off its own canvas:
          // the parallax is a hint of depth, not a scroll indicator.
          const scroll = Math.max(-14, Math.min(14, window.scrollY * 0.012));
          easedScroll += (scroll - easedScroll) * 0.08;

          for (const layer of nodes) {
            const x =
              layer.ax[0] * Math.sin((TAU * t) / layer.ax[1]) +
              layer.bx[0] * Math.sin((TAU * t) / layer.bx[1] + 1.7) +
              easedX * layer.parallax;
            const y =
              layer.ay[0] * Math.sin((TAU * t) / layer.ay[1] + 0.9) +
              layer.by[0] * Math.sin((TAU * t) / layer.by[1] + 2.3) +
              easedY * layer.parallax +
              // Far layers lag the scroll, near layers lead it. This is the
              // cue that reads as distance more than anything else here.
              easedScroll * layer.depth;
            // Each axis breathes on its own period, so the ellipse is never the
            // same shape twice — the irregularity the filter used to supply,
            // for the cost of two sines instead of a full-frame raster pass.
            const sx = 1 + layer.sx[0] * Math.sin((TAU * t) / layer.sx[1]);
            const sy = 1 + layer.sy[0] * Math.sin((TAU * t) / layer.sy[1] + 1.1);

            layer.el.style.transform =
              `translate(${x.toFixed(3)}px, ${y.toFixed(3)}px) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`;
          }

          // The two hairline fields turn against each other, very slowly — a
          // full turn takes minutes. Rotation is the one motion translation
          // cannot fake, and where the two sets cross keeps moving because of
          // it. Both pivot on the canvas centre, set in the stylesheet.
          if (fieldA) fieldA.style.transform = `rotate(${(t * 0.6).toFixed(3)}deg)`;
          if (fieldB) fieldB.style.transform = `rotate(${(-t * 0.42).toFixed(3)}deg)`;

          // Hairlines: a long slow slide, each on its own phase.
          for (let i = 0; i < lines.length; i++) {
            const ph = i * 1.9;
            const x = 3.4 * Math.sin((TAU * t) / (38 + i * 7) + ph);
            const y = 2.1 * Math.sin((TAU * t) / (29 + i * 5) + ph * 1.3);
            lines[i].style.transform = `translate(${x.toFixed(3)}px, ${y.toFixed(3)}px)`;
          }

          for (let i = 0; i < linesB.length; i++) {
            const ph = i * 2.4 + 0.7;
            const x = 2.8 * Math.sin((TAU * t) / (44 + i * 6) + ph);
            const y = 2.6 * Math.sin((TAU * t) / (33 + i * 4) + ph * 1.5);
            linesB[i].style.transform = `translate(${x.toFixed(3)}px, ${y.toFixed(3)}px)`;
          }

          // Motes crossing the field. Each wraps at the far side; the fade at
          // both ends is what hides the wrap, so there is no seam to catch.
          for (let i = 0; i < drifters.length; i++) {
            const d = DRIFTERS[i];
            const span = 130;
            const x = ((t * d.speed + d.phase) % span) - 15;
            // Ride the vertical drift of the field so they are not on rails.
            const y = 2.2 * Math.sin((TAU * t) / (26 + i * 5) + i);
            // The canvas is 0..100 across. Ramping from the canvas edge inward
            // means a mote is already at nothing before it leaves the visible
            // area, so both the entrance and the wrap are invisible. Ramping
            // from off-canvas instead let one arrive at the edge two-thirds
            // lit, which reads as a pop.
            const edge = Math.max(0, Math.min(1, Math.min(x, 100 - x) / 18));
            drifters[i].style.transform =
              `translate(${x.toFixed(3)}px, ${y.toFixed(3)}px)`;
            drifters[i].style.opacity = (edge * (isTouch ? 0.07 : 0.14)).toFixed(3);
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

          // The bubble field. Each climbs at its own rate and wraps at the top;
          // the fade is measured from the canvas edges inward, so a bubble is
          // already at nothing before it reaches either one and neither the
          // entrance nor the wrap is ever visible.
          for (let i = 0; i < bubbles.length; i++) {
            const bub = BUBBLES[i];
            const span = 130;
            // 115 down to -15: rising, because -y is up.
            const y = 115 - ((t * bub.rise + bub.phase) % span);
            const sway =
              bub.sway * Math.sin((TAU * t) / (21 + i * 3) + i * 0.7) +
              bub.sway * 0.4 * Math.sin((TAU * t) / (13 + i * 2) + i * 1.9);
            // Bigger bubbles sit further back, so they take less of the scroll.
            const lift = easedScroll * (0.25 + bub.r * 0.12);
            const edge = Math.max(0, Math.min(1, Math.min(y, 100 - y) / 16));

            bubbles[i].style.transform =
              `translate(${sway.toFixed(3)}px, ${(y + lift).toFixed(3)}px)`;
            // --bg-orb is a 5% white, chosen for a shape the size of a third
            // of the screen. A bubble is a fraction of that area, so at the
            // same alpha it is invisible — this is the same ink, carried at a
            // weight that suits the size of the thing carrying it.
            bubbles[i].style.opacity =
              (edge * bub.ink * (isTouch ? 1.1 : 2.1)).toFixed(3);
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
          for (const line of linesB) line.style.transform = "";
          for (const el of [fieldA, fieldB]) if (el) el.style.transform = "";
          for (const d of drifters) {
            d.style.transform = "";
            d.style.opacity = "";
          }
          for (const bub of bubbles) {
            bub.style.transform = "";
            bub.style.opacity = "";
          }
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

        {/* B. two hairline fields, counter-rotating */}
        <g className="udo-lines">
          {LINES.map((d, i) => (
            <path key={d} className={`udo-line udo-line-${i + 1}`} d={d} />
          ))}
        </g>

        <g className="udo-lines udo-lines-b">
          {LINES_B.map((d, i) => (
            <path key={d} className={`udo-line udo-line-b-${i + 1}`} d={d} />
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

        {/* D. motes crossing the field */}
        <g className="udo-drifters">
          {DRIFTERS.map((d) => (
            <circle key={d.phase} className="udo-drifter" cx="0" cy={d.y} r={d.r} />
          ))}
        </g>

        {/* E. the bubble field, rising */}
        <g className="udo-bubbles">
          {BUBBLES.map((bub) => (
            <circle key={`${bub.x}-${bub.phase}`} className="udo-bubble" cx={bub.x} cy="0" r={bub.r} />
          ))}
        </g>
      </svg>
    </div>
  );
}

export default UdoBackground;
