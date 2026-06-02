import { test } from 'node:test';
import assert from 'node:assert/strict';
import { primitiveVerts, transformVerts } from '../src/core/shapes.js';

const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('bar는 8정점(직육면체)', () => {
  const v = primitiveVerts('bar', [2, 1, 1]); // size=full extents
  assert.equal(v.length, 8);
  // x는 ±1, y는 ±0.5, z는 ±0.5 범위
  for (const [x, y, z] of v) {
    assert.ok(close(Math.abs(x), 1) && close(Math.abs(y), 0.5) && close(Math.abs(z), 0.5));
  }
});

test('prism은 6정점(삼각 프리즘)', () => {
  const v = primitiveVerts('prism', [2, 2, 1]);
  assert.equal(v.length, 6);
});

test('transformVerts: z축 90° 회전은 (x,y)→(-y,x)', () => {
  const out = transformVerts([[1, 0, 0]], [0, 0, 0], 90);
  assert.ok(close(out[0][0], 0) && close(out[0][1], 1) && close(out[0][2], 0));
});

test('transformVerts: 평행이동', () => {
  const out = transformVerts([[1, 1, 1]], [5, 2, 3], 0);
  assert.deepEqual(out[0], [6, 3, 4]);
});

test('transformVerts: 배열 [0,0,90] z회전은 레거시 90과 동일', () => {
  const out = transformVerts([[1, 0, 0]], [0, 0, 0], [0, 0, 90]);
  assert.ok(close(out[0][0], 0) && close(out[0][1], 1) && close(out[0][2], 0));
});

test('transformVerts: 배열 x축 90° 회전은 (0,1,0)→(0,0,1)', () => {
  const out = transformVerts([[0, 1, 0]], [0, 0, 0], [90, 0, 0]);
  assert.ok(close(out[0][0], 0) && close(out[0][1], 0) && close(out[0][2], 1));
});

test('transformVerts: 쿼터니언 z축 90°([0,0,sin45,cos45])는 레거시 90과 동일', () => {
  const s = Math.sin(Math.PI / 4), c = Math.cos(Math.PI / 4);
  const out = transformVerts([[1, 0, 0]], [0, 0, 0], [0, 0, s, c]);
  assert.ok(close(out[0][0], 0, 1e-12) && close(out[0][1], 1, 1e-12) && close(out[0][2], 0, 1e-12));
});
