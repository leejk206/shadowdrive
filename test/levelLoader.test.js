import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateLevel } from '../src/io/LevelLoader.js';

const valid = {
  id: 'X', light: { type: 'point', vec: [0, 0, 10] },
  wall: { width: 12, height: 6 }, start: [1, 0], goal: [11, 0],
  fixedOccluders: [], movableOccluders: [
    { shape: 'bar', size: [3, 0.4, 1], spawn: [5, 1, 4], allow: { translate: true, rotate: true } },
  ],
  params: { carSpeed: 4, gravity: 9.8, maxClimbDeg: 35, gapPassRatio: 0.8 },
};

test('정상 레벨은 통과', () => {
  assert.equal(validateLevel(valid).ok, true);
});

test('light.type 누락이면 에러', () => {
  const bad = JSON.parse(JSON.stringify(valid)); delete bad.light.type;
  const r = validateLevel(bad);
  assert.equal(r.ok, false);
  assert.match(r.errors.join(','), /light/);
});

test('movable shape가 미지원이면 에러', () => {
  const bad = JSON.parse(JSON.stringify(valid)); bad.movableOccluders[0].shape = 'sphere';
  const r = validateLevel(bad);
  assert.equal(r.ok, false);
  assert.match(r.errors.join(','), /shape/);
});

test('movable에 spawn 누락이면 에러', () => {
  const bad = JSON.parse(JSON.stringify(valid)); delete bad.movableOccluders[0].spawn;
  const r = validateLevel(bad);
  assert.equal(r.ok, false);
  assert.match(r.errors.join(','), /spawn/);
});

test('fixed에 pos 누락이면 에러', () => {
  const bad = JSON.parse(JSON.stringify(valid));
  bad.fixedOccluders = [{ shape: 'bar', size: [3, 0.4, 1] }]; // pos 없음
  const r = validateLevel(bad);
  assert.equal(r.ok, false);
  assert.match(r.errors.join(','), /pos/);
});
