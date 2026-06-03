import { test } from 'node:test';
import assert from 'node:assert/strict';
import { primitiveVerts, transformVerts, expandCompound, shapeProfile, PROFILE_SHAPES, composeRotZ } from '../src/core/shapes.js';
import { convexHull2D } from '../src/core/mathx.js';

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

test('expandCompound("bar"): 단일 part 그대로', () => {
  const parts = expandCompound('bar', [2, 1, 1]);
  assert.equal(parts.length, 1);
  assert.equal(parts[0].shape, 'bar');
  assert.deepEqual(parts[0].size, [2, 1, 1]);
  assert.deepEqual(parts[0].posRel, [0, 0, 0]);
  assert.equal(parts[0].rotRel, 0);
});

test('expandCompound("L"): 가로 bar + 세로 bar 두 part', () => {
  const parts = expandCompound('L', [2, 2, 1]);
  assert.equal(parts.length, 2);
  for (const p of parts) {
    assert.equal(p.shape, 'bar');
    assert.equal(p.size[2], 1);
  }
});

test('expandCompound("T"): 두 part, 두께 합리적', () => {
  const parts = expandCompound('T', [2, 2, 1]);
  assert.equal(parts.length, 2);
});

test('expandCompound("notch"): 세 part (U자형 분해)', () => {
  const parts = expandCompound('notch', [3, 2, 1]);
  assert.equal(parts.length, 3);
});

test('expandCompound 미지원 shape는 throw', () => {
  assert.throws(() => expandCompound('blob', [1, 1, 1]));
});

// ── dome(볼록 단면 압출) ──────────────────────────────────────────────────

test('PROFILE_SHAPES는 dome만(crescent/rramp는 오목 분해)', () => {
  assert.deepEqual([...PROFILE_SHAPES], ['dome']);
});

test('shapeProfile("dome")는 볼록(hull과 꼭짓점 수 동일)', () => {
  const prof = shapeProfile('dome', [5, 2, 1]);
  assert.equal(convexHull2D(prof).length, prof.length);
});

test('expandCompound("dome")는 단일 part, primitiveVerts는 2×프로필점', () => {
  const parts = expandCompound('dome', [5, 2, 1]);
  assert.equal(parts.length, 1);
  assert.equal(parts[0].shape, 'dome');
  const v = primitiveVerts('dome', [5, 2, 1]);
  assert.equal(v.length, shapeProfile('dome', [5, 2, 1]).length * 2);
  for (const [, , z] of v) assert.ok(close(Math.abs(z), 0.5));
});

test('dome: 정점이 가운데 최고 — 좌우 대칭', () => {
  const prof = shapeProfile('dome', [6, 3, 1]);
  let top = -Infinity, topX = null;
  for (const [x, y] of prof) if (y > top) { top = y; topX = x; }
  assert.ok(close(topX, 0, 1e-6));
});

// ── composeRotZ(오클루더 회전 + part-local z회전) ────────────────────────

test('composeRotZ: relDeg=0이면 occRot를 그대로 반환(레거시 보존)', () => {
  assert.equal(composeRotZ(0, 0), 0);
  assert.deepEqual(composeRotZ([0, 0, 30], 0), [0, 0, 30]);
});

test('composeRotZ(0, 90)은 z축 90° 쿼터니언과 동일', () => {
  const q = composeRotZ(0, 90);
  const s = Math.sin(Math.PI / 4);
  assert.ok(close(q[0], 0) && close(q[1], 0) && close(q[2], s, 1e-12) && close(q[3], s, 1e-12));
});

test('composeRotZ: 합성 회전이 정점에 올바로 적용(occ 90° ∘ rel 0 = 90°)', () => {
  const q = composeRotZ(90, 0); // number 그대로 → transformVerts가 z90
  const out = transformVerts([[1, 0, 0]], [0, 0, 0], q);
  assert.ok(close(out[0][0], 0) && close(out[0][1], 1));
});

test('composeRotZ: occ 45° ∘ rel 45° = 90° (정점 (1,0,0)→(0,1,0))', () => {
  const q = composeRotZ(45, 45);
  const out = transformVerts([[1, 0, 0]], [0, 0, 0], q);
  assert.ok(close(out[0][0], 0, 1e-9) && close(out[0][1], 1, 1e-9) && close(out[0][2], 0, 1e-9));
});

// ── 오목 도형(crescent/rramp) 분해 ───────────────────────────────────────

for (const shape of ['crescent', 'rramp']) {
  test(`expandCompound("${shape}")는 다중 bar로 분해되고 기울어진 세그먼트(rotRel≠0)를 포함`, () => {
    const parts = expandCompound(shape, [6, 2.5, 1]);
    assert.ok(parts.length >= 8, `parts=${parts.length}`);
    for (const p of parts) { assert.equal(p.shape, 'bar'); assert.equal(p.size[2], 1); }
    assert.ok(parts.some((p) => Math.abs(p.rotRel) > 1), '기울어진 세그먼트가 있어야 함');
  });
}

test('crescent: 상단 곡선이 중앙 최저·양끝 최고(오목 스마일)', () => {
  // 세그먼트 윗면 = 현(곡선). posRel y + (t/2)·법선 ≈ 곡선. 중앙 세그먼트가 가장 낮아야.
  const parts = expandCompound('crescent', [6, 2.5, 1]);
  const mid = parts[Math.floor(parts.length / 2)];
  const end = parts[0];
  assert.ok(mid.posRel[1] < end.posRel[1], `중앙(${mid.posRel[1]}) < 양끝(${end.posRel[1]})`);
});
