/**
 * Categorical series identity for charts.
 *
 * With no hue in the palette, six categories can only be told apart by tone,
 * and six steps of one ramp sit about 1.37:1 apart at best — too close to read
 * on a small slice. Each series therefore also carries a texture, so the
 * distinction survives when the tones nearly match.
 *
 * The chart and its legend both read from here, so a slice and its key can
 * never drift apart.
 */
export const SERIES_COUNT = 6;

export const seriesTone = (index) => `var(--chart-${(index % SERIES_COUNT) + 1})`;

/** Namespaced: two charts on one page would otherwise share <defs> ids. */
export const patternId = (scope, index) => `udo-${scope}-series-${index % SERIES_COUNT}`;

/** Fill for slice/bar `index` — the texture, not the flat tone. */
export const seriesFill = (scope, index) => `url(#${patternId(scope, index)})`;

/**
 * The same texture as a CSS background, for legend swatches and list rows.
 * SVG patterns cannot be referenced from CSS, so these repeat them as
 * gradients — visually identical at swatch size.
 */
export const seriesStyle = (index) => {
  const tone = seriesTone(index);
  const mark = "var(--surface)";
  const i = index % SERIES_COUNT;

  // Each entry mirrors the same index in ChartPatterns: 1 forward slash,
  // 2 backslash, 3 horizontal, 4 vertical, 5 dots. If these two lists ever
  // disagree a legend key stops matching the slice it labels.
  const texture = [
    null,
    `repeating-linear-gradient(45deg, ${mark} 0 2px, transparent 2px 6px)`,
    `repeating-linear-gradient(135deg, ${mark} 0 2px, transparent 2px 6px)`,
    `repeating-linear-gradient(0deg, ${mark} 0 2px, transparent 2px 6px)`,
    `repeating-linear-gradient(90deg, ${mark} 0 2px, transparent 2px 6px)`,
    `radial-gradient(${mark} 1.4px, transparent 1.5px)`,
  ][i];

  if (!texture) return { background: tone };

  return {
    backgroundImage: texture,
    backgroundColor: tone,
    ...(i === 5 ? { backgroundSize: "6px 6px" } : null),
  };
};
