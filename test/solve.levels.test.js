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

test('L3 solvable', () => assert.equal(solvable('L3'), true));
test('L4 solvable', () => assert.equal(solvable('L4'), true));

// DEFERRED — L5~L7(compound 레벨)은 레벨 최종화 전까지 skip 유지(사용자 결정: "레벨 설계는 마지막").
//   L6/L7: iter-4 시드 탐색 솔버로는 이미 정상(치트 아님) 풀이가 존재함이 확인됨(각각 iter 628/62에
//          CLEAR). 하지만 'L5~L7 최종 출시 금지' 게이트가 유효하므로 skip 유지.
//   L5  : iter-4에서 ceiling을 장애물로 구현하면서 고정 ceiling 블록이 모든 경로를 막아 풀이가
//          전무(시드 탐색 40k회 0 CLEAR). 레벨 재설계(ceiling 위치/크기 또는 floor 도형) 필수.
const DEFER_L5 = '레벨 재설계 필요 (iter-4) — ceiling 장애물화로 현재 지오메트리에 CLEAR 배치 0';
const DEFER_L67 = '레벨 최종화 대기 — 시드 솔버로 정상 풀이 확인됐으나 L5~L7 출시 게이트 유지';
test('L5 solvable', { skip: DEFER_L5 }, () => assert.equal(solvable('L5'), true));
test('L6 solvable', { skip: DEFER_L67 }, () => assert.equal(solvable('L6'), true));
test('L7 solvable', { skip: DEFER_L67 }, () => assert.equal(solvable('L7'), true));
