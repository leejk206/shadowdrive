import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectOccluder, projectScene } from '../src/core/ShadowProjector.js';

const close = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test('방향광 아래 bar의 그림자는 동일 크기 사각형', () => {
  // 방향 (0,0,-1): 수직 투영 → 그림자 = 정면 실루엣(가로 sx, 세로 sy)
  const occ = { parts: [{ shape: 'bar', size: [2, 1, 1], pos: [0, 0, 3], rot: 0 }], role: 'floor' };
  const polys = projectOccluder(occ, { type: 'directional', vec: [0, 0, -1] });
  assert.equal(polys.length, 1);
  const xs = polys[0].polygon.map((p) => p[0]);
  assert.ok(close(Math.min(...xs), -1) && close(Math.max(...xs), 1));
  assert.equal(polys[0].role, 'floor');
});

test('점광원 아래 bar는 확대된 그림자', () => {
  const occ = { parts: [{ shape: 'bar', size: [2, 1, 1], pos: [0, 0, 5], rot: 0 }], role: 'floor' };
  const polys = projectOccluder(occ, { type: 'point', vec: [0, 0, 10] });
  const xs = polys[0].polygon.map((p) => p[0]);
  // bar 앞면 z=5.5, 뒷면 z=4.5; 가장 큰 확대는 z=5.5: t=10/4.5≈2.22 → x≈±2.22
  assert.ok(Math.max(...xs) > 2 && Math.max(...xs) < 2.5);
});

test('projectScene: 다중 오클루더 → 폴리곤 평탄 배열, role 보존', () => {
  const occs = [
    { parts: [{ shape: 'bar', size: [2,1,1], pos: [0,0,3], rot: 0 }], role: 'floor' },
    { parts: [{ shape: 'bar', size: [1,1,1], pos: [3,0,3], rot: 0 }], role: 'ceiling' },
  ];
  const polys = projectScene(occs, { type: 'directional', vec: [0,0,-1] });
  assert.equal(polys.length, 2);
  assert.equal(polys.filter((p) => p.role === 'ceiling').length, 1);
});
