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
  throw new Error(`unknown shape: ${shape}`);
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
