// src/core/GameStateMachine.js
import { projectScene } from './ShadowProjector.js';
import { buildHeightfield } from './ColliderBuilder.js';
import { simulate } from './CarSimulator.js';
import { expandCompound, transformVerts } from './shapes.js';

const SAMPLES = 200;

export class GameStateMachine {
  constructor(level) {
    this.level = level;
    this.phase = 'PLAN';
    this.frozen = null;
    // 가동 오클루더의 현재 변환 상태
    this.movables = level.movableOccluders.map((m) => ({
      shape: m.shape, role: m.role || 'floor', size: m.size,
      pos: m.spawn.slice(), rot: m.rot || 0, allow: m.allow || { translate: true, rotate: true },
    }));
  }

  /** 현재 씬의 오클루더 리스트(고정+가동)를 projector 입력 형태로 */
  _occluders() {
    const buildOcc = (src) => {
      // src = { shape, role, size, pos, rot }
      // rot은 number(z deg) | [rx,ry,rz](오일러 deg) | [x,y,z,w](쿼터니언) — transformVerts가 셋 다 처리.
      // compound part는 occluder 중심 기준 강체 회전: posRel을 occluder rot으로 회전(transformVerts로
      // 원점 회전), part 로컬 정점도 같은 rot을 part.pos에 적용 → 두 단계가 정확히 합성된다.
      const parts0 = expandCompound(src.shape, src.size);
      const rot = (typeof src.rot === 'number' || Array.isArray(src.rot)) ? src.rot : 0;
      const parts = parts0.map((p) => {
        const [rx, ry, rz] = transformVerts([p.posRel], [0, 0, 0], rot)[0];
        return {
          shape: p.shape,
          size: p.size,
          pos: [src.pos[0] + rx, src.pos[1] + ry, src.pos[2] + rz],
          rot,
        };
      });
      return { parts, role: src.role || 'floor' };
    };

    const fixed = this.level.fixedOccluders.map((f) =>
      buildOcc({ shape: f.shape, role: f.role, size: f.size, pos: f.pos, rot: f.rot || 0 })
    );
    const mov = this.movables.map((m) =>
      buildOcc({ shape: m.shape, role: m.role, size: m.size, pos: m.pos, rot: m.rot })
    );
    return fixed.concat(mov);
  }

  _pads() {
    const [sx, sy] = this.level.start;
    const [gx, gy] = this.level.goal;
    const w = 0.8; // 패드 폭
    return [
      { x0: sx - w / 2, x1: sx + w / 2, y: sy },
      { x0: gx - w / 2, x1: gx + w / 2, y: gy },
    ];
  }

  /** PLAN 미리보기용 heightfield 계산 */
  recompute() {
    const polys = projectScene(this._occluders(), this.level.light);
    return buildHeightfield({
      polygons: polys, pads: this._pads(),
      xMin: 0, xMax: this.level.wall.width, samples: SAMPLES,
    });
  }

  /** 가동 오클루더 i의 변환 갱신 (PLAN 단계에서만) */
  setMovableTransform(i, { pos, rot }) {
    if (this.phase !== 'PLAN') return;
    if (pos && this.movables[i].allow.translate) {
      // spec §4.3: 이동은 광원-벽 사이 볼륨으로 클램프
      const clamped = pos.slice();
      const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
      clamped[0] = clamp(clamped[0], 0, this.level.wall.width);
      const zMax = this.level.light.type === 'point' ? this.level.light.vec[2] - 0.1 : Infinity;
      clamped[2] = clamp(clamped[2], 0.1, zMax);
      // spec Part1: 점광원은 광원에 너무 가까우면 그림자가 과확대 → 최소 3D 거리 강제.
      if (this.level.light.type === 'point') {
        const minLightDist = (this.level.params && this.level.params.minLightDist != null)
          ? this.level.params.minLightDist : 4.0;
        const L = this.level.light.vec;
        let dx = clamped[0] - L[0], dy = clamped[1] - L[1], dz = clamped[2] - L[2];
        let d = Math.hypot(dx, dy, dz);
        if (d < minLightDist) {
          if (d < 1e-9) { dx = 0; dy = 0; dz = -1; d = 1; } // 광원과 동일점이면 벽쪽으로 밀어냄
          const s = minLightDist / d;
          clamped[0] = L[0] + dx * s;
          clamped[1] = L[1] + dy * s;
          clamped[2] = L[2] + dz * s;
          // 벽 쪽(z>0) 유지 + x를 [0,width]로 재클램프
          clamped[2] = Math.max(0.1, Math.min(zMax, clamped[2]));
          clamped[0] = clamp(clamped[0], 0, this.level.wall.width);
        }
      }
      this.movables[i].pos = clamped;
    }
    const rotIsArray = Array.isArray(rot) && (rot.length === 3 || rot.length === 4);
    if ((typeof rot === 'number' || rotIsArray) && this.movables[i].allow.rotate) {
      this.movables[i].rot = rotIsArray ? rot.slice() : rot;
    }
  }

  /** GO: heightfield freeze 후 시뮬레이션 → CLEAR/FAIL 전이 */
  go() {
    if (this.phase !== 'PLAN') return null;
    this.phase = 'GO';
    this.frozen = this.recompute();
    const [sx, sy] = this.level.start;
    const [gx, gy] = this.level.goal;
    const p = this.level.params || {};
    const goalHW = p.goalHW != null ? p.goalHW : 0.6;
    const goalHH = p.goalHH != null ? p.goalHH : 0.8;
    const res = simulate(this.frozen, this.level.params, {
      length: 1, height: 0.5, startX: sx, goalX: gx, goalY: gy, goalHW, goalHH,
    });
    this.phase = res.result; // 'CLEAR' | 'FAIL'
    this.lastResult = res;
    return res;
  }

  /** PLAN 복귀 (배치 유지) */
  reset() {
    this.phase = 'PLAN';
    this.frozen = null;
    this.lastResult = null;
  }
}
