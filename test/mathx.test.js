import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectVertex, convexHull2D, polygonVerticalSpan } from '../src/core/mathx.js';

const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('directional projection: 평행광은 z만큼 평행이동(전단)', () => {
  // 방향 (0,0,-1): 벽(z=0)에 수직 투영 → x,y 그대로
  assert.deepEqual(projectVertex([2, 3, 5], { type: 'directional', vec: [0, 0, -1] }), [2, 3]);
  // 방향 (1,0,-1): z=5에서 x가 +5 이동 (t = -pz/dz = -5/-1 = 5; x = 2 + 5*1 = 7)
  const p = projectVertex([2, 3, 5], { type: 'directional', vec: [1, 0, -1] });
  assert.ok(close(p[0], 7) && close(p[1], 3));
});

test('point projection: 광원에 가까울수록(큰 z) 확대', () => {
  // 광원 (0,0,10), 점 (1,0,5): t = lz/(lz-pz) = 10/5 = 2 → x = 0 + 2*(1-0) = 2
  const p = projectVertex([1, 0, 5], { type: 'point', vec: [0, 0, 10] });
  assert.ok(close(p[0], 2) && close(p[1], 0));
  // 더 광원 쪽(z=8): t = 10/2 = 5 → x = 5 (그림자 더 큼)
  const q = projectVertex([1, 0, 8], { type: 'point', vec: [0, 0, 10] });
  assert.ok(close(q[0], 5));
});

test('projectVertex: 0으로 나눔 방어 (divide-by-zero guards)', () => {
  // directional: dz≈0 (광선이 벽과 평행)
  assert.throws(
    () => projectVertex([2, 3, 5], { type: 'directional', vec: [1, 0, 0] }),
    /directional light parallel to wall/,
  );
  // point: lz≈pz (광원이 occluder와 같은 깊이)
  assert.throws(
    () => projectVertex([1, 0, 10], { type: 'point', vec: [0, 0, 10] }),
    /point light at occluder depth/,
  );
});

test('convexHull2D: 사각형 + 내부점 → 4개 모서리만', () => {
  const pts = [[0,0],[2,0],[2,2],[0,2],[1,1]];
  const hull = convexHull2D(pts);
  assert.equal(hull.length, 4);
});

test('polygonVerticalSpan: 사각형의 x=1 수직선 교차 = [0,2]', () => {
  const sq = [[0,0],[2,0],[2,2],[0,2]];
  const span = polygonVerticalSpan(sq, 1);
  assert.ok(close(span[0], 0) && close(span[1], 2));
});

test('polygonVerticalSpan: x가 폴리곤 밖이면 null', () => {
  const sq = [[0,0],[2,0],[2,2],[0,2]];
  assert.equal(polygonVerticalSpan(sq, 5), null);
});
