// src/main.js
import { Renderer } from './render/Renderer.js';
import { InteractionController } from './ui/InteractionController.js';
import { GameStateMachine } from './core/GameStateMachine.js';
import { loadLevel, loadManifest, validateLevel } from './io/LevelLoader.js';
import { LevelEditor } from './ui/LevelEditor.js';
import { loadDraft, listDrafts, mergeLevelIds } from './io/LevelStore.js';
import { tutorialFor } from './ui/tutorials.js';

let LEVELS = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7'];
let MANIFEST = LEVELS.slice();

const ui = {
  go: document.getElementById('go'),
  reset: document.getElementById('reset'),
  edit: document.getElementById('edit'),
  hideObj: document.getElementById('hideObj'),
  stageTimer: document.getElementById('stageTimer'),
  export: document.getElementById('exportBtn'),
  level: document.getElementById('levelLabel'),
  hint: document.getElementById('hint'),
  banner: document.getElementById('banner'),
  phase: document.getElementById('phase'),
  tutorial: document.getElementById('tutorial'),
  tutStep: document.getElementById('tutStep'),
  tutBody: document.getElementById('tutBody'),
  tutNext: document.getElementById('tutNext'),
  tutSkip: document.getElementById('tutSkip'),
};

// ── 튜토리얼 가이드(레벨별 단계 안내) ──
let tutSteps = null, tutIdx = 0, tutId = null;
const tutShown = new Set(); // 세션 내 이미 본 레벨(재방문 시 반복 표시 안 함)

function initTutorial(id) {
  tutHide();
  const steps = tutorialFor(id);
  if (!steps || tutShown.has(id) || mode !== 'play') return;
  tutSteps = steps; tutIdx = 0; tutId = id;
  renderTut();
}
function renderTut() {
  if (!ui.tutorial) return;
  ui.tutStep.textContent = `안내 ${tutIdx + 1} / ${tutSteps.length}`;
  ui.tutBody.innerHTML = tutSteps[tutIdx];
  ui.tutNext.textContent = (tutIdx === tutSteps.length - 1) ? '시작! ✓' : '다음 ▶';
  ui.tutorial.style.display = 'block';
}
function tutAdvance() {
  if (!tutSteps) return;
  tutIdx += 1;
  if (tutIdx >= tutSteps.length) { tutShown.add(tutId); tutHide(); }
  else renderTut();
}
function tutHide() { if (ui.tutorial) ui.tutorial.style.display = 'none'; tutSteps = null; }

function setPhase(text, color) {
  if (!ui.phase) return;
  ui.phase.textContent = text;
  ui.phase.style.color = color || '#9fd8ff';
}

let renderer, sm, interaction, editor;
let levelIdx = 0;
let currentLevelObj = null;   // 현재 idx로 로드된 레벨 원본(에디터 시드용)
let mode = 'play';            // 'play' | 'edit'
let testing = false;          // edit 모드에서 Test 시뮬레이션 진행 중
let anim = null;
let bodiesHidden = false;     // 본체 숨김 토글(그림자=도로만 미리보기). play 모드 전용.

// ── 스테이지 30초 타이머(play 모드 전용) ─────────────────────────────────
// PLAN 진입(레벨 로드/리셋) 시 30s 시작 → PLAN·GO 통틀어 실시간 감소.
// CLEAR면 정지, 0이면 '시간 초과' FAIL. 에디터 모드 비활성. (UI 레이어라 performance.now 사용)
const STAGE_SECONDS = 30;
let stageActive = false, stageDeadline = 0;
function startStageTimer() {
  stageActive = true;
  stageDeadline = performance.now() + STAGE_SECONDS * 1000;
  if (ui.stageTimer) ui.stageTimer.style.display = 'block';
}
function stopStageTimer() {
  stageActive = false;
  if (ui.stageTimer) ui.stageTimer.style.display = 'none';
}
function updateStageTimer() {
  if (!stageActive || mode !== 'play') return;
  const rem = (stageDeadline - performance.now()) / 1000;
  if (ui.stageTimer) {
    ui.stageTimer.textContent = `⏱ ${Math.max(0, rem).toFixed(1)}`;
    ui.stageTimer.classList.toggle('danger', rem < 5);
  }
  if (rem <= 0) onStageTimeout();
}
function onStageTimeout() {
  stopStageTimer();
  cancelAnim();
  clearCountdown();
  if (sm) sm.phase = 'FAIL';
  renderer.setOccluderBodiesVisible(true);
  setPhase('시간 초과 ✗', '#f55');
  showBanner('시간 초과 ✗', false);
}

// 본체 숨김 상태 적용 + 버튼 라벨/활성 갱신. (그림자는 유지, 본체만 opacity 0)
function setBodiesHidden(v) {
  bodiesHidden = v;
  renderer.setOccluderBodiesVisible(!v);
  if (ui.hideObj) {
    ui.hideObj.textContent = v ? '👁 물체 표시' : '👁 물체 숨김';
    ui.hideObj.classList.toggle('active', v);
  }
}
function toggleHideBodies() {
  if (mode !== 'play') return;  // 에디터에선 물체를 봐야 하므로 비활성
  setBodiesHidden(!bodiesHidden);
}

// draft 우선, 없으면 파일에서 레벨 로드.
async function loadById(id) {
  const d = loadDraft(id);
  if (d) {
    const v = validateLevel(d);
    if (!v.ok) throw new Error(`invalid draft ${id}: ${v.errors.join('; ')}`);
    return d;
  }
  return loadLevel(`./levels/${id}.json`);
}

function refreshLevels() {
  LEVELS = mergeLevelIds(MANIFEST, listDrafts());
}

async function startLevel(idx) {
  cancelAnim();
  const lv = await loadById(LEVELS[idx]);
  currentLevelObj = lv;
  sm = new GameStateMachine(lv);
  sm._occluders = patchOccluderMeta(sm);
  if (interaction) interaction.resetTurn();
  renderer.fitToWall({ wall: lv.wall, start: lv.start, goal: lv.goal });
  renderer.resetOrbitTarget();
  renderer.setLight(lv.light);
  const gHW = lv.params && lv.params.goalHW != null ? lv.params.goalHW : 0.6;
  const gHH = lv.params && lv.params.goalHH != null ? lv.params.goalHH : 0.8;
  renderer.renderPads(lv.start, lv.goal, gHW, gHH);
  const draftMark = loadDraft(LEVELS[idx]) ? ' *' : '';
  ui.level.textContent = `Level ${LEVELS[idx]}${draftMark}`;
  ui.banner.style.display = 'none';
  setPhase('PLAN', '#ffd9a0');
  setBodiesHidden(false);     // 새 레벨은 항상 본체 보이게 시작
  syncScene();
  startStageTimer();          // 스테이지 30초 시작
  initTutorial(LEVELS[idx]);
}

function patchOccluderMeta(sm) {
  const orig = sm._occluders.bind(sm);
  return () => {
    const occs = orig();
    const fixedCount = sm.level.fixedOccluders.length;
    occs.forEach((o, oi) => {
      const movable = oi >= fixedCount;
      o.movable = movable;
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
  renderer.setCar(sm.level.start[0], sm.level.start[1]);
  // renderOccluders가 메시를 새로 만들며 본체를 다시 보이게 하므로, 숨김 토글이 켜져 있으면 재적용.
  if (bodiesHidden) renderer.setOccluderBodiesVisible(false);
}

// ── Edit 모드 ───────────────────────────────────────────────────────────
function enterEdit() {
  mode = 'edit';
  testing = false;
  cancelAnim();
  clearCountdown();
  tutHide();
  stopStageTimer();           // 에디터 모드에선 타이머 비활성
  setBodiesHidden(false);     // 편집은 물체를 봐야 하므로 숨김 해제
  if (!editor) {
    editor = new LevelEditor(renderer, {
      manifestIds: MANIFEST,
      onTest: (level) => startTest(level),
      onLevelsChanged: refreshLevels,
    });
  }
  editor.opts.manifestIds = MANIFEST;
  editor.enter(currentLevelObj);
  if (interaction) interaction.resetTurn();
  ui.go.textContent = 'Test';
  ui.edit.textContent = 'Exit';
  if (ui.export) ui.export.style.display = '';
  setPhase('EDIT', '#9fd8ff');
}

function exitEdit() {
  mode = 'play';
  testing = false;
  editor.exit();
  ui.go.textContent = 'Go';
  ui.edit.textContent = 'Edit';
  if (ui.export) ui.export.style.display = 'none';
  refreshLevels();
  startLevel(levelIdx);
}

function toggleEdit() {
  if (mode === 'play') enterEdit();
  else exitEdit();
}

// edit 모드 Test: items에서 만든 레벨로 새 SM을 돌린다(진짜 fixed/movable 분리).
function startTest(level) {
  const v = validateLevel(level);
  if (!v.ok) { showBanner('INVALID', false); return; }
  testing = true;
  cancelAnim();
  clearCountdown();
  tutHide();
  sm = new GameStateMachine(level);
  sm._occluders = patchOccluderMeta(sm);
  renderer.fitToWall({ wall: level.wall, start: level.start, goal: level.goal });
  renderer.setLight(level.light);
  const gHW = level.params && level.params.goalHW != null ? level.params.goalHW : 0.6;
  const gHH = level.params && level.params.goalHH != null ? level.params.goalHH : 0.8;
  renderer.renderPads(level.start, level.goal, gHW, gHH);
  setPhase('TEST', '#ffd27d');
  syncScene();
  onGo();
}

// ── 버튼/키 디스패치 ────────────────────────────────────────────────────
function onGoButton() {
  if (mode === 'edit') { if (!testing) editor.requestTest(); }
  else onGo();
}

function onResetButton() {
  if (mode === 'edit') {
    if (testing) { testing = false; setPhase('EDIT', '#9fd8ff'); editor.reenter(); }
    return;
  }
  onReset();
}

function onGo() {
  if (sm.phase !== 'PLAN') return;
  if (!testing) setPhase('GO', '#ffd27d');
  const res = sm.go();
  startCountdown(3, () => {
    renderer.setOccluderBodiesVisible(false);
    animateCar(res, () => {
      const ok = res.result === 'CLEAR';
      if (ok) stopStageTimer();    // 성공 시 타이머 정지
      setPhase(ok ? 'CLEAR ✓' : 'FAIL ✗', ok ? '#5f5' : '#f55');
      showBanner(ok ? 'CLEAR ✓' : 'FAIL ✗', ok);
      // edit 모드 Test에서는 다음 레벨로 넘어가지 않는다(Reset으로 편집 복귀).
      if (ok && !testing) {
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
  clearCountdown();
  if (sm.phase !== 'PLAN') sm.reset();
  ui.banner.style.display = 'none';
  setPhase('PLAN', '#ffd9a0');
  syncScene();
  startStageTimer();          // 리셋 = 시도당 30초 재시작
}

function animateCar(res, done) {
  const traj = res.trajectory;
  let i = 0;
  cancelAnim();
  const step = () => {
    if (i >= traj.length) { done(); return; }
    const p = traj[i];
    renderer.setCar(p.x, p.y, p.angle);   // 차체 중심 + 회전(전복 포함)
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
  updateStageTimer();
  renderer.render();
  requestAnimationFrame(loop);
}

async function main() {
  renderer = new Renderer(document.body);
  MANIFEST = await loadManifest();
  refreshLevels();

  interaction = new InteractionController(
    renderer,
    () => {
      if (mode === 'edit' && !testing) return 'PLAN';
      return sm ? sm.phase : 'GO';
    },
    (index, t) => {
      if (mode === 'edit' && !testing) return editor.applyTransform(index, t);
      sm.setMovableTransform(index, t);
      const hf = sm.recompute();
      renderer.renderHeightfield(hf);
      renderer.setCar(sm.level.start[0], sm.level.start[1]);
      const m = sm.movables[index];
      return { pos: m.pos.slice(), rot: Array.isArray(m.rot) ? m.rot.slice() : m.rot };
    },
    (index) => { if (mode === 'edit' && !testing) editor.select(index); }
  );

  ui.go.addEventListener('click', onGoButton);
  ui.reset.addEventListener('click', onResetButton);
  if (ui.edit) ui.edit.addEventListener('click', toggleEdit);
  if (ui.hideObj) ui.hideObj.addEventListener('click', toggleHideBodies);
  if (ui.export) ui.export.addEventListener('click', () => { if (editor) editor._export(); });
  if (ui.tutNext) ui.tutNext.addEventListener('click', tutAdvance);
  if (ui.tutSkip) ui.tutSkip.addEventListener('click', () => { if (tutId) tutShown.add(tutId); tutHide(); });

  window.addEventListener('keydown', (e) => {
    if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return; // 폼 입력 중 단축키 무시
    if (e.key === ' ') onGoButton();
    if (e.key === 'r') onResetButton();
    if (e.key === 'e') toggleEdit();
    if (e.key === 'h') toggleHideBodies();
    if (mode === 'play') {
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= LEVELS.length) { levelIdx = n - 1; startLevel(levelIdx); }
    }
  });

  startLevel(levelIdx).then(loop);
}

main();
