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

test('내리막 in-run으로 가속해 입술에서 발사 → 갭을 넘어 CLEAR(스키점프)', () => {
  // 내리막 in-run(2.5→0, 27°)으로 carSpeed 이상 속도를 쌓고, 완만한 입술(0→0.4, 27°)에서
  // 발사 → 폭 2.0 갭(void)을 포물선으로 넘어 착지. (기존 '동력으로 급경사 등반 후 발사'는
  // 뉴턴 물리에선 비물리적이라, 실제 스키점프=내리막 가속→발사 로 교체.)
  const f = makeField(-1, 16, 681, (x) => {
    if (x < 5) return 2.5 - (x > 0 ? x : 0) * (2.5 / 5); // 내리막 in-run
    if (x < 5.8) return (x - 5) * 0.5;                   // 완만 입술 0→0.4
    if (x < 7.8) return null;                            // 갭(폭 2.0)
    return 0;                                            // 착지
  });
  const car = { ...baseCar, startX: 0, startY: null, goalX: 9.3, goalY: 0, goalHW: 1.5, goalHH: 2.0 };
  const r = simulate(f, params, car);
  assert.equal(r.result, 'CLEAR', `reason=${r.reason}`);
  // 갭(void) 위에 궤적 점이 존재 = 접지 불가 영역을 비행(발사체)했다는 증거.
  const airborne = r.trajectory.some(([px]) => px > 5.85 && px < 7.75);
  assert.ok(airborne, '갭 위 비행 구간이 있어야 함');
});

test('내리막에서 중력으로 carSpeed를 초과해 가속한다(운동량 축적)', () => {
  // 긴 완만 내리막(6→0, slope -0.5). 접선 속도가 carSpeed(=4)를 뚜렷이 초과해야 한다.
  // (양방향 크루즈였던 기존 모델은 carSpeed로 제동돼 초과 불가 → 스키점프 불능이었음.)
  const f = makeField(-1, 20, 801, (x) => (x < 12 ? 6 - (x > 0 ? x : 0) * (6 / 12) : 0));
  const r = simulate(f, params, { ...baseCar, startX: 0, startY: null, goalX: 16 });
  let smax = 0;
  const t = r.trajectory;
  for (let i = 1; i < t.length; i++) {
    const s = Math.hypot(t[i][0] - t[i - 1][0], t[i][1] - t[i - 1][1]) / 0.008;
    if (s > smax) smax = s;
  }
  assert.ok(smax > params.carSpeed * 1.25, `내리막 가속 미흡: maxSpeed=${smax.toFixed(2)}`);
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

test('iter-3: 갭 발사 후 비행 높이 기준 작은 턱(≤MAX_STEP_UP)엔 정상 착지(과도한 차단 아님)', () => {
  // 순간이동 차단(MAX_STEP_UP)이 "위에서 낙하 착지"까지 막으면 안 된다.
  // 발사 도로(y=0) → 볼록 입술 → 갭 → 비행 중 차의 높이 부근(턱 작음) 착지 도로.
  const f = makeField(0, 18, 721, (x) => {
    if (x < 5) return 0;             // 발사 도로
    if (x < 5.5) return (x - 5) * 1; // 볼록 입술 0→0.5
    if (x < 7) return null;          // 갭
    return 0.4;                      // 비행 높이와 비슷한 낮은 턱 → 착지 가능
  });
  const r = simulate(f, { ...params, carSpeed: 8 }, { ...baseCar, startX: 1, startY: 3, goalX: 16, goalY: 0.4, goalHH: 0.8 });
  assert.equal(r.result, 'CLEAR', `reason=${r.reason}`);
});

test('iter-3: 주행 도로보다 한참 낮은 목표는 통과(overshoot)로 FAIL', () => {
  // 차가 달리는 도로(y=3)와 목표(y=0)의 높이차가 목표 반높이(0.8)보다 크면
  // AABB가 한 번도 겹치지 못하고 지나친다 → 'overshot goal'.
  const f = makeField(0, 14, 561, () => 3);
  const r = simulate(f, params, { ...baseCar, startX: 1, startY: 5, goalX: 12, goalY: 0, goalHH: 0.8 });
  assert.equal(r.result, 'FAIL');
  assert.match(r.reason, /overshot/i);
});

test('iter-3: 이미 도로에 접지한 채 시작(startY==floor)하면 즉시 주행', () => {
  // 발사대가 도로와 같은 높이면 공중 단계 없이 곧바로 마찰 추력으로 전진.
  const f = makeField(0, 14, 561, () => 0);
  const r = simulate(f, params, { ...baseCar, startX: 1, startY: 0, goalX: 12, goalY: 0, goalHH: 0.8 });
  assert.equal(r.result, 'CLEAR', `reason=${r.reason}`);
  const earlyDx = Math.abs(r.trajectory[3][0] - r.trajectory[0][0]);
  assert.ok(earlyDx > 0.02, `접지 시작은 즉시 전진해야: dx=${earlyDx}`);
});

test('iter-4: 출발 지점을 그림자가 덮으면(도로 상단 > startY) 위로 순간이동 없이 끼임 → FAIL "jam"', () => {
  // start_x(=1)에서 도로(그림자 상단) y=6 이 발사대 startY(=3)보다 위 = 물체가 차를 덮음/침범.
  // 위(가장 높은 면)로 순간이동시키지 말고 그 자리에 끼여 정지 → FAIL.
  const f = makeField(0, 14, 561, () => 6);
  const r = simulate(f, params, { ...baseCar, startX: 1, startY: 3, goalX: 12, goalY: 6, goalHH: 1 });
  const maxY = Math.max(...r.trajectory.map(([, y]) => y));
  assert.ok(maxY < 3.5, `차가 위로 순간이동함: maxY=${maxY}`);
  assert.equal(r.result, 'FAIL');
  assert.match(r.reason, /jam/i);
});

test('iter-4: 도로 상단이 startY와 같으면(접지) 끼임이 아니라 정상 주행', () => {
  // 덮음 판정이 정상 접지 출발(startY==floor)까지 끼임으로 막으면 안 된다.
  const f = makeField(0, 14, 561, () => 2);
  const r = simulate(f, params, { ...baseCar, startX: 1, startY: 2, goalX: 12, goalY: 2, goalHH: 0.8 });
  assert.equal(r.result, 'CLEAR', `reason=${r.reason}`);
});

// ── iter-4: 천장(ceiling) 충돌 — role:'ceiling' 그림자는 차 머리를 막는 장애물 ──

test('iter-4: 차 상단(y+H)이 천장보다 높은 구간은 통과 불가 → FAIL "ceiling"', () => {
  // 평지 도로(y=0) 위, x∈[4,8]에 차 높이(0.5)보다 낮은 천장(0.3).
  const f = makeField(0, 14, 561, () => 0);
  f.ceiling = f.xs.map((x) => (x > 4 && x < 8) ? 0.3 : Infinity);
  const r = simulate(f, params, { ...baseCar, startX: 1, startY: 0, goalX: 12, goalY: 0, goalHH: 0.8 });
  assert.equal(r.result, 'FAIL');
  assert.match(r.reason, /ceiling/i);
});

test('iter-4: 천장이 차 높이보다 위(여유 있음)면 정상 통과 → CLEAR', () => {
  // 천장 1.0, 차 높이 0.5 → 머리 위 여유 → 막히지 않음.
  const f = makeField(0, 14, 561, () => 0);
  f.ceiling = f.xs.map((x) => (x > 4 && x < 8) ? 1.0 : Infinity);
  const r = simulate(f, params, { ...baseCar, startX: 1, startY: 0, goalX: 12, goalY: 0, goalHH: 0.8 });
  assert.equal(r.result, 'CLEAR', `reason=${r.reason}`);
});

// ── iter-4: 등반 경사 한계(maxClimbDeg) — 수직 그림자 벽 엘리베이터 차단 ──

test('iter-4: 접지 차는 maxClimbDeg 초과 수직 벽을 오르지 못한다 → FAIL "steep"', () => {
  // x<4 평지(y=0), x≈4에서 거의 수직으로 y=10까지 솟는 벽. 목표는 벽 위(12, 10).
  const f = makeField(0, 14, 561, (x) => x < 4 ? 0 : (x < 4.1 ? (x - 4) * 100 : 10));
  const r = simulate(f, params, { ...baseCar, startX: 1, startY: 0, goalX: 12, goalY: 10, goalHH: 1 });
  const maxY = Math.max(...r.trajectory.map(([, y]) => y));
  assert.ok(maxY < 4, `수직 벽 등반(엘리베이터)이 일어남: maxY=${maxY}`);
  assert.equal(r.result, 'FAIL');
  assert.match(r.reason, /steep/i);
});

test('iter-4: maxClimbDeg 이내 완만한 램프는 정상 등판 → CLEAR', () => {
  // 18° 경사(slope≈0.33)로 y=0→2 등판 후 평지. 목표 (12, 2).
  const f = makeField(0, 14, 561, (x) => {
    if (x < 4) return 0;
    if (x < 10) return (x - 4) * (2 / 6); // slope ≈ 0.333 < tan35
    return 2;
  });
  const r = simulate(f, params, { ...baseCar, startX: 1, startY: 0, goalX: 12, goalY: 2, goalHH: 0.8 });
  assert.equal(r.result, 'CLEAR', `reason=${r.reason}`);
});
