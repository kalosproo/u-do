import { useEffect, useRef } from "react";
import { animate, createAnimatable, createScope, stagger, utils } from "animejs";

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

    let scope = null;
    let detachPointer = null;

    const build = () => {
      if (motionQuery.matches) return;

      const isTouch = coarseQuery.matches;

      scope = createScope({ root }).add(() => {
        // ---- A. ambient orbs ------------------------------------------------
        animate(".udo-orb-1", {
          translateX: [0, 90, -50, 0],
          translateY: [0, -60, 80, 0],
          scale: [1, 1.12, 0.92, 1],
          duration: 26000,
          ease: "inOutSine",
          loop: true,
        });

        animate(".udo-orb-2", {
          translateX: [0, -70, 55, 0],
          translateY: [0, 70, -45, 0],
          scale: [1, 0.9, 1.1, 1],
          duration: 30000,
          ease: "inOutSine",
          loop: true,
        });

        // The surface that makes the orbs feel alive rather than merely moving.
        // Touch devices skip it: a full-frame displacement map is the single
        // most expensive thing here.
        if (!isTouch) {
          animate(".udo-turbulence", {
            baseFrequency: [0.008, 0.018, 0.008],
            duration: 23000,
            ease: "inOutSine",
            loop: true,
          });

          animate(".udo-displacement", {
            scale: [8, 18, 8],
            duration: 23000,
            ease: "inOutSine",
            loop: true,
          });
        }

        // ---- B. hairlines ---------------------------------------------------
        animate(".udo-line", {
          translateX: [0, 14, -10, 0],
          translateY: [0, -8, 6, 0],
          duration: 13000,
          delay: stagger(900),
          ease: "inOutSine",
          loop: true,
        });

        // ---- C. micro particles ---------------------------------------------
        animate(".udo-particle", {
          translateY: [0, -25, 10, 0],
          translateX: [0, 12, -8, 0],
          opacity: isTouch ? [0.04, 0.12, 0.04] : [0.05, 0.2, 0.05],
          duration: 7000,
          delay: stagger(420),
          ease: "inOutSine",
          loop: true,
        });

        // ---- cursor inertia, desktop only ------------------------------------
        if (isTouch) return;

        // createAnimatable keeps the pointer response off React's render path:
        // no state, no re-render, just a long-eased nudge toward the cursor.
        const orb1 = createAnimatable(root.querySelector(".udo-orb-1-wrap"), {
          x: { duration: 2000, ease: "out(3)" },
          y: { duration: 2000, ease: "out(3)" },
        });
        const orb2 = createAnimatable(root.querySelector(".udo-orb-2-wrap"), {
          x: { duration: 2200, ease: "out(3)" },
          y: { duration: 2200, ease: "out(3)" },
        });

        const onPointerMove = (event) => {
          // -1..1 from the centre of the viewport, then a hard cap, so this
          // drifts with the cursor rather than following it.
          const nx = (event.clientX / window.innerWidth) * 2 - 1;
          const ny = (event.clientY / window.innerHeight) * 2 - 1;
          orb1.x(utils.clamp(nx * 18, -18, 18));
          orb1.y(utils.clamp(ny * 18, -18, 18));
          orb2.x(utils.clamp(nx * -12, -12, 12));
          orb2.y(utils.clamp(ny * -12, -12, 12));
        };

        window.addEventListener("pointermove", onPointerMove, { passive: true });
        detachPointer = () => window.removeEventListener("pointermove", onPointerMove);
      });
    };

    const teardown = () => {
      detachPointer?.();
      detachPointer = null;
      scope?.revert();
      scope = null;
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
          <filter id="udo-organic" x="-25%" y="-25%" width="150%" height="150%">
            <feTurbulence
              className="udo-turbulence"
              type="fractalNoise"
              baseFrequency="0.008"
              numOctaves="2"
              seed="7"
              result="noise"
            />
            <feDisplacementMap
              className="udo-displacement"
              in="SourceGraphic"
              in2="noise"
              scale="8"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>

        {/* A. orbs. The wrapper carries the cursor offset so it never fights
            the drift animation on the shape itself. */}
        <g filter="url(#udo-organic)">
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
