import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameStateMachine } from '../src/core/GameStateMachine.js';

// (테스트 끝에서 사용) compound shape expand 검증용 별도 레벨

// 최소 레벨: 시작-목표 사이 갭, 가동 막대 1개로 메우면 CLEAR
const level = {
  id: 'T', light: { type: 'directional', vec: [0, 0, -1] },
  wall: { width: 10, height: 6 },
  start: [0, 0], goal: [9, 0],
  fixedOccluders: [],
  movableOccluders: [
    { shape: 'bar', role: 'floor', size: [10, 0.4, 1], spawn: [4.5, 0, 3], allow: { translate: true, rotate: true } },
  ],
  params: { carSpeed: 4, gravity: 9.8, maxClimbDeg: 35, gapPassRatio: 0.8 },
};

test('초기 상태는 PLAN', () => {
  const sm = new GameStateMachine(level);
  assert.equal(sm.phase, 'PLAN');
});

test('recompute는 PLAN 단계 heightfield 미리보기를 만든다', () => {
  const sm = new GameStateMachine(level);
  const hf = sm.recompute();
  assert.ok(hf.floor.some((v) => v !== null));
});

test('go(): 막대 그림자가 길을 메우면 CLEAR로 전이', () => {
  const sm = new GameStateMachine(level);
  // 가동 막대를 길 전체에 깔리도록 (방향광 수직투영 → 그림자=막대 위치 그대로, 폭 10 세로 0.4)
  sm.setMovableTransform(0, { pos: [4.5, 0.2, 3], rot: 0 });
  const res = sm.go();
  assert.equal(res.result, 'CLEAR');
  assert.equal(sm.phase, 'CLEAR');
});

test('setMovableTransform: 점광원 볼륨으로 z/x 클램프 (spec §4.3)', () => {
  // 점광원 z=10인 레벨
  const pl = {
    id: 'P', light: { type: 'point', vec: [5, 0, 10] },
    wall: { width: 8, height: 6 },
    start: [0, 0], goal: [7, 0],
    fixedOccluders: [],
    movableOccluders: [
      { shape: 'bar', role: 'floor', size: [3, 0.4, 1], spawn: [4, 0, 3], allow: { translate: true, rotate: true } },
    ],
    params: { carSpeed: 4, gravity: 9.8, maxClimbDeg: 35, gapPassRatio: 0.8 },
  };
  // z가 광원 너머(50) → zMax=9.9로 클램프
  let sm = new GameStateMachine(pl);
  sm.setMovableTransform(0, { pos: [4, 1, 50] });
  assert.ok(sm.movables[0].pos[2] <= 9.9, `z=${sm.movables[0].pos[2]} should be ≤ 9.9`);
  // z가 음수 → 하한 0.1로 클램프
  sm = new GameStateMachine(pl);
  sm.setMovableTransform(0, { pos: [4, 1, -3] });
  assert.ok(sm.movables[0].pos[2] >= 0.1, `z=${sm.movables[0].pos[2]} should be ≥ 0.1`);
  // z=0 → 0.1로 클램프
  sm = new GameStateMachine(pl);
  sm.setMovableTransform(0, { pos: [4, 1, 0] });
  assert.ok(sm.movables[0].pos[2] >= 0.1);
  // x가 벽 범위 밖 → [0, width]로 클램프
  sm = new GameStateMachine(pl);
  sm.setMovableTransform(0, { pos: [99, 1, 5] });
  assert.ok(sm.movables[0].pos[0] >= 0 && sm.movables[0].pos[0] <= pl.wall.width);
  sm.setMovableTransform(0, { pos: [-99, 1, 5] });
  assert.ok(sm.movables[0].pos[0] >= 0 && sm.movables[0].pos[0] <= pl.wall.width);
});

test('FAIL 후 reset은 PLAN으로 복귀하고 배치 유지', () => {
  const sm = new GameStateMachine(level);
  sm.setMovableTransform(0, { pos: [10, 0.2, 3], rot: 0 }); // 막대를 오른쪽 끝으로 치워 시작 직후 넓은 void 유발
  const res = sm.go();
  assert.equal(res.result, 'FAIL');
  assert.match(res.reason, /fell|void|gap/i);
  sm.reset();
  assert.equal(sm.phase, 'PLAN');
  assert.deepEqual(sm.movables[0].pos, [10, 0.2, 3]); // 배치 유지
});

test('compound shape(L)는 _occluders에서 2 parts로 expand되고 회전 합성', () => {
  const lv = {
    id: 'C', light: { type: 'directional', vec: [0, 0, -1] },
    wall: { width: 10, height: 6 },
    start: [0, 0], goal: [9, 0],
    fixedOccluders: [],
    movableOccluders: [
      { shape: 'L', role: 'floor', size: [2, 2, 1], spawn: [5, 2, 3], allow: { translate: true, rotate: true } },
    ],
    params: { carSpeed: 4, gravity: 9.8, maxClimbDeg: 35, gapPassRatio: 0.8 },
  };
  const sm = new GameStateMachine(lv);
  const occs = sm._occluders();
  assert.equal(occs.length, 1);
  assert.equal(occs[0].parts.length, 2);             // L = 2 bar parts
  for (const p of occs[0].parts) assert.equal(p.shape, 'bar');

  // 90° 회전 후 part posRel 도 회전돼 있어야 한다 (가로/세로 part가 서로 자리 교환)
  sm.setMovableTransform(0, { pos: [5, 2, 3], rot: 90 });
  const occs2 = sm._occluders();
  assert.equal(occs2[0].parts.length, 2);
  // 두 part의 part.rot 는 occluder rot(90) + posRel 회전이 합성된 결과. 합산 rot는 90.
  for (const p of occs2[0].parts) assert.equal(p.rot, 90);
});
