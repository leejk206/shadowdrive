import { test } from 'node:test';
import assert from 'node:assert/strict';
import { obbCorners, convexVsConvex, circleVsConvex, clipToZones } from '../src/core/collide2d.js';

const sq = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]; // CCW

test('obbCorners: 회전 없음', () => {
  const c = obbCorners(0, 0, 0, 1, 0.5);
  assert.deepEqual(c[0].map((v) => +v.toFixed(3)), [-1, -0.5]);
  assert.deepEqual(c[2].map((v) => +v.toFixed(3)), [1, 0.5]);
});

test('obbCorners: 90도 회전', () => {
  const c = obbCorners(0, 0, Math.PI / 2, 1, 0.5);
  // (-1,-0.5) → 회전 후 (0.5,-1)
  assert.deepEqual(c[0].map((v) => +v.toFixed(3)), [0.5, -1]);
});

test('circleVsConvex: 윗면 살짝 관통', () => {
  const r = circleVsConvex(1, 2.5, 0.7, sq(0, 0, 2, 2));
  assert.ok(r);
  assert.equal(+r.ny.toFixed(3), 1);   // 위로 밀어냄
  assert.equal(+r.nx.toFixed(3), 0);
  assert.ok(Math.abs(r.depth - 0.2) < 1e-6);
});

test('circleVsConvex: 멀면 null', () => {
  assert.equal(circleVsConvex(1, 5, 0.5, sq(0, 0, 2, 2)), null);
});

test('circleVsConvex: 코너 근처', () => {
  const r = circleVsConvex(2.4, 2.3, 0.6, sq(0, 0, 2, 2)); // 우상단 코너(2,2) 밖
  assert.ok(r);
  assert.ok(r.nx > 0 && r.ny > 0);     // 코너 바깥 대각 법선
});

test('circleVsConvex: 내부 중심 → 가장 가까운 면으로', () => {
  const r = circleVsConvex(1.8, 1, 0.3, sq(0, 0, 2, 2)); // 중심 내부, 오른쪽 면 가까움
  assert.ok(r);
  assert.equal(+r.nx.toFixed(3), 1);
  assert.ok(r.depth > 0.3);            // r + (면까지 거리)
});

test('convexVsConvex: 겹친 두 사각형 MTV', () => {
  const r = convexVsConvex(sq(0, 0, 2, 2), sq(1, 1, 3, 3));
  assert.ok(r);
  assert.ok(Math.abs(r.depth - 1) < 1e-6);
  assert.ok(Math.abs(Math.hypot(r.nx, r.ny) - 1) < 1e-6);
  // 축정렬 MTV
  assert.ok(Math.abs(r.nx) < 1e-6 || Math.abs(r.ny) < 1e-6);
  // a가 b의 좌하단이므로 법선은 -x 또는 -y
  assert.ok(r.nx <= 1e-6 && r.ny <= 1e-6);
});

test('convexVsConvex: 안 겹치면 null', () => {
  assert.equal(convexVsConvex(sq(0, 0, 2, 2), sq(5, 5, 6, 6)), null);
});

test('clipToZones: 막대를 가운데 구역으로 자르면 좌/우 두 조각(경계에 벽)', () => {
  const pieces = clipToZones([sq(0, 0, 10, 2)], [{ x0: 4, x1: 6, y0: -1, y1: 3 }]);
  assert.equal(pieces.length, 2);
  const xr = pieces.map((p) => { const xs = p.map((q) => q[0]); return [Math.min(...xs), Math.max(...xs)]; }).sort((a, b) => a[0] - b[0]);
  assert.deepEqual(xr[0].map((v) => +v.toFixed(2)), [0, 4]);   // 왼쪽 조각, 오른면 x=4
  assert.deepEqual(xr[1].map((v) => +v.toFixed(2)), [6, 10]);  // 오른쪽 조각, 왼면 x=6(벽)
});

test('clipToZones: 구역이 폴리곤 밖이면 그대로', () => {
  const pieces = clipToZones([sq(0, 0, 10, 2)], [{ x0: 20, x1: 22, y0: 0, y1: 2 }]);
  assert.equal(pieces.length, 1);
});
