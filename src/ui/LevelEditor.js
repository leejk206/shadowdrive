// src/ui/LevelEditor.js
// Edit 모드 컨트롤러. 편집용 레벨을 items/globals 평면 표현으로 들고,
//  - 3D 직접조작: 모든 오클루더를 movable로 만든 GameStateMachine(editSM)로 드래그/회전 → items에 write-back
//  - 사이드 폼: wall/light/start/goal/params + 선택 오클루더(shape/role/size/pos/rot/allow/fixed) 편집
//  - localStorage 자동저장, Export(레벨 JSON + index.json 다운로드 + 클립보드)
// Test/Reset 시뮬레이션은 main이 소유(onTest 콜백). 에디터는 데이터·렌더·패널만 책임진다.
import { GameStateMachine } from '../core/GameStateMachine.js';
import { validateLevel, loadLevel } from '../io/LevelLoader.js';
import {
  itemsFromLevel, levelFromItems, blankLevel, newItem,
  serializeLevel, buildManifest, mergeLevelIds,
  saveDraft, loadDraft, deleteDraft, listDrafts, downloadText, copyToClipboard,
} from '../io/LevelStore.js';

const SHAPES = ['bar', 'prism', 'L', 'T', 'notch', 'crescent', 'dome', 'rramp'];
const HILITE_EMISSIVE = 0x1f6feb;

export class LevelEditor {
  constructor(renderer, opts = {}) {
    this.renderer = renderer;
    this.opts = opts;                  // { manifestIds, onTest(level), onLevelsChanged() }
    this.panel = document.getElementById('editorPanel');
    this.active = false;
    this.globals = null;
    this.items = [];
    this.selected = -1;
    this.editSM = null;
  }

  // edit 중엔 항상 PLAN(조작 허용). test는 main이 별도 SM으로 돌리므로 여기 안 옴.
  phase() { return 'PLAN'; }

  enter(level) {
    const { globals, items } = itemsFromLevel(level);
    this.globals = globals;
    this.items = items;
    this.selected = -1;
    this.active = true;
    if (this.panel) this.panel.style.display = 'block';
    this.renderer.fitToWall(this._frame());
    this.renderer.resetOrbitTarget();
    this._rebuildAll(true);
  }

  exit() {
    this.active = false;
    if (this.panel) this.panel.style.display = 'none';
  }

  // test에서 edit로 복귀(렌더 재구성).
  reenter() {
    if (this.panel) this.panel.style.display = 'block';
    this.renderer.fitToWall(this._frame());
    this._rebuildAll(false);
  }

  getLevelObject() { return levelFromItems(this.globals, this.items); }

  requestTest() {
    if (this.opts.onTest) this.opts.onTest(this.getLevelObject());
  }

  // ── 드래그(고빈도): 메시 재생성 없이 heightfield만 갱신 + items write-back ──
  applyTransform(index, t) {
    this.editSM.setMovableTransform(index, t);
    this.renderer.renderHeightfield(this.editSM.recompute());
    const m = this.editSM.movables[index];
    this.items[index].pos = m.pos.slice();
    this.items[index].rot = Array.isArray(m.rot) ? m.rot.slice() : m.rot;
    if (index === this.selected) this._syncSelectedFields();
    this._autosave();
    return { pos: m.pos.slice(), rot: Array.isArray(m.rot) ? m.rot.slice() : m.rot };
  }

  select(index) {
    this.selected = index;
    this._highlightSelected();
    this._renderPanel();
    this.renderer.render();
  }

  // ── 모델 → editSM/렌더 전체 재구성(구조 변경/폼 변경 시) ──
  _frame() {
    return { wall: this.globals.wall, start: this.globals.start, goal: this.globals.goal };
  }

  _buildEditSM() {
    const g = this.globals;
    const lvl = {
      id: g.id,
      light: { type: g.light.type, vec: g.light.vec.slice() },
      wall: { width: g.wall.width, height: g.wall.height },
      start: g.start.slice(),
      goal: g.goal.slice(),
      fixedOccluders: [],
      // edit 중엔 fixed 구분 없이 전부 조작 가능하게 movable + allow 전허용으로.
      movableOccluders: this.items.map((it) => ({
        shape: it.shape, role: it.role, size: it.size.slice(),
        spawn: it.pos.slice(),
        rot: Array.isArray(it.rot) ? it.rot.slice() : it.rot,
        allow: { translate: true, rotate: true },
      })),
      params: { ...g.params },
    };
    return new GameStateMachine(lvl);
  }

  _rebuildAll(fit) {
    this.editSM = this._buildEditSM();
    const occs = this.editSM._occluders();
    occs.forEach((o, i) => {
      o.movable = true; o.index = i;
      o.parts.forEach((p) => { p.movable = true; p.index = i; });
    });
    if (fit) this.renderer.fitToWall(this._frame());
    this.renderer.setLight(this.globals.light);
    this.renderer.renderOccluders(occs);
    this.renderer.renderHeightfield(this.editSM.recompute());
    const gHW = this.globals.params.goalHW != null ? this.globals.params.goalHW : 0.6;
    const gHH = this.globals.params.goalHH != null ? this.globals.params.goalHH : 0.8;
    this.renderer.renderPads(this.globals.start, this.globals.goal, gHW, gHH);
    this.renderer.setCar(this.globals.start[0], this.globals.start[1]);
    this._highlightSelected();
    this._renderPanel();
    this._autosave();
    this.renderer.render();
  }

  _highlightSelected() {
    const group = this.renderer.occluderGroup;
    group.children.forEach((mesh) => {
      if (!mesh.isMesh) return;
      const idx = mesh.userData.part ? mesh.userData.part.index : -1;
      const hex = (idx === this.selected) ? HILITE_EMISSIVE : mesh.userData.baseEmissive;
      mesh.material.emissive.setHex(hex);
    });
  }

  _autosave() {
    if (!this.active || this._suppressSave) return;
    saveDraft(this.globals.id, this.getLevelObject());
    if (this.opts.onLevelsChanged) this.opts.onLevelsChanged();
  }

  // ── 폼 패널 ────────────────────────────────────────────────────────────
  _renderPanel() {
    if (!this.panel) return;
    const g = this.globals;
    const num = (path, val, step) =>
      `<input class="ed-in" data-scope="g" data-path="${path}" type="number" step="${step || 'any'}" value="${val}">`;
    const row = (label, inner) => `<div class="ed-row"><span class="ed-lab">${label}</span>${inner}</div>`;

    let html = '';
    html += `<div class="ed-sec">레벨</div>`;
    html += row('id', `<input class="ed-in" data-scope="g" data-path="id" type="text" value="${g.id}">`);
    html += row('wall', num('wall.width', g.wall.width) + num('wall.height', g.wall.height));
    html += row('light',
      `<select class="ed-in" data-scope="g" data-path="light.type">
         <option value="point"${g.light.type === 'point' ? ' selected' : ''}>point</option>
         <option value="directional"${g.light.type === 'directional' ? ' selected' : ''}>directional</option>
       </select>`);
    html += row('light.vec', num('light.vec.0', g.light.vec[0]) + num('light.vec.1', g.light.vec[1]) + num('light.vec.2', g.light.vec[2]));
    html += row('start', num('start.0', g.start[0]) + num('start.1', g.start[1]));
    html += row('goal', num('goal.0', g.goal[0]) + num('goal.1', g.goal[1]));

    html += `<div class="ed-sec">params</div>`;
    const p = g.params;
    html += row('speed/grav', num('params.carSpeed', p.carSpeed) + num('params.gravity', p.gravity));
    html += row('climb/gap', num('params.maxClimbDeg', p.maxClimbDeg) + num('params.gapPassRatio', p.gapPassRatio));
    html += row('goalHW/HH', num('params.goalHW', p.goalHW != null ? p.goalHW : 0.6) + num('params.goalHH', p.goalHH != null ? p.goalHH : 0.8));

    // 팔레트
    html += `<div class="ed-sec">오클루더 추가</div><div class="ed-row">`;
    html += SHAPES.map((s) => `<button class="ed-btn ed-add" data-shape="${s}">+${s}</button>`).join('');
    html += `</div>`;

    // 목록
    html += `<div class="ed-sec">오클루더 (${this.items.length})</div>`;
    this.items.forEach((it, i) => {
      const sel = i === this.selected ? ' ed-sel' : '';
      const tag = it.fixed ? '🔒fixed' : 'movable';
      html += `<div class="ed-item${sel}">
        <button class="ed-pick" data-i="${i}">${i}: ${it.shape}·${it.role} <span class="ed-tag">${tag}</span></button>
        <button class="ed-del" data-i="${i}">✕</button></div>`;
    });

    // 선택 오클루더 상세
    if (this.selected >= 0 && this.items[this.selected]) {
      const it = this.items[this.selected];
      const inum = (path, val) =>
        `<input class="ed-in" data-scope="it" data-path="${path}" type="number" step="any" value="${val}">`;
      const rotSummary = Array.isArray(it.rot) ? `3D(${it.rot.length === 4 ? 'quat' : 'euler'})` : `${it.rot}°`;
      html += `<div class="ed-sec">선택 #${this.selected}</div>`;
      html += row('shape',
        `<select class="ed-in" data-scope="it" data-path="shape">` +
        SHAPES.map((s) => `<option value="${s}"${it.shape === s ? ' selected' : ''}>${s}</option>`).join('') +
        `</select>`);
      html += row('role',
        `<select class="ed-in" data-scope="it" data-path="role">
           <option value="floor"${it.role === 'floor' ? ' selected' : ''}>floor</option>
           <option value="ceiling"${it.role === 'ceiling' ? ' selected' : ''}>ceiling</option>
         </select>`);
      html += row('size', inum('size.0', it.size[0]) + inum('size.1', it.size[1]) + inum('size.2', it.size[2]));
      html += row('pos', inum('pos.0', it.pos[0]) + inum('pos.1', it.pos[1]) + inum('pos.2', it.pos[2]));
      html += row('rot', `<span class="ed-rotsum">${rotSummary}</span>` +
        `<input class="ed-in ed-rotz" data-scope="it" data-path="rot" type="number" step="any" placeholder="set z°">` +
        `<button class="ed-btn ed-rotreset">reset</button>`);
      html += `<div class="ed-row">
        <label class="ed-chk"><input type="checkbox" class="ed-cb" data-scope="it" data-path="fixed"${it.fixed ? ' checked' : ''}> fixed</label>
        <label class="ed-chk"><input type="checkbox" class="ed-cb" data-scope="it" data-path="allow.translate"${it.allow.translate ? ' checked' : ''}> translate</label>
        <label class="ed-chk"><input type="checkbox" class="ed-cb" data-scope="it" data-path="allow.rotate"${it.allow.rotate ? ' checked' : ''}> rotate</label>
      </div>`;
    }

    // 액션 + 상태
    const hasDraft = !!loadDraft(g.id);
    const inManifest = (this.opts.manifestIds || []).includes(g.id);
    html += `<div class="ed-sec">파일</div><div class="ed-row">
      <button class="ed-btn ed-new">New</button>
      <button class="ed-btn ed-export">Export</button>
      <button class="ed-btn ed-revert"${hasDraft && inManifest ? '' : ' disabled'} title="이 레벨의 로컬 드래프트를 삭제하고 파일 내용으로 되돌립니다">↩ 파일로 되돌리기</button></div>`;
    html += `<div class="ed-draftnote">${hasDraft
      ? `✎ 로컬 드래프트 저장본이 파일을 가리고 있습니다${inManifest ? '' : ' (파일 없음 — 되돌릴 원본이 없음)'}`
      : '저장본 없음 — 파일 내용 그대로'}</div>`;
    html += `<div class="ed-status" id="edStatus"></div>`;

    this.panel.innerHTML = html;
    this._wire();
    this._validateAndStatus();
  }

  _wire() {
    const $ = (sel) => this.panel.querySelectorAll(sel);
    $('.ed-in').forEach((el) => el.addEventListener('change', (e) => this._onField(e)));
    $('.ed-cb').forEach((el) => el.addEventListener('change', (e) => this._onField(e)));
    $('.ed-add').forEach((el) => el.addEventListener('click', () => this._addItem(el.dataset.shape)));
    $('.ed-pick').forEach((el) => el.addEventListener('click', () => this.select(parseInt(el.dataset.i, 10))));
    $('.ed-del').forEach((el) => el.addEventListener('click', () => this._deleteItem(parseInt(el.dataset.i, 10))));
    const rotReset = this.panel.querySelector('.ed-rotreset');
    if (rotReset) rotReset.addEventListener('click', () => { this.items[this.selected].rot = 0; this._rebuildAll(false); });
    const nb = this.panel.querySelector('.ed-new');
    if (nb) nb.addEventListener('click', () => this._newLevel());
    const ex = this.panel.querySelector('.ed-export');
    if (ex) ex.addEventListener('click', () => this._export());
    const rv = this.panel.querySelector('.ed-revert');
    if (rv && !rv.disabled) rv.addEventListener('click', () => this._revert());
  }

  _onField(e) {
    const el = e.target;
    const scope = el.dataset.scope;
    const path = el.dataset.path;
    let value;
    if (el.type === 'checkbox') value = el.checked;
    else if (el.type === 'number') value = parseFloat(el.value);
    else value = el.value;
    if (el.type === 'number' && Number.isNaN(value)) return;

    // 프레이밍에 영향 주는 변경이면 카메라 재맞춤.
    const framing = path.startsWith('wall.') || path.startsWith('start.') || path.startsWith('goal.');

    if (scope === 'g') {
      setByPath(this.globals, path, value);
    } else {
      const it = this.items[this.selected];
      if (!it) return;
      if (path === 'rot') it.rot = value;           // 스칼라 z로 덮어씀
      else setByPath(it, path, value);
    }
    this._rebuildAll(framing);
  }

  _addItem(shape) {
    this.items.push(newItem(shape, this.globals));
    this.selected = this.items.length - 1;
    this._rebuildAll(false);
  }

  _deleteItem(i) {
    this.items.splice(i, 1);
    if (this.selected === i) this.selected = -1;
    else if (this.selected > i) this.selected -= 1;
    this._rebuildAll(false);
  }

  _newLevel() {
    const id = this._nextLevelId();
    this.enter(blankLevel(id));
  }

  // 로컬 드래프트를 삭제하고 levels/<id>.json 파일 내용으로 되돌린다.
  // enter()가 _autosave로 드래프트를 재생성하지 않도록 _suppressSave로 가드한다.
  async _revert() {
    const id = this.globals.id;
    if (!(this.opts.manifestIds || []).includes(id)) return; // 파일 없는 draft-only 레벨은 대상 아님
    let lv;
    try {
      lv = await loadLevel(`./levels/${id}.json`);
    } catch (e) {
      const st = this.panel && this.panel.querySelector('#edStatus');
      if (st) { st.textContent = `✗ 파일 로드 실패: ${e.message}`; st.className = 'ed-status err'; }
      return;
    }
    deleteDraft(id);
    this._suppressSave = true;
    this.enter(lv);          // 파일 내용으로 에디터 재시드 (autosave 억제됨 → 드래프트 미생성)
    this._suppressSave = false;
    if (this.opts.onLevelsChanged) this.opts.onLevelsChanged();
    const st = this.panel && this.panel.querySelector('#edStatus');
    if (st) { st.textContent = `↩ 드래프트 삭제 — ${id}.json 파일 내용으로 되돌림`; st.className = 'ed-status ok'; }
  }

  _nextLevelId() {
    const ids = mergeLevelIds(this.opts.manifestIds || [], listDrafts());
    let n = 1;
    while (ids.includes('L' + n)) n += 1;
    return 'L' + n;
  }

  _syncSelectedFields() {
    if (this.selected < 0) return;
    const it = this.items[this.selected];
    const set = (path, val) => {
      const el = this.panel.querySelector(`.ed-in[data-scope="it"][data-path="${path}"]`);
      if (el && el.type === 'number') el.value = val;
    };
    set('pos.0', it.pos[0]); set('pos.1', it.pos[1]); set('pos.2', it.pos[2]);
    const sum = this.panel.querySelector('.ed-rotsum');
    if (sum) sum.textContent = Array.isArray(it.rot) ? `3D(${it.rot.length === 4 ? 'quat' : 'euler'})` : `${it.rot}°`;
  }

  _validateAndStatus() {
    const status = this.panel && this.panel.querySelector('#edStatus');
    if (!status) return null;
    const v = validateLevel(this.getLevelObject());
    if (v.ok) { status.textContent = '✓ valid'; status.className = 'ed-status ok'; }
    else { status.textContent = '✗ ' + v.errors.join('; '); status.className = 'ed-status err'; }
    return v;
  }

  _export() {
    const level = this.getLevelObject();
    const v = validateLevel(level);
    if (!v.ok) { this._validateAndStatus(); return; }
    const id = level.id;
    const ids = mergeLevelIds(this.opts.manifestIds || [], [id]);
    downloadText(`${id}.json`, serializeLevel(level));
    downloadText('index.json', buildManifest(ids));
    copyToClipboard(serializeLevel(level));
    const status = this.panel && this.panel.querySelector('#edStatus');
    if (status) { status.textContent = `↓ ${id}.json + index.json 다운로드 · 클립보드 복사됨`; status.className = 'ed-status ok'; }
  }
}

/** "wall.width" / "light.vec.0" 같은 경로에 값 설정. 숫자 키는 배열 인덱스. */
function setByPath(obj, path, value) {
  const keys = path.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    cur = cur[/^\d+$/.test(k) ? Number(k) : k];
  }
  const last = keys[keys.length - 1];
  cur[/^\d+$/.test(last) ? Number(last) : last] = value;
}
