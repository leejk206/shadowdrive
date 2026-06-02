// test/helpers/solvable.js
// 레벨이 fall-and-drive 메커닉으로 풀 수 있는지(=CLEAR 배치가 존재하는지) 검증하는 헬퍼.
//
// iter-4 배경: 천장 장애물 + 등반 경사 한계(maxClimbDeg)가 도입되면서, 기존 균일-격자 솔버가
// 찾던 풀이 상당수가 사실은 "수직 그림자 벽을 따라 목표까지 등반"하는 치트였음이 드러났다
// (예: L2의 z를 광원 쪽으로 밀면 도로가 y≈-20까지 내려가고, 차가 목표 패드 벽을 수직 등반해
//  CLEAR 됐다). 등반 한계로 그 치트가 막히면서, 정상(≤maxClimbDeg 램프) 풀이는 배치 공간의
// 좁은 영역에만 존재 → 균일 격자의 정렬로는 신뢰성 있게 못 찾는다.
//
// 그래서 시드 고정 per-piece 독립 볼륨 샘플링으로 검증한다. 각 가동 오클루더를 (x,y,z,rot)
// 볼륨에서 독립적으로 무작위 배치(시드 고정 → 결정론적)하고, CLEAR 배치가 하나라도 나오면
// 풀 수 있는 레벨로 판정한다. 첫 CLEAR에서 즉시 반환하므로 풀리는 레벨은 수십 회 안에 끝난다.
import { GameStateMachine } from '../../src/core/GameStateMachine.js';

/**
 * @param {object} level  레벨 JSON 객체
 * @param {{seed?:number, iters?:number}} [opts]
 * @returns {boolean} CLEAR 배치가 발견되면 true
 */
export function searchSolvable(level, { seed = 1234567, iters = 8000 } = {}) {
  const sm = new GameStateMachine(level);
  const W = level.wall.width;
  const Hh = level.wall.height;
  const n = sm.movables.length;
  const isPoint = level.light.type === 'point';
  const zMax = isPoint ? level.light.vec[2] - 0.3 : 9;

  // 결정론적 LCG (Math.random 미사용 → 재현 가능한 테스트).
  let s = seed >>> 0;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };

  for (let it = 0; it < iters; it++) {
    sm.reset();
    for (let k = 0; k < n; k++) {
      const isCeil = sm.movables[k].role === 'ceiling';
      sm.setMovableTransform(k, {
        pos: [
          rnd() * W,
          0.2 + rnd() * (Hh - 0.5),
          isPoint ? 1 + rnd() * (zMax - 1) : 2 + rnd() * 7,
        ],
        rot: isCeil ? 0 : Math.floor(rnd() * 36) * 10,
      });
    }
    if (sm.go().result === 'CLEAR') return true;
  }
  return false;
}
