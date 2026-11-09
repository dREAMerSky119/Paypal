/**
 * Geometry for the small overview trend chart. Returns SVG paths for a
 * smooth line (flat-tangent Béziers, so it never overshoots the data) plus
 * the y-axis tick labels, top to bottom.
 */
export function trendGeometry(values, { width = 280, height = 120 } = {}) {
  if (!values?.length) return { line: "", area: "", ticks: [] };
  const max = Math.max(...values, 1);
  const step = Math.max(5, Math.ceil(max / 4 / 5) * 5);
  const yMax = step * 4;
  const xAt = (i) => (values.length === 1 ? 0 : (i * width) / (values.length - 1));
  const yAt = (v) => height - (v / yMax) * height;
  const r = (n) => Math.round(n * 10) / 10;

  let line = `M${r(xAt(0))} ${r(yAt(values[0]))}`;
  for (let i = 1; i < values.length; i += 1) {
    const x0 = xAt(i - 1);
    const x1 = xAt(i);
    const mid = (x0 + x1) / 2;
    line += ` C${r(mid)} ${r(yAt(values[i - 1]))} ${r(mid)} ${r(yAt(values[i]))} ${r(x1)} ${r(yAt(values[i]))}`;
  }
  return {
    line,
    area: `${line} V${height} H0Z`,
    ticks: [step * 4, step * 3, step * 2, step],
  };
}
