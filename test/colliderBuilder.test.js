import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHeightfield } from '../src/core/ColliderBuilder.js';

test('단일 floor 폴리곤 → 해당 구간 top-y, 밖은 void(null)', () => {
  const polys = [{ polygon: [[0,0],[4,0],[4,2],[0,2]], role: 'floor' }];
  const hf = buildHeightfield({ polygons: polys, pads: [], xMin: -2, xMax: 8, samples: 11 });
  // x=0..4 구간은 floor=2, 그 밖은 null
  const at = (x) => hf.floor[hf.xs.findIndex((v) => Math.abs(v - x) < 1e-9)];
  assert.equal(at(2), 2);
  assert.equal(at(-2), null);
  assert.equal(at(6), null);
});

test('겹치는 두 floor 폴리곤 → 더 높은 top의 max (envelope)', () => {
  const polys = [
    { polygon: [[0,0],[4,0],[4,1],[0,1]], role: 'floor' },   // top=1
    { polygon: [[2,0],[6,0],[6,3],[2,3]], role: 'floor' },   // top=3
  ];
  const hf = buildHeightfield({ polygons: polys, pads: [], xMin: 0, xMax: 6, samples: 7 });
  const at = (x) => hf.floor[hf.xs.findIndex((v) => Math.abs(v - x) < 1e-9)];
  assert.equal(at(1), 1); // 첫 폴리곤만
  assert.equal(at(3), 3); // 겹침 → max
  assert.equal(at(5), 3); // 둘째 폴리곤만
});

test('ceiling 폴리곤 → 하단 y의 min, 없으면 Infinity', () => {
  const polys = [{ polygon: [[1,5],[5,5],[5,7],[1,7]], role: 'ceiling' }];
  const hf = buildHeightfield({ polygons: polys, pads: [], xMin: 0, xMax: 6, samples: 7 });
  const at = (x) => hf.ceiling[hf.xs.findIndex((v) => Math.abs(v - x) < 1e-9)];
  assert.equal(at(3), 5);          // ceiling 하단
  assert.equal(at(0), Infinity);   // 천장 없음
});

test('pads는 floor에 항상 반영', () => {
  const hf = buildHeightfield({ polygons: [], pads: [{ x0: 0, x1: 2, y: 1 }], xMin: 0, xMax: 2, samples: 3 });
  assert.equal(hf.floor[0], 1);
  assert.equal(hf.floor[hf.floor.length - 1], 1);
});
