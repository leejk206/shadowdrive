// src/core/collide2d.js
// 2D 충돌 기하(순수 함수, 결정론). 그림자 convex 폴리곤을 고체로 취급하는 차량 물리의 토대.
//   - convexVsConvex: 두 볼록 폴리곤 SAT → 최소 분리 벡터(MTV)
//   - circleVsConvex: 원(바퀴) vs 볼록 폴리곤 → 법선/관통깊이/접촉점
// 폴리곤은 CCW 정점 배열 [[x,y], ...]. 외향 edge 법선 n = normalize(edge.y, -edge.x).

/** OBB(중심·각도·반폭/반높이) → CCW 코너 4개. */
export function obbCorners(cx, cy, angle, hw, hh) {
  const c = Math.cos(angle), s = Math.sin(angle);
  // 로컬 코너 CCW: (-hw,-hh),(hw,-hh),(hw,hh),(-hw,hh)
  const lc = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
  return lc.map(([x, y]) => [cx + c * x - s * y, cy + s * x + c * y]);
}

/** 폴리곤의 외향 단위 edge 법선 배열(CCW 가정). */
function edgeNormals(poly) {
  const n = poly.length, out = [];
  for (let i = 0; i < n; i++) {
    const [ax, ay] = poly[i], [bx, by] = poly[(i + 1) % n];
    const ex = bx - ax, ey = by - ay;
    const len = Math.hypot(ex, ey) || 1;
    out.push([ey / len, -ex / len]); // 외향 법선(CCW)
  }
  return out;
}

function projectPoly(poly, ax, ay) {
  let mn = Infinity, mx = -Infinity;
  for (const [x, y] of poly) {
    const d = x * ax + y * ay;
    if (d < mn) mn = d;
    if (d > mx) mx = d;
  }
  return [mn, mx];
}

function centroid(poly) {
  let x = 0, y = 0;
  for (const p of poly) { x += p[0]; y += p[1]; }
  return [x / poly.length, y / poly.length];
}

/**
 * 두 볼록 폴리곤(CCW) SAT. 겹치면 a를 b 밖으로 빼내는 최소 분리 벡터.
 * @returns {null | {nx:number, ny:number, depth:number}} 법선은 b→a 방향(이 방향으로 a를 depth만큼 밀면 분리).
 */
export function convexVsConvex(a, b) {
  const axes = edgeNormals(a).concat(edgeNormals(b));
  let best = Infinity, bnx = 0, bny = 0;
  for (const [ax, ay] of axes) {
    const [amn, amx] = projectPoly(a, ax, ay);
    const [bmn, bmx] = projectPoly(b, ax, ay);
    const overlap = Math.min(amx, bmx) - Math.max(amn, bmn);
    if (overlap <= 0) return null; // 분리축 발견
    if (overlap < best) { best = overlap; bnx = ax; bny = ay; }
  }
  // 법선을 b→a 방향으로 정렬
  const ca = centroid(a), cb = centroid(b);
  if ((ca[0] - cb[0]) * bnx + (ca[1] - cb[1]) * bny < 0) { bnx = -bnx; bny = -bny; }
  return { nx: bnx, ny: bny, depth: best };
}

/**
 * 원 vs 볼록 폴리곤(CCW). edge/코너 보로노이 영역 처리.
 * @returns {null | {nx,ny,depth,px,py}} 법선은 poly→원 방향, (px,py) 폴리곤 위 접촉점.
 */
export function circleVsConvex(cx, cy, r, poly) {
  const n = poly.length;
  const normals = edgeNormals(poly);
  let maxSd = -Infinity, k = 0;
  for (let i = 0; i < n; i++) {
    const [vx, vy] = poly[i], [nx, ny] = normals[i];
    const sd = (cx - vx) * nx + (cy - vy) * ny; // 외향 부호거리
    if (sd > maxSd) { maxSd = sd; k = i; }
  }
  const [vx, vy] = poly[k], [wx, wy] = poly[(k + 1) % n];
  const ex = wx - vx, ey = wy - vy;
  const elen2 = ex * ex + ey * ey || 1;

  if (maxSd > 0) {
    // 중심이 폴리곤 밖(edge k 너머). edge 세그먼트 투영으로 edge/코너 판정.
    let t = ((cx - vx) * ex + (cy - vy) * ey) / elen2;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    const px = vx + t * ex, py = vy + t * ey;
    const dx = cx - px, dy = cy - py, d = Math.hypot(dx, dy);
    if (d >= r) return null;
    const inv = d > 1e-9 ? 1 / d : 0;
    const nx = d > 1e-9 ? dx * inv : normals[k][0];
    const ny = d > 1e-9 ? dy * inv : normals[k][1];
    return { nx, ny, depth: r - d, px, py };
  }
  // 중심이 폴리곤 내부 → 가장 가까운 면(maxSd, 가장 덜 음수)으로 밀어냄.
  const [nx, ny] = normals[k];
  const t = ((cx - vx) * ex + (cy - vy) * ey) / elen2;
  const tc = t < 0 ? 0 : t > 1 ? 1 : t;
  return { nx, ny, depth: r - maxSd, px: vx + tc * ex, py: vy + tc * ey };
}
