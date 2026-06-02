import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate } from '../src/core/CarSimulator.js';

// 평탄/램프 heightfield 헬퍼. fn(x) → floor 값(또는 null=void).
function makeField(xMin, xMax, samples, fn) {
  const xs = [], floor = [], ceiling = [];
  const dx = (xMax - xMin) / (samples - 1);
  for (let i = 0; i < samples; i++) {
    const x = xMin + i * dx;
    xs.push(x);
    floor.push(fn(x));
    ceiling.push(Infinity);
  }
  return { xs, dx, floor, ceiling };
}

const params = { carSpeed: 4, gravity: 9.8, maxClimbDeg: 35, gapPassRatio: 2.5 };
// 목표는 [goalX, goalY] 중심의 영역(반폭 1.5, 반높이 2.0).
const baseCar = { length: 1, height: 0.5, startX: 0, goalX: 9, goalY: 0, goalHW: 1.5, goalHH: 2.0 };

test('연속 평지 → 추력으로 목표 영역까지 주행 CLEAR', () => {
  const f = makeField(-1, 12, 131, () => 0);
  const r = simulate(f, params, baseCar);
  assert.equal(r.result, 'CLEAR');
});

test('목표 직전 넓은 구덩이(램프 없음) + 저속 → 추락 FAIL "fell"', () => {
  // start=0, goal=9. x∈[5,8.5] 구덩이(void). 램프 없이 그냥 떨어진다.
  const f = makeField(-1, 12, 261, (x) => (x > 5 && x < 8.5) ? null : 0);
  const r = simulate(f, { ...params, carSpeed: 2 }, baseCar);
  assert.equal(r.result, 'FAIL');
  assert.match(r.reason, /fell/i);
});

test('구덩이 앞 램프가 차를 목표 영역으로 발사 → CLEAR + 공중 구간 존재', () => {
  // 평지(0~5) → 상승 램프(5~6, 높이 0→2) → 구덩이(6~8.5 void) → 착지 평지(높이 0).
  // 목표 영역을 착지 평지 위(goalX=9.5)에 둔다.
  const ramp = (x) => {
    if (x < 5) return 0;
    if (x < 6) return (x - 5) * 2;     // 0 → 2, 볼록 입술
    if (x < 8.5) return null;          // 구덩이
    return 0;                          // 착지 평지
  };
  const f = makeField(-1, 13, 561, ramp);
  const car = { ...baseCar, goalX: 9.5, goalY: 0, goalHW: 1.5, goalHH: 2.0 };
  const r = simulate(f, { ...params, carSpeed: 9 }, car);
  assert.equal(r.result, 'CLEAR', `reason=${r.reason}`);

  // 공중 구간 증명: 구덩이(void, floor=null) 위에서 y가 착지 평지 높이(0)보다
  // 명확히 위로 떠 있는 점이 존재 → 발사체로 비행 중이었다는 증거.
  const airborne = r.trajectory.some(([px, py]) => {
    const gh = ramp(px);
    return gh === null && py > 0.5; // void 위인데 공중에 떠 있음
  });
  assert.ok(airborne, '궤적에 공중(비행) 구간이 있어야 함');
});

test('도로가 goalX 못 미쳐도 목표 영역 안에서 끝나면 → CLEAR', () => {
  // goalX=9, 영역 x∈[7.5,10.5]. 도로가 x=8(영역 내부)까지만, 그 뒤 void.
  // 차가 x≈8 부근에서 AABB가 목표 영역과 겹쳐 CLEAR.
  const f = makeField(-1, 12, 261, (x) => (x > 8.0) ? null : 0);
  const r = simulate(f, params, baseCar);
  assert.equal(r.result, 'CLEAR', `reason=${r.reason}`);
  assert.match(r.reason, /goal area/i);
});

test('iter-3: 발사대(startY)에서 start_x 아래 도로로 낙하해 접지·주행 CLEAR', () => {
  // 차는 공중에서 추력이 없으므로 제자리 낙하. start_x(=1) 아래에 도로가 있어야 접지 후 주행.
  const f = makeField(-1, 12, 261, () => 0); // 전 구간 평지 도로
  const r = simulate(f, params, { ...baseCar, startX: 1, startY: 3, goalX: 9 });
  assert.equal(r.result, 'CLEAR', `reason=${r.reason}`);
  assert.ok(r.trajectory[0][1] > 2, '발사대(높은 곳)에서 시작해야 함');
  // 공중 추력 0 증거: 첫 몇 샘플은 수평 이동이 거의 없어야(낙하만)
  const earlyDx = Math.abs(r.trajectory[2][0] - r.trajectory[0][0]);
  assert.ok(earlyDx < 0.05, `공중에서 수평 이동(추력)이 없어야: dx=${earlyDx}`);
});

test('iter-3: 공중 시작 후 받쳐줄 도로가 전혀 없으면 → FAIL "fell"', () => {
  const f = makeField(-1, 12, 131, () => null);
  const r = simulate(f, params, { ...baseCar, startY: 3 });
  assert.equal(r.result, 'FAIL');
  assert.match(r.reason, /fell/i);
});

test('iter-3: 발사대보다 높은 그림자 도로엔 위로 순간이동하지 않는다(장애물 충돌)', () => {
  // start_x 마스킹(x<2 void), 그 직후 발사대(startY=3)보다 높은 도로 y=5.
  // 공중에서 위로 솟은 그림자 면에 정면 충돌 → 위로 순간이동 금지.
  const f = makeField(0, 16, 321, (x) => (x < 2) ? null : 5);
  const r = simulate(f, params, { ...baseCar, startX: 1, startY: 3, goalX: 15 });
  const maxY = Math.max(...r.trajectory.map(([, y]) => y));
  assert.ok(maxY < 3.5, `car teleported up to y=${maxY}`);
  assert.equal(r.result, 'FAIL');
});
