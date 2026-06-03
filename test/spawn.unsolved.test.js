import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GameStateMachine } from '../src/core/GameStateMachine.js';
function load(id){ return JSON.parse(readFileSync(new URL(`../levels/${id}.json`, import.meta.url))); }
for (const id of ['L1','L2','L3','L4','L5','L6','L7','L8','L9','L10','L11','L12']) {
  test(`${id}: 기본 spawn 상태에서는 미해결(Go→FAIL)`, () => {
    const sm = new GameStateMachine(load(id));
    assert.equal(sm.go().result, 'FAIL');
  });
}
