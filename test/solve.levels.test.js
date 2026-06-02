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

// L5: iter-4에서 ceiling 장애물화 시 고정 천장(y=1.4, 그림자 하단 -2.13)이 중앙 전체를 막아
//   풀이가 전무했음. 천장을 y=5.5(그림자 하단 +3.33)로 올려 '천장 밑 통과' 정상 풀이가 성립 →
//   solvable 활성화(회귀 방지). 천장 메커닉 학습용 튜토리얼은 별도 플랜 참고
//   (docs/superpowers/plans/2026-06-02-tutorial.md).
test('L5 solvable', () => assert.equal(solvable('L5'), true));

// DEFERRED — L6/L7은 레벨 최종화 전까지 skip 유지(사용자 결정: "레벨 설계는 마지막").
//   시드 탐색 솔버로 정상(치트 아님) 풀이가 존재함은 확인됨(각각 iter 628/62에 CLEAR)이나
//   'L6~L7 최종 출시 금지' 게이트가 유효하므로 skip 유지.
const DEFER_L67 = '레벨 최종화 대기 — 시드 솔버로 정상 풀이 확인됐으나 L6~L7 출시 게이트 유지';
test('L6 solvable', { skip: DEFER_L67 }, () => assert.equal(solvable('L6'), true));
test('L7 solvable', { skip: DEFER_L67 }, () => assert.equal(solvable('L7'), true));
