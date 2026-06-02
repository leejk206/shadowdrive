// src/core/ShadowProjector.js
import { primitiveVerts, transformVerts } from './shapes.js';
import { projectVertex, convexHull2D } from './mathx.js';

/**
 * 오클루더 1개 → 각 part의 convex 그림자 폴리곤 배열.
 * convex 입체의 그림자 = 정점 투영들의 convex hull.
 * @param {object} occ  { parts:[{shape,size,pos,rot}], role }
 * @param {object} light
 * @returns {Array<{polygon:Array<[number,number]>, role:string}>}
 */
export function projectOccluder(occ, light) {
  return occ.parts.map((part) => {
    const local = primitiveVerts(part.shape, part.size);
    const world = transformVerts(local, part.pos, part.rot || 0);
    const proj = world.map((v) => projectVertex(v, light));
    return { polygon: convexHull2D(proj), role: occ.role };
  });
}

/**
 * 씬 전체 오클루더 → 그림자 폴리곤 평탄 배열.
 * @param {Array<object>} occluders
 * @param {object} light
 * @returns {Array<{polygon, role}>}
 */
export function projectScene(occluders, light) {
  const out = [];
  for (const occ of occluders) out.push(...projectOccluder(occ, light));
  return out;
}
