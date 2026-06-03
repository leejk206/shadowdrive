import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateVehicle } from '../src/core/VehicleSimulator.js';

// 합성 콜라이더(convex 폴리곤 배열)로 차량 물리의 핵심 동작을 단정한다.
const sq = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const P = { gravity: 9.8 };
const veh = (over) => ({
  startX: 2, startY: 5, goal: { x: 12, y: 1, hw: 1, hh: 1 }, failY: -8, maxSteps: 8000, ...over,
});

test('평지: 차가 우측으로 굴러 목표 도달 → CLEAR, 거의 수평 유지', () => {
  const ground = [sq(0, 0, 16, 0.5)];          // 긴 바닥
  const r = simulateVehicle(ground, P, veh());
  assert.equal(r.result, 'CLEAR');
  const last = r.trajectory[r.trajectory.length - 1];
  assert.ok(Math.abs(last.angle) < 0.3, `angle ${last.angle}`); // 거의 수평
});

test('벽: 세로 높은 벽에 막혀 수직 등반하지 않음 (원버그 회귀)', () => {
  // 바닥 + x=6에 높은 벽(세로 폴리곤). 차는 벽 앞에서 막혀야 함.
  const colliders = [sq(0, 0, 16, 0.5), sq(6, 0.5, 6.6, 6)];
  const r = simulateVehicle(colliders, P, veh());
  assert.equal(r.result, 'FAIL');               // 목표 못 감
  // 착지 후(벽 근처 x>4) 차가 벽을 타고 오르지 않음: 그 구간 y가 낮게 유지(스폰 높이 5 제외).
  const nearWall = r.trajectory.filter((p) => p.x > 4);
  const maxY = Math.max(...nearWall.map((p) => p.y));
  assert.ok(maxY < 2, `차가 벽을 타고 오름: maxY=${maxY}`);
  assert.ok(r.trajectory[r.trajectory.length - 1].x < 7, '벽을 통과함');
});

test('경사: 완만한 램프를 올라 목표 도달 → CLEAR', () => {
  // 바닥(좌) → 램프(기울어진 폴리곤) → 높은 평지(우)에 목표
  const ramp = [
    sq(0, 0, 5, 0.5),
    // 기울어진 램프(CCW): 바닥 (5,0)→(9,2) 윗면 (9,2.5)→(5,0.5)
    [[5, 0.0], [9, 2.0], [9, 2.5], [5, 0.5]],
    sq(9, 2.0, 16, 2.5),
  ];
  const r = simulateVehicle(ramp, P, veh({ goal: { x: 12, y: 3, hw: 1.2, hh: 1.2 } }));
  assert.equal(r.result, 'CLEAR');
});

test('갭: 도로가 끊긴 구덩이로 추락 → FAIL(fell)', () => {
  const colliders = [sq(0, 0, 5, 0.5)]; // x>5는 허공
  const r = simulateVehicle(colliders, P, veh());
  assert.equal(r.result, 'FAIL');
  assert.equal(r.reason, 'fell');
});

test('목표 위 스폰 + 평지: 바로 CLEAR', () => {
  const ground = [sq(0, 0, 16, 0.5)];
  const r = simulateVehicle(ground, P, veh({ startX: 11, goal: { x: 12, y: 1, hw: 2, hh: 2 } }));
  assert.equal(r.result, 'CLEAR');
});

test('그림자 금지 구역: 평지 위 데드존이 도로를 지워 차가 추락 → FAIL', () => {
  const ground = [sq(0, 0, 16, 0.5)];
  // 넓은 세로 데드존 x[6,13] 전 높이 → 그 구간 도로 사라짐 → 코스트로 못 건너 추락
  const r = simulateVehicle(ground, P, veh({ noShadowZones: [{ x0: 6, x1: 13, y0: -1, y1: 9 }] }));
  assert.equal(r.result, 'FAIL');
  assert.equal(r.reason, 'fell');
});

test('그림자 금지 구역: 도로보다 높은 데드존은 주행에 영향 없음 → CLEAR', () => {
  const ground = [sq(0, 0, 16, 0.5)];
  // 데드존이 도로(y~0.5) 위(y 3~9)만 가림 → 바닥 도로는 멀쩡 → 통과
  const r = simulateVehicle(ground, P, veh({ noShadowZones: [{ x0: 7, x1: 9, y0: 3, y1: 9 }] }));
  assert.equal(r.result, 'CLEAR');
});
