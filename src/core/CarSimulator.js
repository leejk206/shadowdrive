// src/core/CarSimulator.js
// 좌→우 자동차. 통합 탄도(ballistic) + 지면 구속 적분기.
// 평지에선 추력으로 주행, 내리막 가속, 오르막 감속, 볼록한 램프 입술에서
// 발사체처럼 launch → 갭/구덩이를 실제 포물선으로 넘는다(스키 점프).

const DT = 0.008;     // 적분 시간 간격(초)
const EPS = 1e-3;     // 경사 측정용 미소 거리
const ACCEL = 3;      // 엔진 추력 계수 (목표 속도로 수렴)
const SLOPE_CLAMP = 20; // 경사 클램프(수치 안정)
const MAX_STEP_UP = 0.5; // 공중에서 올라탈 수 있는 floor 상승 한계(이상은 그림자 벽=장애물, 순간이동 금지)

/** xs 격자에서 x에 해당하는 floor 값(선형보간, void면 null) */
function floorAt(field, x) {
  const { xs, floor } = field;
  if (x <= xs[0]) return floor[0];
  if (x >= xs[xs.length - 1]) return floor[xs.length - 1];
  const dx = field.dx;
  const i = Math.floor((x - xs[0]) / dx);
  const a = floor[i], b = floor[i + 1];
  if (a === null || b === null) return null;
  const t = (x - xs[i]) / dx;
  return a + t * (b - a);
}

/**
 * @param {object} field  Heightfield { xs, dx, floor, ceiling }
 * @param {object} params { carSpeed, gravity, maxClimbDeg?, gapPassRatio? }
 *   maxClimbDeg/gapPassRatio는 더이상 사용하지 않음(레벨 스키마 호환용으로만 유지).
 * @param {object} car    { length, height, startX, goalX, goalY, goalHW, goalHH }
 *   목표는 [goalX, goalY]를 중심으로 한 축정렬 사각 영역(반폭 goalHW, 반높이 goalHH).
 * @returns {{result:'CLEAR'|'FAIL', reason:string, trajectory:Array<[number,number]>}}
 */
export function simulate(field, params, car) {
  const g = params.gravity;
  const carSpeed = params.carSpeed;

  // 목표 영역 AABB
  const hw = car.goalHW != null ? car.goalHW : 0.6;
  const hh = car.goalHH != null ? car.goalHH : 0.8;
  const gx = car.goalX;
  const gy = car.goalY != null ? car.goalY : 0;
  const gLeft = gx - hw, gRight = gx + hw;
  const gBottom = gy - hh, gTop = gy + hh;
  const L = car.length, H = car.height;

  // (cx, cy)에 놓인 차 AABB가 목표 영역과 겹치면 true.
  // 차 AABB: x ∈ [cx-L/2, cx+L/2], y ∈ [cy, cy+H]
  function inGoal(cx, cy) {
    if (cy === null) return false;
    const cLeft = cx - L / 2, cRight = cx + L / 2;
    const cBottom = cy, cTop = cy + H;
    return cRight >= gLeft && cLeft <= gRight && cTop >= gBottom && cBottom <= gTop;
  }

  // "fell off" 임계: 필드 내 최저 도로보다 6 아래.
  let minFloor = Infinity;
  for (const f of field.floor) if (f !== null && f < minFloor) minFloor = f;
  if (!isFinite(minFloor)) minFloor = 0;
  const failY = minFloor - 6;

  let x = car.startX;
  let y = floorAt(field, x);
  const traj = [];

  function fail(reason) { return { result: 'FAIL', reason, trajectory: traj }; }
  function clear(reason) { return { result: 'CLEAR', reason, trajectory: traj }; }

  // iteration-3: start 구간은 도로 마스킹으로 floor가 없을 수 있다 →
  // 'start on void' 실패 대신 공중 발사대(car.startY)에서 시작해 플레이어가 만든
  // 그림자 도로로 낙하·착지하는 설계. 끝내 도로가 없으면 아래 루프가 'fell'로 처리.
  let grounded;
  if (y === null) {
    y = (car.startY != null) ? car.startY : 0;
    grounded = false;
  } else {
    grounded = true;
  }

  let vx = carSpeed, vy = 0;
  traj.push([x, y]);

  let guard = 0;
  while (true) {
    if (++guard > 200000) return fail('timeout (stalled)');

    // 1) 목표 도달?
    if (inGoal(x, y)) return clear('reached goal area');

    const yPrev = y;   // 적분 전 높이(착지/충돌 판정용)

    // 2) 힘 적용
    const ghNow = floorAt(field, x);
    if (grounded && ghNow !== null) {
      // 지면 위: 경사 따라 접선 속도 갱신.
      const fp = floorAt(field, x + EPS);
      const fm = floorAt(field, x - EPS);
      let slope;
      if (fp !== null && fm !== null) slope = (fp - fm) / (2 * EPS);
      else if (fp !== null) slope = (fp - ghNow) / EPS;
      else if (fm !== null) slope = (ghNow - fm) / EPS;
      else slope = 0;
      slope = Math.max(-SLOPE_CLAMP, Math.min(SLOPE_CLAMP, slope));
      const tlen = Math.hypot(1, slope);
      const tx = 1 / tlen, ty = slope / tlen;
      // 접선 방향 속력
      let s = vx * tx + vy * ty;
      // 중력 접선 성분: 내리막(slope<0) → 가속, 오르막 → 감속
      s += -g * (slope / tlen) * DT;
      // 엔진 추력: carSpeed로 수렴
      s += ACCEL * (carSpeed - s) * DT;
      if (s < 0.1) s = 0.1; // 항상 전진 시도
      vx = s * tx; vy = s * ty;
    } else {
      // 공중 또는 void 위: 추력 없음, 중력만.
      vy -= g * DT;
    }

    // 3) 적분
    x += vx * DT;
    y += vy * DT;

    // 4) 지면 구속
    const gh = floorAt(field, x);
    if (gh !== null && y <= gh) {
      // grounded(연속 지면 추종)이면 그대로 따라간다(램프 등판 포함).
      // 공중일 때는 floor가 직전 높이보다 MAX_STEP_UP 이내로만 위에 있을 때 올라탄다
      //  - 위에서 낙하 착지(stepUp<0) · 소폭 턱(curb): 정상 착지
      //  - 발사대보다 한참 높은 그림자 벽(stepUp 큼): 올라타지 않음 → 계속 비행하다 낙하
      //    (iteration-3: "맨 위로 순간이동" 버그 차단. 그림자=장애물.)
      const stepUp = gh - yPrev;
      if (grounded || stepUp <= MAX_STEP_UP) {
        y = gh; grounded = true;
      } else {
        grounded = false;
      }
    } else {
      grounded = false; // 공중(볼록 입술 발사) 또는 void 위
    }

    traj.push([x, y]);

    // 5) 실패/탈출
    if (y < failY) return fail('fell');
    if (x > (gRight + L)) {
      // 목표 영역 전체를 한 번도 겹치지 못하고 지나침
      if (inGoal(x, y)) return clear('reached goal area');
      return fail('overshot goal');
    }
  }
}
