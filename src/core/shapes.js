// src/core/shapes.js
// 오클루더 로컬 정점 생성 + 월드 변환(z축 회전 후 평행이동).

/**
 * size = full extents [sx, sy, sz]. 로컬 원점 중심.
 * @param {'bar'|'prism'} shape
 * @param {[number,number,number]} size
 * @returns {Array<[number,number,number]>}
 */
export function primitiveVerts(shape, size) {
  const [sx, sy, sz] = size;
  const hx = sx / 2, hy = sy / 2, hz = sz / 2;
  if (shape === 'bar') {
    const v = [];
    for (const x of [-hx, hx])
      for (const y of [-hy, hy])
        for (const z of [-hz, hz]) v.push([x, y, z]);
    return v;
  }
  if (shape === 'prism') {
    // 단면이 삼각형(밑변 sx, 높이 sy), z로 sz만큼 압출. 6정점.
    const tri = [[-hx, -hy], [hx, -hy], [0, hy]];
    const v = [];
    for (const [x, y] of tri)
      for (const z of [-hz, hz]) v.push([x, y, z]);
    return v;
  }
  if (PROFILE_SHAPES.has(shape)) {
    // 볼록 2D 단면(shapeProfile)을 z로 ±hz 양 평면에 압출.
    const prof = shapeProfile(shape, size);
    const v = [];
    for (const [x, y] of prof) { v.push([x, y, -hz]); v.push([x, y, hz]); }
    return v;
  }
  throw new Error(`unknown shape: ${shape}`);
}

// 볼록 단면 압출 도형. bar/prism과 달리 shapeProfile로 단면을 생성한다.
// (crescent/rramp는 오목이라 단일 convex part로 불가 → expandCompound에서 tilted bar로 분해.)
export const PROFILE_SHAPES = new Set(['dome']);
const ARC_SAMPLES = 16; // 호 근사 분할 수

/**
 * 볼록 2D 단면 점 배열(로컬 원점 중심, CCW). bar/prism은 별도 경로라 여기서 다루지 않는다.
 *   dome: 평평한 바닥 + 반타원(위). 둥근 봉우리(볼록).
 * @param {'dome'} shape
 * @param {[number,number,number]} size
 * @returns {Array<[number,number]>}
 */
export function shapeProfile(shape, size) {
  const [sx, sy] = size;
  const hx = sx / 2, hy = sy / 2;

  if (shape === 'dome') {
    // 바닥: (-hx,-hy)→(hx,-hy). 위: 중심 (0,-hy)·반축(hx, sy)의 반타원(우→정점→좌).
    const pts = [[-hx, -hy], [hx, -hy]];
    for (let i = 1; i < ARC_SAMPLES; i++) {
      const t = (i / ARC_SAMPLES) * Math.PI; // 0(우끝)→π(좌끝)
      pts.push([hx * Math.cos(t), -hy + sy * Math.sin(t)]);
    }
    return pts;
  }

  throw new Error(`shapeProfile: unsupported shape ${shape}`);
}

// ── 쿼터니언 헬퍼: 오클루더 회전(occRot)과 part-local z회전(rotRel) 합성 ──────────
// rotRel은 분해된 곡면 도형의 세그먼트 기울기. occRot는 number(z°)|euler[3]|quat[4].

function quatMul(a, b) { // a*b (a를 b 뒤에 적용)
  const [ax, ay, az, aw] = a, [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}
function zQuat(deg) { const h = (deg * Math.PI) / 360; return [0, 0, Math.sin(h), Math.cos(h)]; }
function eulerToQuat(dx, dy, dz) { // Rz·Ry·Rx 순서(transformVerts와 동일) → qz*qy*qx
  const hx = (dx * Math.PI) / 360, hy = (dy * Math.PI) / 360, hz = (dz * Math.PI) / 360;
  const qx = [Math.sin(hx), 0, 0, Math.cos(hx)];
  const qy = [0, Math.sin(hy), 0, Math.cos(hy)];
  const qz = [0, 0, Math.sin(hz), Math.cos(hz)];
  return quatMul(quatMul(qz, qy), qx);
}
export function toQuat(rot) {
  if (typeof rot === 'number') return zQuat(rot);
  if (Array.isArray(rot) && rot.length === 4) return rot.slice();
  if (Array.isArray(rot) && rot.length === 3) return eulerToQuat(rot[0], rot[1], rot[2]);
  return [0, 0, 0, 1];
}

/**
 * 오클루더 회전과 part-local z회전(deg)을 합성한 회전을 반환.
 * relDeg===0이면 occRot를 그대로 반환(number/euler 표현 보존 → 레거시 바이트 동일).
 * 아니면 합성 쿼터니언 [x,y,z,w]를 반환(transformVerts가 처리).
 */
export function composeRotZ(occRot, relDeg) {
  if (!relDeg) return occRot;
  return quatMul(toQuat(occRot), zQuat(relDeg));
}

/**
 * 상단면이 topFn(x) 곡선인 오목 도형을 N개 tilted bar로 분해.
 * 각 bar의 윗면(현)이 곡선 위에 정확히 놓이도록 두께 t의 절반만큼 법선 아래로 내린다.
 * 상단 envelope(콜라이더 floor=폴리곤 top의 max) = 곡선 → 오목 도로.
 */
function concaveBars(topFn, sx, sy, sz, N, t) {
  const hx = sx / 2;
  const parts = [];
  for (let i = 0; i < N; i++) {
    const x0 = -hx + sx * (i / N);
    const x1 = -hx + sx * ((i + 1) / N);
    const y0 = topFn(x0), y1 = topFn(x1);
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    const ang = Math.atan2(dy, dx);                 // 현 기울기(rad)
    const nx = -Math.sin(ang), ny = Math.cos(ang);  // 위쪽 법선
    const xm = (x0 + x1) / 2, ym = (y0 + y1) / 2;
    parts.push({
      shape: 'bar',
      size: [len, t, sz],
      posRel: [xm - (t / 2) * nx, ym - (t / 2) * ny, 0],
      rotRel: (ang * 180) / Math.PI,
    });
  }
  return parts;
}

/**
 * 회전 후 pos 평행이동.
 * rot은 다음 셋 중 하나:
 *  - number: 레거시 z축 도(°)
 *  - [rx,ry,rz]: 오일러 도, Rz·Ry·Rx 순서
 *  - [x,y,z,w]: 쿼터니언 (정규화 가정; 길이-4 배열)
 * number/length-3 경로는 레거시와 바이트 단위로 동일하게 유지한다.
 * @param {Array<[number,number,number]>} verts
 * @param {[number,number,number]} pos
 * @param {number|[number,number,number]|[number,number,number,number]} rot
 * @returns {Array<[number,number,number]>}
 */
export function transformVerts(verts, pos, rot) {
  const [tx, ty, tz] = pos;

  // 레거시 경로: rot이 숫자면 z축 회전만(기존 동작 그대로).
  if (typeof rot === 'number') {
    const r = (rot * Math.PI) / 180;
    const c = Math.cos(r), s = Math.sin(r);
    return verts.map(([x, y, z]) => [
      c * x - s * y + tx,
      s * x + c * y + ty,
      z + tz,
    ]);
  }

  // 쿼터니언 경로: 길이-4 배열 [x,y,z,w] → 3x3 회전행렬 직접 빌드.
  if (Array.isArray(rot) && rot.length === 4) {
    const [qx, qy, qz, qw] = rot;
    const x2 = qx + qx, y2 = qy + qy, z2 = qz + qz;
    const xx = qx * x2, xy = qx * y2, xz = qx * z2;
    const yy = qy * y2, yz = qy * z2, zz = qz * z2;
    const wx = qw * x2, wy = qw * y2, wz = qw * z2;
    const m00 = 1 - (yy + zz), m01 = xy - wz, m02 = xz + wy;
    const m10 = xy + wz, m11 = 1 - (xx + zz), m12 = yz - wx;
    const m20 = xz - wy, m21 = yz + wx, m22 = 1 - (xx + yy);
    return verts.map(([x, y, z]) => [
      m00 * x + m01 * y + m02 * z + tx,
      m10 * x + m11 * y + m12 * z + ty,
      m20 * x + m21 * y + m22 * z + tz,
    ]);
  }

  // 배열 경로: 오일러 [rx,ry,rz] 도, Rz·Ry·Rx 순서로 합성한 회전행렬을 적용.
  const [dx, dy, dz] = rot;
  const cx = Math.cos((dx * Math.PI) / 180), sx = Math.sin((dx * Math.PI) / 180);
  const cy = Math.cos((dy * Math.PI) / 180), sy = Math.sin((dy * Math.PI) / 180);
  const cz = Math.cos((dz * Math.PI) / 180), sz = Math.sin((dz * Math.PI) / 180);

  // R = Rz * Ry * Rx (행렬 곱). 행 우선으로 전개.
  const m00 = cz * cy;
  const m01 = cz * sy * sx - sz * cx;
  const m02 = cz * sy * cx + sz * sx;
  const m10 = sz * cy;
  const m11 = sz * sy * sx + cz * cx;
  const m12 = sz * sy * cx - cz * sx;
  const m20 = -sy;
  const m21 = cy * sx;
  const m22 = cy * cx;

  return verts.map(([x, y, z]) => [
    m00 * x + m01 * y + m02 * z + tx,
    m10 * x + m11 * y + m12 * z + ty,
    m20 * x + m21 * y + m22 * z + tz,
  ]);
}

/**
 * Compound shape를 bar parts 배열로 분해.
 * 각 part는 occluder 로컬 좌표(occluder 중심을 원점으로) 기준 posRel/rotRel을 가진다.
 * occluder 전체에 (pos, rot)이 적용되면 GameStateMachine 쪽에서 posRel을 함께 회전·평행이동.
 * size는 occluder 전체 외접 bounding (sx, sy, sz). 내부 분해 비율은 하드코딩.
 *
 *   L  : ㄴ자 — 아래 가로 bar + 좌측 세로 bar. 두께 t = min(sx,sy) * 0.4
 *   T  : ㅗ자(아래로 줄기) — 위 가로 bar + 중앙 세로 bar. 두께 t = min(sx,sy) * 0.4
 *   notch: U자 — 아래 가로 bar + 좌 세로 bar + 우 세로 bar. 두께 t = min(sx,sy) * 0.35
 *
 * @param {'bar'|'prism'|'L'|'T'|'notch'} shape
 * @param {[number,number,number]} size
 * @returns {Array<{shape:'bar'|'prism', size:[number,number,number], posRel:[number,number,number], rotRel:number}>}
 */
export function expandCompound(shape, size) {
  const [sx, sy, sz] = size;
  // 단일 convex part 도형(bar/prism/dome): 그대로 1개 part.
  if (shape === 'bar' || shape === 'prism' || PROFILE_SHAPES.has(shape)) {
    return [{ shape, size: [sx, sy, sz], posRel: [0, 0, 0], rotRel: 0 }];
  }
  // 오목 곡면 도형: tilted bar 세그먼트로 분해(상단 envelope=오목 곡선).
  if (shape === 'crescent') {
    // 대칭 오목 호(스마일): 중앙 최저(-hy) → 양끝 rim(+hy). 떨어진 차를 받아 전방으로 휜다.
    const hy = sy / 2, hx = sx / 2;
    return concaveBars((x) => -hy + sy * (x / hx) * (x / hx), sx, sy, sz, 14, 0.5);
  }
  if (shape === 'rramp') {
    // 비대칭 오목 쿼터파이프: 좌측 가파른 오목 벽(낙하 포착, +hy) → 우측 낮은 전방 립(-hy).
    const hy = sy / 2;
    return concaveBars((x) => {
      const u = (x + sx / 2) / sx;          // 0(좌)→1(우)
      return -hy + sy * Math.sqrt(Math.max(0, 1 - u * u));
    }, sx, sy, sz, 14, 0.5);
  }
  if (shape === 'L') {
    const t = Math.min(sx, sy) * 0.4;
    return [
      // 아래 가로 — y는 -sy/2 .. -sy/2 + t (중심 -sy/2 + t/2)
      { shape: 'bar', size: [sx, t, sz], posRel: [0, -sy / 2 + t / 2, 0], rotRel: 0 },
      // 좌측 세로 — x는 -sx/2 .. -sx/2 + t (중심 -sx/2 + t/2), y는 -sy/2..sy/2
      { shape: 'bar', size: [t, sy, sz], posRel: [-sx / 2 + t / 2, 0, 0], rotRel: 0 },
    ];
  }
  if (shape === 'T') {
    const t = Math.min(sx, sy) * 0.4;
    return [
      // 위 가로 — y는 sy/2 - t .. sy/2 (중심 sy/2 - t/2)
      { shape: 'bar', size: [sx, t, sz], posRel: [0, sy / 2 - t / 2, 0], rotRel: 0 },
      // 중앙 세로 — x=0, y 전체. 두께 t.
      { shape: 'bar', size: [t, sy, sz], posRel: [0, 0, 0], rotRel: 0 },
    ];
  }
  if (shape === 'notch') {
    const t = Math.min(sx, sy) * 0.35;
    return [
      // 아래 가로(바닥) — y는 -sy/2 .. -sy/2 + t (중심 -sy/2 + t/2)
      { shape: 'bar', size: [sx, t, sz], posRel: [0, -sy / 2 + t / 2, 0], rotRel: 0 },
      // 좌 기둥 — x는 -sx/2 .. -sx/2 + t, y 전체
      { shape: 'bar', size: [t, sy, sz], posRel: [-sx / 2 + t / 2, 0, 0], rotRel: 0 },
      // 우 기둥 — x는 sx/2 - t .. sx/2, y 전체
      { shape: 'bar', size: [t, sy, sz], posRel: [ sx / 2 - t / 2, 0, 0], rotRel: 0 },
    ];
  }
  throw new Error(`expandCompound: unsupported shape ${shape}`);
}
