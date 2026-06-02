// src/io/LevelLoader.js
const SHAPES = new Set(['bar', 'prism']);
const ROLES = new Set(['floor', 'ceiling']);

/** 레벨 객체 구조 검증. { ok, errors } 반환 */
export function validateLevel(lv) {
  const e = [];
  if (!lv || typeof lv !== 'object') return { ok: false, errors: ['level not an object'] };
  if (!lv.id) e.push('missing id');
  if (!lv.light || !['directional', 'point'].includes(lv.light.type)) e.push('light.type must be directional|point');
  if (!lv.light || !Array.isArray(lv.light.vec) || lv.light.vec.length !== 3) e.push('light.vec must be [x,y,z]');
  if (!lv.wall || typeof lv.wall.width !== 'number' || typeof lv.wall.height !== 'number') e.push('wall.width/height required');
  if (!Array.isArray(lv.start) || lv.start.length !== 2) e.push('start must be [x,y]');
  if (!Array.isArray(lv.goal) || lv.goal.length !== 2) e.push('goal must be [x,y]');
  for (const key of ['fixedOccluders', 'movableOccluders']) {
    if (!Array.isArray(lv[key])) { e.push(`${key} must be array`); continue; }
    lv[key].forEach((o, i) => {
      if (!SHAPES.has(o.shape)) e.push(`${key}[${i}].shape unsupported: ${o.shape}`);
      if (o.role && !ROLES.has(o.role)) e.push(`${key}[${i}].role invalid: ${o.role}`);
      if (!Array.isArray(o.size) || o.size.length !== 3) e.push(`${key}[${i}].size must be [x,y,z]`);
      if (key === 'movableOccluders') {
        if (!Array.isArray(o.spawn) || o.spawn.length !== 3) e.push(`${key}[${i}].spawn must be [x,y,z]`);
      } else {
        if (!Array.isArray(o.pos) || o.pos.length !== 3) e.push(`${key}[${i}].pos must be [x,y,z]`);
      }
    });
  }
  const p = lv.params || {};
  for (const k of ['carSpeed', 'gravity', 'maxClimbDeg', 'gapPassRatio'])
    if (typeof p[k] !== 'number') e.push(`params.${k} required`);
  return { ok: e.length === 0, errors: e };
}

/** URL에서 레벨 JSON을 fetch + 검증 (브라우저용) */
export async function loadLevel(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`failed to load ${url}: ${res.status}`);
  const lv = await res.json();
  const v = validateLevel(lv);
  if (!v.ok) throw new Error(`invalid level ${url}: ${v.errors.join('; ')}`);
  return lv;
}
