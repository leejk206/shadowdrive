// test/levelStore.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  itemsFromLevel, levelFromItems, blankLevel, newItem,
  serializeLevel, buildManifest, mergeLevelIds,
} from '../src/io/LevelStore.js';
import { validateLevel } from '../src/io/LevelLoader.js';

const SAMPLE = {
  id: 'L2',
  light: { type: 'point', vec: [8, 9, 12] },
  wall: { width: 16, height: 8 },
  start: [1, 3],
  goal: [15, 0],
  fixedOccluders: [],
  movableOccluders: [
    { shape: 'bar', role: 'floor', size: [5, 0.4, 1], spawn: [4, 6, 6], allow: { translate: true, rotate: true } },
  ],
  params: { carSpeed: 4, gravity: 9.8, maxClimbDeg: 35, gapPassRatio: 0.8 },
};

test('itemsFromLevel: fixed→pos, movable→spawn 통일', () => {
  const lv = {
    ...SAMPLE,
    fixedOccluders: [{ shape: 'bar', role: 'floor', size: [3, 1, 1], pos: [2, 2, 4] }],
  };
  const { items } = itemsFromLevel(lv);
  assert.equal(items.length, 2);
  assert.equal(items[0].fixed, true);
  assert.deepEqual(items[0].pos, [2, 2, 4]);
  assert.equal(items[1].fixed, false);
  assert.deepEqual(items[1].pos, [4, 6, 6]); // spawn → pos
});

test('round-trip: level → items → level 동일(정규화)', () => {
  const { globals, items } = itemsFromLevel(SAMPLE);
  const out = levelFromItems(globals, items);
  assert.deepEqual(out, SAMPLE);
});

test('round-trip: fixed + rot 보존', () => {
  const lv = {
    ...SAMPLE,
    fixedOccluders: [{ shape: 'prism', role: 'ceiling', size: [3, 2, 1], pos: [5, 5, 5], rot: 30 }],
    movableOccluders: [
      { shape: 'bar', role: 'floor', size: [5, 0.4, 1], spawn: [4, 6, 6], rot: 45, allow: { translate: true, rotate: false } },
    ],
  };
  const { globals, items } = itemsFromLevel(lv);
  const out = levelFromItems(globals, items);
  assert.deepEqual(out, lv);
});

test('round-trip: 쿼터니언 rot 배열 보존', () => {
  const lv = {
    ...SAMPLE,
    movableOccluders: [
      { shape: 'bar', role: 'floor', size: [5, 0.4, 1], spawn: [4, 6, 6], rot: [0, 0, 0.383, 0.924], allow: { translate: true, rotate: true } },
    ],
  };
  const out = levelFromItems(...Object.values(splitGlobalsItems(lv)));
  assert.deepEqual(out.movableOccluders[0].rot, [0, 0, 0.383, 0.924]);
});

test('rot=0이면 출력에서 생략', () => {
  const { globals, items } = itemsFromLevel(SAMPLE);
  const out = levelFromItems(globals, items);
  assert.equal('rot' in out.movableOccluders[0], false);
});

test('blankLevel/newItem 산출물이 validateLevel 통과', () => {
  const lv = blankLevel('L8');
  const { globals } = itemsFromLevel(lv);
  lv.movableOccluders.push(toMovable(newItem('bar', globals)));
  assert.equal(validateLevel(lv).ok, true);
});

test('export 산출물이 validateLevel round-trip 통과', () => {
  const { globals, items } = itemsFromLevel(SAMPLE);
  const out = levelFromItems(globals, items);
  const reparsed = JSON.parse(serializeLevel(out));
  assert.equal(validateLevel(reparsed).ok, true);
});

test('mergeLevelIds: 순서 유지·중복 제거', () => {
  assert.deepEqual(mergeLevelIds(['L1', 'L2'], ['L2', 'L8']), ['L1', 'L2', 'L8']);
  assert.deepEqual(mergeLevelIds(['L1'], []), ['L1']);
  assert.deepEqual(mergeLevelIds([], ['D1']), ['D1']);
});

test('buildManifest: 파싱 가능한 JSON 배열', () => {
  const s = buildManifest(['L1', 'L2', 'L8']);
  assert.deepEqual(JSON.parse(s), ['L1', 'L2', 'L8']);
});

// 헬퍼: globals/items를 순서대로 반환(levelFromItems(...spread) 용)
function splitGlobalsItems(lv) {
  const { globals, items } = itemsFromLevel(lv);
  return { globals, items };
}

function toMovable(it) {
  return { shape: it.shape, role: it.role, size: it.size, spawn: it.pos, allow: it.allow };
}
