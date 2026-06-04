// src/core/VehicleSimulator.js
// 아케이드 2D 차량 물리(커스텀, 결정론). 그림자 convex 폴리곤을 고체로 취급한다.
//   차체 = 강체 OBB(위치·각도·선/각속도), 바퀴 2개 = 서스펜션 스프링으로 받치는 원.
//   바퀴 원 vs 폴리곤(circleVsConvex)으로 접지/구동/그립, 차체 OBB vs 폴리곤(convexVsConvex)으로
//   벽·천장·전복. 고정 dt + 속도비례 서브스텝으로 터널링 방지. RNG/Date 미사용 → 결정론.
import { circleVsConvex, convexVsConvex, obbCorners, clipToZones } from './collide2d.js';

const DT = 0.008;
const MAX_SUB = 12;          // 서브스텝 상한
const MASS = 1;
const SUSP_K = 70;           // 서스펜션 스프링 강성(바퀴당)
const SUSP_C = 9;            // 서스펜션 댐퍼
const DRIVE = 9;             // 모터 구동력(접지 시 전방)
const GRIP = 1.4;            // 견인 한계 = GRIP * 수직지지력
const TARGET_SPEED = 6;      // 이 전방속도 미만에서만 구동(런어웨이 방지)
const WALL_BAUMGARTE = 0.6;  // 차체 관통 위치보정 비율
const MAX_CORR = 0.35;       // 한 스텝 위치보정 상한(깊은 관통도 한 번에 안 튕기게 — 여러 스텝에 나눠 해소)
const LIN_DAMP = 0.02;       // 미세 선형 감쇠(수치 안정)
const ANG_DAMP = 0.08;       // 각속도 감쇠(과회전 억제)

/**
 * @param {Array<Array<[number,number]>>} colliders  convex 폴리곤 배열(고체 그림자)
 * @param {{gravity:number}} params
 * @param {object} vehicle  { startX, startY, goal:{x,y,hw,hh}, failY?, maxSteps?,
 *                            chassisHW?, chassisHH?, wheelR?, wheelBase?, wheelDrop? }
 * @returns {{result:'CLEAR'|'FAIL', reason:string, trajectory:Array}}
 */
export function simulateVehicle(colliders, params, vehicle) {
  const g = params.gravity != null ? params.gravity : 9.8;
  const hw = vehicle.chassisHW != null ? vehicle.chassisHW : 0.6;
  const hh = vehicle.chassisHH != null ? vehicle.chassisHH : 0.22;
  const wheelR = vehicle.wheelR != null ? vehicle.wheelR : 0.26;
  const wheelBase = vehicle.wheelBase != null ? vehicle.wheelBase : hw * 1.4;
  const wheelDrop = vehicle.wheelDrop != null ? vehicle.wheelDrop : hh + wheelR * 0.5;
  const maxSteps = vehicle.maxSteps != null ? vehicle.maxSteps : 8000;
  const I = MASS * (4 * hw * hw + 4 * hh * hh) / 12; // 박스 관성
  // 바퀴 로컬 위치(차체 기준): 앞/뒤, 약간 아래.
  const wheelsLocal = [[wheelBase / 2, -wheelDrop], [-wheelBase / 2, -wheelDrop]];

  // failY: 콜라이더 최저점 - 6
  let minY = Infinity;
  for (const poly of colliders) for (const [, y] of poly) if (y < minY) minY = y;
  if (!isFinite(minY)) minY = 0;
  // 추락선: 최저 도로 OR goal 둘 중 더 아래에서 6 더 아래. (goal이 도로보다 한참 낮은
  // '드롭다운 점프'에서 추락선이 goal 위로 와 골인 직전 'fell'로 죽는 것 방지)
  const failY = vehicle.failY != null ? vehicle.failY
    : Math.min(minY, vehicle.goal ? vehicle.goal.y : minY) - 6;

  const goal = vehicle.goal;
  // 그림자 금지 구역(고정 데드존, 축정렬 사각형). 그 안의 접촉=도로는 무시(=도로 없음).
  // 금지구역을 콜라이더에서 실제로 잘라낸다 → 구역 경계에 '벽'이 생겨 차가 막힌다(단순 스킵이면 블록 안에 박혀 튕김).
  const zones = vehicle.noShadowZones || [];
  const cols = clipToZones(colliders, zones);
  // 상태
  let x = vehicle.startX, y = vehicle.startY, ang = 0;
  let vx = 0, vy = 0, w = 0;
  const traj = [];

  function rot(lx, ly) { const c = Math.cos(ang), s = Math.sin(ang); return [c * lx - s * ly, s * lx + c * ly]; }
  function wheelWorld(i) { const [rx, ry] = rot(wheelsLocal[i][0], wheelsLocal[i][1]); return [x + rx, y + ry]; }
  function inGoal() {
    const pts = [[x, y], ...obbCorners(x, y, ang, hw, hh), wheelWorld(0), wheelWorld(1)];
    for (const [px, py] of pts) {
      if (Math.abs(px - goal.x) <= goal.hw && Math.abs(py - goal.y) <= goal.hh) return true;
    }
    return false;
  }

  for (let step = 0; step < maxSteps; step++) {
    traj.push({ x, y, angle: ang, wheels: [wheelWorld(0), wheelWorld(1)] });
    if (inGoal()) return { result: 'CLEAR', reason: 'reached goal', trajectory: traj };
    if (y < failY) return { result: 'FAIL', reason: 'fell', trajectory: traj };

    // 속도비례 서브스텝
    const speed = Math.hypot(vx, vy);
    const nSub = Math.max(2, Math.min(MAX_SUB, Math.ceil((speed * DT) / (wheelR * 0.3))));
    const sdt = DT / nSub;

    for (let sub = 0; sub < nSub; sub++) {
      let fx = 0, fy = -g * MASS, tq = 0; // 힘/토크 누적(중력 포함)

      // ── 바퀴: 서스펜션 지지 + 구동 + 그립 ──
      for (let i = 0; i < 2; i++) {
        const [wxp, wyp] = wheelWorld(i);
        let best = null;
        for (const poly of cols) {
          const c = circleVsConvex(wxp, wyp, wheelR, poly);
          if (c && (!best || c.depth > best.depth)) best = c;
        }
        if (!best) continue;
        const { nx, ny, depth, px, py } = best;
        // 바퀴 접촉점 속도 = v + w×r
        const rxw = px - x, ryw = py - y;
        const pvx = vx - w * ryw, pvy = vy + w * rxw;
        const vn = pvx * nx + pvy * ny;
        const fn = Math.max(0, SUSP_K * depth - SUSP_C * vn); // 지지력(밀기만)
        // 적용: 법선 지지
        fx += fn * nx; fy += fn * ny; tq += rxw * (fn * ny) - ryw * (fn * nx);
        // 구동: 전방 접선
        let tx = ny, ty = -nx;                    // 법선의 perp
        if (tx < 0) { tx = -tx; ty = -ty; }       // 전방(+x)으로
        const fwd = vx * tx + vy * ty;
        let drive = fwd < TARGET_SPEED ? DRIVE : 0;
        const tractionMax = GRIP * fn;
        if (drive > tractionMax) drive = tractionMax;
        // 구동력은 차체 중심에 적용(토크 0) → 후방 윌리/백플립 방지(아케이드 관례).
        fx += drive * tx; fy += drive * ty;
      }

      // 적분(semi-implicit)
      vx += (fx / MASS) * sdt; vy += (fy / MASS) * sdt; w += (tq / I) * sdt;
      vx *= (1 - LIN_DAMP * sdt); vy *= (1 - LIN_DAMP * sdt); w *= (1 - ANG_DAMP * sdt);
      x += vx * sdt; y += vy * sdt; ang += w * sdt;

      // ── 차체 OBB vs 폴리곤: 위치보정 + 임펄스(벽/천장/전복) ──
      const corners = obbCorners(x, y, ang, hw, hh);
      for (const poly of cols) {
        const hit = convexVsConvex(corners, poly);
        if (!hit) continue;
        const { nx, ny, depth } = hit;
        // 가장 깊이 박힌 코너(접촉점).
        let deep = corners[0], md = Infinity;
        for (const c of corners) { const d = (c[0] - x) * nx + (c[1] - y) * ny; if (d < md) { md = d; deep = c; } }
        const corr = Math.min(depth * WALL_BAUMGARTE, MAX_CORR); // 깊은 관통도 한 스텝에 과하게 안 빼냄(튕김 방지)
        x += nx * corr; y += ny * corr;
        const rxc = deep[0] - x, ryc = deep[1] - y;
        const pvx = vx - w * ryc, pvy = vy + w * rxc;
        const vn = pvx * nx + pvy * ny;
        if (vn < 0) {
          const rn = rxc * ny - ryc * nx;
          const denom = 1 / MASS + (rn * rn) / I;
          const jn = -vn / denom;
          vx += (jn * nx) / MASS; vy += (jn * ny) / MASS; w += (rxc * (jn * ny) - ryc * (jn * nx)) / I;
        }
      }
    }
  }
  return { result: 'FAIL', reason: 'stalled', trajectory: traj };
}
