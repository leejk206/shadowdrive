// src/core/ColliderBuilder.js
import { polygonVerticalSpan } from './mathx.js';

/**
 * 그림자 폴리곤 + 패드 → 1D floor/ceiling heightfield (envelope).
 *   floor[i]  = role:'floor' 폴리곤들의 상단 y의 max (+ 패드), 미커버 시 null
 *   ceiling[i]= role:'ceiling' 폴리곤들의 하단 y의 min, 미커버 시 Infinity
 * @param {{polygons:Array, pads:Array<{x0,x1,y}>, xMin:number, xMax:number, samples:number}} cfg
 * @returns {{xs:number[], dx:number, floor:(number|null)[], ceiling:number[]}}
 */
export function buildHeightfield({ polygons, pads, xMin, xMax, samples }) {
  const xs = [];
  const dx = (xMax - xMin) / (samples - 1);
  for (let i = 0; i < samples; i++) xs.push(xMin + i * dx);

  const floor = new Array(samples).fill(null);
  const ceiling = new Array(samples).fill(Infinity);

  for (let i = 0; i < samples; i++) {
    const x = xs[i];
    // floor: 폴리곤 상단 y의 max
    for (const sp of polygons) {
      if (sp.role !== 'floor') continue;
      const span = polygonVerticalSpan(sp.polygon, x);
      if (span === null) continue;
      const top = span[1];
      if (floor[i] === null || top > floor[i]) floor[i] = top;
    }
    // pads: 항상 floor에 반영
    for (const pad of pads) {
      if (x >= pad.x0 - 1e-9 && x <= pad.x1 + 1e-9) {
        if (floor[i] === null || pad.y > floor[i]) floor[i] = pad.y;
      }
    }
    // ceiling: 하단 y의 min
    for (const sp of polygons) {
      if (sp.role !== 'ceiling') continue;
      const span = polygonVerticalSpan(sp.polygon, x);
      if (span === null) continue;
      if (span[0] < ceiling[i]) ceiling[i] = span[0];
    }
  }
  return { xs, dx, floor, ceiling };
}
