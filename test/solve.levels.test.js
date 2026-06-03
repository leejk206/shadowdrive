import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateLevel } from '../src/io/LevelLoader.js';
import { searchSolvable } from './helpers/solvable.js';

function load(id) {
  return JSON.parse(readFileSync(new URL(`../levels/${id}.json`, import.meta.url)));
}

// 레벨이 fall-and-drive로 풀 수 있는지(CLEAR 배치 존재) 검증.
// iter-4(천장 장애물 + 등반 경사 한계) 이후 균일-격자 솔버는 '수직 벽 등반' 치트 풀이를 더는
// 통과시키지 않아 정상 풀이를 놓친다 → 시드 고정 per-piece 볼륨 탐색으로 검증한다.
// (자세한 배경: test/helpers/solvable.js 주석)
function solvable(id, opts = {}) {
  return searchSolvable(load(id), opts);
}

for (const id of ['L3', 'L4', 'L5', 'L6', 'L7']) {
  test(`${id}: 스키마 유효`, () => assert.equal(validateLevel(load(id)).ok, true));
}

// 2026-06-03 커리큘럼 다양화: L3~L7을 메커니즘별로 재설계(생성-검증 하네스로 spawn=FAIL+해 존재 확인).
//   L3 경사/램프(prism) · L4 스쿱 스키점프(crescent) · L5 천장 장애물 밑 통과 ·
//   L6 회전 퍼즐(L) · L7 종합(crescent+rramp+bar). L6/L7 출시 게이트는 이번 설계 마무리로 해제.
test('L3 solvable', () => assert.equal(solvable('L3'), true));
test('L4 solvable', () => assert.equal(solvable('L4'), true));
test('L5 solvable', () => assert.equal(solvable('L5'), true));
test('L6 solvable', () => assert.equal(solvable('L6'), true));
test('L7 solvable', () => assert.equal(solvable('L7'), true));
