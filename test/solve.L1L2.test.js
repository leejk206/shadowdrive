import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GameStateMachine } from '../src/core/GameStateMachine.js';
import { validateLevel } from '../src/io/LevelLoader.js';
import { searchSolvable } from './helpers/solvable.js';

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

test('L2: 점광원 그림자로 길을 만들어 낙하·주행 CLEAR (정상 풀이 존재)', () => {
  // iter-4 주의: 막대를 광원 쪽(z 큼)으로 밀면 그림자 도로가 y≈-20까지 내려가고, 예전엔 차가
  // 목표 패드 벽을 '수직 등반'해 CLEAR 됐다(치트). 등반 경사 한계로 그 풀이는 막혔으므로,
  // 정상(≤maxClimbDeg 램프) CLEAR 배치가 존재하는지를 시드 고정 탐색으로 검증한다.
  assert.equal(searchSolvable(load('L2')), true);
});
