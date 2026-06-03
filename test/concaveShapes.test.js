// test/concaveShapes.test.js
// 오목 도형(crescent/rramp)이 실제로 오목 도로를 만들고, 떨어진 차를 전방으로 가속(redirect)하는지
// 그림자 파이프라인(GameStateMachine→heightfield) + 물리(simulate)로 통합 검증.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameStateMachine } from '../src/core/GameStateMachine.js';
import { simulate } from '../src/core/CarSimulator.js';

// 직하(directional [0,0,-1]) 광원 → 그림자 = 도형의 xy 실루엣(곡면이 그대로 도로로).
function level(shape, size, spawn) {
  return {
    id: 'T',
    light: { type: 'directional', vec: [0, 0, -1] },
    wall: { width: 14, height: 10 },
    start: [1, 5], goal: [13, 0],
    fixedOccluders: [],
    movableOccluders: [{ shape, role: 'floor', size, spawn, allow: { translate: true, rotate: true } }],
    params: { carSpeed: 4, gravity: 9.8, maxClimbDeg: 35, gapPassRatio: 0.8 },
  };
}

function floorAt(hf, x) {
  const i = Math.round((x - hf.xs[0]) / hf.dx);
  return hf.floor[i];
}

test('crescent 그림자 도로는 오목(중앙 floor < 양끝 floor)', () => {
  // size[6,2.5,1], spawn x=7 → x범위 [4,10]. 대칭 오목 호: 중앙(7)이 가장 낮고 양끝이 높다.
  const sm = new GameStateMachine(level('crescent', [6, 2.5, 1], [7, 5, 3]));
  const hf = sm.recompute();
  const mid = floorAt(hf, 7), left = floorAt(hf, 4.8), right = floorAt(hf, 9.2);
  assert.ok(mid != null && left != null && right != null, `floor null: m=${mid} l=${left} r=${right}`);
  assert.ok(mid < left - 0.3 && mid < right - 0.3, `오목 아님: mid=${mid} left=${left} right=${right}`);
});

test('crescent 오목 도로에 낙하한 차는 전방으로 가속된다(redirect)', () => {
  // 좌측 rim 위 높은 곳(startY=9)에서 낙하 → 오목 곡면이 낙하 속도를 전방으로 휜다.
  const sm = new GameStateMachine(level('crescent', [8, 3, 1], [7, 4, 3]));
  const hf = sm.recompute();
  const r = simulate(hf, { carSpeed: 4, gravity: 9.8, maxClimbDeg: 35 },
    { length: 1, height: 0.5, startX: 4, startY: 9, goalX: 13, goalY: 0, goalHW: 1.5, goalHH: 2.0 });
  let smax = 0;
  const t = r.trajectory;
  for (let i = 1; i < t.length; i++) {
    const s = Math.hypot(t[i][0] - t[i - 1][0], t[i][1] - t[i - 1][1]) / 0.008;
    if (s > smax) smax = s;
  }
  assert.ok(smax > 4 * 1.3, `redirect 가속 미흡: smax=${smax.toFixed(2)} (carSpeed=4)`);
});

test('rramp(비대칭 오목 쿼터파이프)도 오목 도로 — 한쪽이 더 낮다', () => {
  const sm = new GameStateMachine(level('rramp', [6, 3, 1], [7, 5, 3]));
  const hf = sm.recompute();
  const left = floorAt(hf, 4.6), right = floorAt(hf, 9.4);
  assert.ok(left != null && right != null, `floor null: l=${left} r=${right}`);
  // 좌측 가파른 rim(높음) vs 우측 전방 립(낮음) → 비대칭.
  assert.ok(Math.abs(left - right) > 1.0, `비대칭 아님: left=${left} right=${right}`);
});
