import { test } from 'node:test';
import assert from 'node:assert/strict';
import { directionalLightPosition } from '../src/core/mathx.js';

const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const norm = (v) => { const n = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / n, v[1] / n, v[2] / n]; };

// 회귀 방지: 시각 그림자(Three.js dirLight)와 물리 그림자(ShadowProjector)는 같은 광선을 써야 한다.
// directional light는 (target - position) 방향만 그림자에 반영되므로, 그 방향이 light.vec와 일치해야
// 차가 보이는 그림자 위에 정확히 올라탄다. (불일치 시: 차가 그림자 아랫부분/아래에 걸침)
test('directional 렌더 광원 방향이 해석적 light.vec와 일치한다', () => {
  const cases = [
    [-0.45, -0.5, -1],   // L1
    [0, 0, -1],          // 정면 수직
    [0.3, -0.7, -1.2],   // 비스듬
  ];
  const center = [6, 3, 0]; // 벽은 z=0 평면, 중심 (cx,cy,0)
  const dist = 12;
  for (const vec of cases) {
    const pos = directionalLightPosition(vec, center, dist);
    // 렌더 유효 광선 = target(center) - position
    const dir = norm([center[0] - pos[0], center[1] - pos[1], center[2] - pos[2]]);
    const want = norm(vec);
    for (let i = 0; i < 3; i++) {
      assert.ok(close(dir[i], want[i]), `vec=${vec} comp${i}: got ${dir[i]} want ${want[i]}`);
    }
  }
});

test('광원은 벽 앞(z>0)에 위치한다 (빛이 벽 z<0 방향으로 들어갈 때)', () => {
  const center = [6, 3, 0];
  const pos = directionalLightPosition([-0.45, -0.5, -1], center, 12);
  assert.ok(pos[2] > 0, `light z should be in front of wall, got ${pos[2]}`);
});
