import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GameStateMachine } from '../src/core/GameStateMachine.js';
import { validateLevel } from '../src/io/LevelLoader.js';

function load(id) {
  return JSON.parse(readFileSync(new URL(`../levels/${id}.json`, import.meta.url)));
}

test('L1: 스키마 유효', () => {
  assert.equal(validateLevel(load('L1')).ok, true);
});

test('L1: 막대를 길 높이로 내려 그림자로 갭 메우면 CLEAR', () => {
  const sm = new GameStateMachine(load('L1'));
  // 비스듬한 방향광 → 그림자가 오프셋된 채 막대 크기로 투영. 막대를 길 위로 옮겨 갭을 메움.
  sm.setMovableTransform(0, { pos: [6.5, 2.25, 3.5], rot: 0 });
  assert.equal(sm.go().result, 'CLEAR');
});

test('L2: 스키마 유효', () => {
  assert.equal(validateLevel(load('L2')).ok, true);
});

test('L2: 점광원에서 막대를 광원 쪽으로 밀어 그림자 확대 → 길 연결 시 CLEAR', () => {
  const sm = new GameStateMachine(load('L2'));
  // 광원 (6,8,12). 막대를 광원 가까이(z 큼) + 낮은 y로 → 확대된 그림자가 길 폭을 덮음.
  // 솔버 탐색: 여러 (z,y) 조합 중 CLEAR 나오는 배치 확인.
  let cleared = false;
  for (const z of [9, 10, 11]) {
    for (const y of [0.2, 0.5, 1.0]) {
      sm.reset();
      sm.setMovableTransform(0, { pos: [8, y, z], rot: 0 });
      if (sm.go().result === 'CLEAR') { cleared = true; break; }
    }
    if (cleared) break;
  }
  assert.equal(cleared, true);
});
