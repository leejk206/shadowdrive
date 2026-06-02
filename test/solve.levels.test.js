import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GameStateMachine } from '../src/core/GameStateMachine.js';
import { validateLevel } from '../src/io/LevelLoader.js';

function load(id) {
  return JSON.parse(readFileSync(new URL(`../levels/${id}.json`, import.meta.url)));
}

// 가동 오클루더들의 (x,y,z,rot)를 거친 격자로 탐색해 CLEAR 배치가 하나라도 있는지 확인.
// (레벨이 풀 수 있게 설계됐는지에 대한 sanity check. 실제 해법은 더 정밀.)
function solvable(id, opts = {}) {
  const lv = load(id);
  const sm = new GameStateMachine(lv);
  const xs = opts.xs || [lv.wall.width * 0.25, lv.wall.width * 0.4, lv.wall.width * 0.5, lv.wall.width * 0.6, lv.wall.width * 0.75];
  const ys = opts.ys || [0.2, 0.5, 1.0, 1.5];
  const zs = opts.zs || [4, 6, 8, 10];
  const rots = opts.rots || [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];
  const n = sm.movables.length;
  // 플레이어 배치 시뮬레이션: 공통 (y,z,rot)을 거칠게 스윕.
  //  - 가동 물체 1개: x를 전 격자에 걸쳐 단독 스윕(목표가 좌/우 어디든 도달).
  //  - 여러 개: xs 격자 위에 분산 배치(서로 다른 x)해 합성 길을 만든다.
  // 신물리(탄도+그림자길) 아래 CLEAR 배치가 하나라도 있으면 풀림.
  for (const y of ys) for (const z of zs) for (const rot of rots) {
    if (n === 1) {
      for (const x of xs) {
        sm.reset();
        sm.setMovableTransform(0, { pos: [x, y, z], rot: sm.movables[0].role === 'ceiling' ? 0 : rot });
        if (sm.go().result === 'CLEAR') return true;
      }
      continue;
    }
    sm.reset();
    for (let k = 0; k < n; k++) {
      const x = xs[Math.min(k, xs.length - 1)] + k * 0.01;
      sm.setMovableTransform(k, { pos: [x, y, z], rot: sm.movables[k].role === 'ceiling' ? 0 : rot });
    }
    if (sm.go().result === 'CLEAR') return true;
  }
  return false;
}

for (const id of ['L3', 'L4', 'L5', 'L6', 'L7']) {
  test(`${id}: 스키마 유효`, () => assert.equal(validateLevel(load(id)).ok, true));
}

test('L3 solvable', () => assert.equal(solvable('L3'), true));
test('L4 solvable', () => assert.equal(solvable('L4'), true));

// iteration-3 보류(DEFERRED): L5/L6/L7(compound 레벨)은 순간이동 버그로만 solver를 통과하던
// 상태였다. MAX_STEP_UP 도입(순간이동 차단) 후 낙하-주행 메커닉으로는 현재 지오메트리/광원에서
// 클리어 배치가 없어 자동 검증 불가(발사 높이를 천장까지 올려도 동일). 균일-배치 solver의 한계도 있음.
// → 사용자 결정으로 엔진 fix만 먼저 반영하고 레벨 재설계는 후속 작업으로 분리.
//   재설계(또는 solver 강화) 완료 시 아래 skip 해제할 것. 그 전엔 L5~L7을 최종본으로 출시 금지.
const DEFER = '낙하 메커닉용 레벨 재설계 대기 (iteration-3) — 순간이동 fix로 기존 compound 레벨 자동 검증 불가';
test('L5 solvable', { skip: DEFER }, () => assert.equal(solvable('L5'), true));
test('L6 solvable', { skip: DEFER }, () => assert.equal(solvable('L6'), true));
test('L7 solvable', { skip: DEFER }, () => assert.equal(solvable('L7', {
  ys: [0.2, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0],
  zs: [3, 4, 5, 6, 8, 10],
  rots: [0, 10, 20, -10, -20],
}), true));
