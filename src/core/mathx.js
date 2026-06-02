// src/core/mathx.js
// 벽(투영면)은 z=0 평면. 정점을 광원 기준으로 벽에 투영한다.

/**
 * @param {[number,number,number]} P  3D 정점
 * @param {{type:string, vec:[number,number,number]}} light
 * @returns {[number,number]} 벽 평면(z=0) 위 좌표
 * @throws {Error} directional: 광선이 벽과 평행(dz≈0)이면 투영 불가.
 * @throws {Error} point: 광원이 occluder와 같은 깊이(lz≈pz)면 투영 불가.
 */
export function projectVertex(P, light) {
  const [px, py, pz] = P;
  if (light.type === 'directional') {
    const [dx, dy, dz] = light.vec;
    if (Math.abs(dz) < 1e-9) throw new Error('projectVertex: directional light parallel to wall (dz≈0)');
    // P + t*dir, (P+t*dir).z = 0  →  t = -pz/dz
    const t = -pz / dz;
    return [px + t * dx, py + t * dy];
  } else {
    // point: L + t*(P-L), z=0  →  t = lz/(lz-pz)
    const [lx, ly, lz] = light.vec;
    if (Math.abs(lz - pz) < 1e-9) throw new Error('projectVertex: point light at occluder depth (lz≈pz)');
    const t = lz / (lz - pz);
    return [lx + t * (px - lx), ly + t * (py - ly)];
  }
}

/**
 * Andrew's monotone chain. 입력 점들의 2D convex hull (CCW, 중복 꼭짓점 없음).
 * @param {Array<[number,number]>} points
 * @returns {Array<[number,number]>}
 */
export function convexHull2D(points) {
  const pts = points
    .map((p) => [p[0], p[1]])
    .sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
  if (pts.length <= 2) return pts.slice();
  const cross = (o, a, b) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
      lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
      upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/**
 * 수직선 x=xv 가 convex 폴리곤과 만나는 y 구간 [yLow, yHigh]. 안 만나면 null.
 * @param {Array<[number,number]>} poly  (CCW 또는 CW 무관)
 * @param {number} xv
 * @returns {[number,number]|null}
 */
export function polygonVerticalSpan(poly, xv) {
  const ys = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % n];
    if (x1 === x2) {
      // 수직 에지: xv와 일치하면 양 끝 y 포함
      if (Math.abs(x1 - xv) < 1e-12) { ys.push(y1, y2); }
      continue;
    }
    const tlo = Math.min(x1, x2), thi = Math.max(x1, x2);
    if (xv < tlo - 1e-12 || xv > thi + 1e-12) continue;
    const t = (xv - x1) / (x2 - x1);
    ys.push(y1 + t * (y2 - y1));
  }
  if (ys.length === 0) return null;
  return [Math.min(...ys), Math.max(...ys)];
}
