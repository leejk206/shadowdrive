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

for (const id of ['L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9', 'L10', 'L11', 'L12']) {
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

// L8/L9: 새 오목 crescent(스쿱) 스키점프 쇼케이스. 생성-검증 루프로 설계
//   (scratch_designer 하네스): spawn=FAIL + 해 존재를 시드 탐색으로 확인.
//   L8 단일 크레센트(해밀도 ~4%), L9 크레센트+막대(~2.3%).
test('L8 solvable', () => assert.equal(solvable('L8'), true));
test('L9 solvable', () => assert.equal(solvable('L9'), true));

// L10/L11: 패턴 차용(원본 복제 아님) — 유사 장르의 디자인 원칙만.
//   L10 드롭인→킥커→갭(스키점프): 크레센트 스쿱 + 오목 rramp 램프. 해밀도 ~1.3%.
//   L11 모멘텀(연속 험프): 크레센트 스쿱 + dome 험프, 약간 높은 목표. 해밀도 ~0.6%.
test('L10 solvable', () => assert.equal(solvable('L10'), true));
test('L11 solvable', () => assert.equal(solvable('L11'), true));

// L12: 전용 스키점프 — 고정 가파른 in-run + 고정 킥커 lip이 차를 고속(최대 ~13, carSpeed의 3배+)으로
//   발사 → void 위를 비행. 플레이어는 착지 도로를 놓아 먼 목표까지 받는다. spawn-FAIL + 해 존재.
//   (물리: EXCESS_DECAY로 내리막 운동량이 발사까지 지속. carSimulator.test의 운동량/스키점프 참조)
test('L12 solvable', () => assert.equal(solvable('L12'), true));
