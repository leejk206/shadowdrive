// src/main.js
import { Renderer } from './render/Renderer.js';
import { InteractionController } from './ui/InteractionController.js';
import { GameStateMachine } from './core/GameStateMachine.js';
import { loadLevel } from './io/LevelLoader.js';

const LEVELS = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7'];

const ui = {
  go: document.getElementById('go'),
  reset: document.getElementById('reset'),
  level: document.getElementById('levelLabel'),
  hint: document.getElementById('hint'),
  banner: document.getElementById('banner'),
  phase: document.getElementById('phase'),
};

function setPhase(text, color) {
  if (!ui.phase) return;
  ui.phase.textContent = text;
  ui.phase.style.color = color || '#9fd8ff';
}

let renderer, sm, interaction;
let levelIdx = 0;
let anim = null; // GO 애니메이션 상태

async function startLevel(idx) {
  cancelAnim();
  const lv = await loadLevel(`./levels/${LEVELS[idx]}.json`);
  sm = new GameStateMachine(lv);
  // 가동 메시에 index/movable 표시 (인터랙션 picking용)
  sm._occluders = patchOccluderMeta(sm);
  if (interaction) interaction.resetTurn();
  renderer.fitToWall({ wall: lv.wall, start: lv.start, goal: lv.goal });
  renderer.resetOrbitTarget();
  renderer.setLight(lv.light);
  const gHW = lv.params && lv.params.goalHW != null ? lv.params.goalHW : 0.6;
  const gHH = lv.params && lv.params.goalHH != null ? lv.params.goalHH : 0.8;
  renderer.renderPads(lv.start, lv.goal, gHW, gHH);
  ui.level.textContent = `Level ${LEVELS[idx]}`;
  ui.banner.style.display = 'none';
  setPhase('PLAN', '#ffd9a0');
  syncScene();
}

// 가동 오클루더 part에 index/movable 플래그를 달아주는 래퍼
function patchOccluderMeta(sm) {
  const orig = sm._occluders.bind(sm);
  return () => {
    const occs = orig();
    const fixedCount = sm.level.fixedOccluders.length;
    occs.forEach((o, oi) => {
      const movable = oi >= fixedCount;
      o.movable = movable;                       // occluder 단위 메타(렌더러가 단일 강체 메시에 사용)
      o.index = movable ? oi - fixedCount : -1;
      o.parts.forEach((p) => { p.movable = movable; p.index = o.index; });
    });
    return occs;
  };
}

function syncScene() {
  const occs = sm._occluders();
  renderer.renderOccluders(occs);
  const hf = sm.recompute();
  renderer.renderHeightfield(hf);
  const [sx] = sm.level.start;
  const si = Math.round((sx - hf.xs[0]) / hf.dx);
  const sy = (hf.floor[si] != null) ? hf.floor[si] : sm.level.start[1];
  renderer.setCar(sx, sy);
}

function onGo() {
  if (sm.phase !== 'PLAN') return;
  setPhase('GO', '#ffd27d');
  const res = sm.go();                         // 그림자/도로 freeze + 궤적 계산
  // 3·2·1 카운트다운 → 물체 본체만 사라지고(그림자/도로 유지) → 차 출발.
  startCountdown(3, () => {
    renderer.setOccluderBodiesVisible(false);  // 본체 invisible, 캐스트 섀도는 남음
    animateCar(res, () => {
      const ok = res.result === 'CLEAR';
      setPhase(ok ? 'CLEAR ✓' : 'FAIL ✗', ok ? '#5f5' : '#f55');
      showBanner(ok ? 'CLEAR ✓' : 'FAIL ✗', ok);
      if (ok) {
        setTimeout(() => { levelIdx = Math.min(levelIdx + 1, LEVELS.length - 1); startLevel(levelIdx); }, 1500);
      }
    });
  });
}

let countdownTimers = [];
function clearCountdown() { countdownTimers.forEach(clearTimeout); countdownTimers = []; }
function startCountdown(seconds, done) {
  clearCountdown();
  let n = seconds;
  const tick = () => {
    if (n > 0) {
      showBanner(String(n), true);
      ui.banner.style.color = '#ffd27d';
      setPhase(`출발 ${n}…`, '#ffd27d');
      n -= 1;
      countdownTimers.push(setTimeout(tick, 1000));
    } else {
      showBanner('GO!', true);
      ui.banner.style.color = '#5f5';
      countdownTimers.push(setTimeout(() => { ui.banner.style.display = 'none'; done(); }, 500));
    }
  };
  tick();
}

function onReset() {
  cancelAnim();
  clearCountdown();                 // 카운트다운 중이면 중단
  if (sm.phase !== 'PLAN') sm.reset();
  ui.banner.style.display = 'none';
  setPhase('PLAN', '#ffd9a0');
  syncScene();                      // 오클루더 메시 재생성 → 본체 다시 보임
}

function animateCar(res, done) {
  const traj = res.trajectory;
  let i = 0;
  cancelAnim();
  const step = () => {
    if (i >= traj.length) { done(); return; }
    const [x, y] = traj[i];
    // 다음 샘플과의 차분으로 slope 추정. 마지막 샘플은 직전 slope 유지.
    let slope = 0;
    const j = Math.min(i + 2, traj.length - 1);
    if (j > i) {
      const dx = traj[j][0] - x;
      const dy = traj[j][1] - y;
      if (Math.abs(dx) > 1e-6) slope = Math.atan2(dy, dx);
    }
    renderer.setCar(x, y, slope);
    renderer.render();
    i += 2;
    anim = requestAnimationFrame(step);
  };
  step();
}

function cancelAnim() { if (anim) cancelAnimationFrame(anim); anim = null; }

function showBanner(text, ok) {
  ui.banner.textContent = text;
  ui.banner.style.color = ok ? '#5f5' : '#f55';
  ui.banner.style.display = 'block';
}

function loop() {
  renderer.controls.update();
  renderer.render();
  requestAnimationFrame(loop);
}

function main() {
  renderer = new Renderer(document.body);
  // 상태머신은 startLevel에서 생성되므로 인터랙션은 게터로 접근
  interaction = new InteractionController(
    renderer,
    () => (sm ? sm.phase : 'GO'),
    (index, t) => {
      sm.setMovableTransform(index, t);
      const hf = sm.recompute();
      renderer.renderHeightfield(hf);
      // 시작점 도로 위에 차 미리보기.
      const [sx] = sm.level.start;
      const si = Math.round((sx - hf.xs[0]) / hf.dx);
      const sy = (hf.floor[si] != null) ? hf.floor[si] : sm.level.start[1];
      renderer.setCar(sx, sy);
      const m = sm.movables[index];
      return { pos: m.pos.slice(), rot: Array.isArray(m.rot) ? m.rot.slice() : m.rot };
    }
  );
  ui.go.addEventListener('click', onGo);
  ui.reset.addEventListener('click', onReset);
  window.addEventListener('keydown', (e) => {
    if (e.key === ' ') onGo();
    if (e.key === 'r') onReset();
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= LEVELS.length) { levelIdx = n - 1; startLevel(levelIdx); }
  });
  startLevel(levelIdx).then(loop);
}

main();
