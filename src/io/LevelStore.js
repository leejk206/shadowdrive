// src/io/LevelStore.js
// 레벨 에디터 영속화. 순수 변환/직렬화 함수(node:test 가능)와 얇은 브라우저 헬퍼(localStorage/다운로드)를 분리.
//
// 에디터 내부 표현(items)과 레벨 JSON(fixedOccluders/movableOccluders) 사이를 왕복 변환한다.
//   item = { fixed:boolean, shape, role, size:[x,y,z], pos:[x,y,z], rot, allow:{translate,rotate} }
// 레벨 JSON에서 fixed는 pos, movable은 spawn에 위치가 들어간다 → item.pos로 통일.

const DEFAULT_PARAMS = { carSpeed: 4, gravity: 9.8, maxClimbDeg: 35, gapPassRatio: 0.8 };

// ── 순수 변환 ──────────────────────────────────────────────────────────────

/** 레벨 JSON → { globals, items }. 에디터가 편집하는 평면 표현. */
export function itemsFromLevel(level) {
  const globals = {
    id: level.id,
    light: { type: level.light.type, vec: level.light.vec.slice() },
    wall: { width: level.wall.width, height: level.wall.height },
    start: level.start.slice(),
    goal: level.goal.slice(),
    params: { ...level.params },
  };
  const mk = (o, fixed) => ({
    fixed,
    shape: o.shape,
    role: o.role || 'floor',
    size: o.size.slice(),
    pos: (fixed ? o.pos : o.spawn).slice(),
    rot: o.rot != null ? (Array.isArray(o.rot) ? o.rot.slice() : o.rot) : 0,
    allow: {
      translate: o.allow ? o.allow.translate !== false : true,
      rotate: o.allow ? o.allow.rotate !== false : true,
    },
  });
  const items = [
    ...(level.fixedOccluders || []).map((o) => mk(o, true)),
    ...(level.movableOccluders || []).map((o) => mk(o, false)),
  ];
  return { globals, items };
}

/** { globals, items } → 레벨 JSON. 키 순서/포함 규칙을 손으로 쓴 레벨과 맞춘다. */
export function levelFromItems(globals, items) {
  const rotOut = (rot) => {
    if (Array.isArray(rot)) return rot.slice();
    return rot; // number
  };
  const isZeroRot = (rot) => rot === 0 || rot == null;

  const fixed = [];
  const movable = [];
  for (const it of items) {
    if (it.fixed) {
      const o = { shape: it.shape, role: it.role || 'floor', size: it.size.slice(), pos: it.pos.slice() };
      if (!isZeroRot(it.rot)) o.rot = rotOut(it.rot);
      fixed.push(o);
    } else {
      const o = { shape: it.shape, role: it.role || 'floor', size: it.size.slice(), spawn: it.pos.slice() };
      if (!isZeroRot(it.rot)) o.rot = rotOut(it.rot);
      o.allow = {
        translate: it.allow ? it.allow.translate !== false : true,
        rotate: it.allow ? it.allow.rotate !== false : true,
      };
      movable.push(o);
    }
  }
  return {
    id: globals.id,
    light: { type: globals.light.type, vec: globals.light.vec.slice() },
    wall: { width: globals.wall.width, height: globals.wall.height },
    start: globals.start.slice(),
    goal: globals.goal.slice(),
    fixedOccluders: fixed,
    movableOccluders: movable,
    params: { ...globals.params },
  };
}

/** 빈 레벨 한 장 생성(New). */
export function blankLevel(id) {
  return {
    id,
    light: { type: 'point', vec: [8, 9, 12] },
    wall: { width: 16, height: 8 },
    start: [1, 3],
    goal: [15, 0],
    fixedOccluders: [],
    movableOccluders: [],
    params: { ...DEFAULT_PARAMS },
  };
}

/** 팔레트에서 새 오클루더 item 1개 생성. spawn은 벽 중앙 상단, movable·floor 기본. */
export function newItem(shape, globals) {
  const w = globals.wall.width, h = globals.wall.height;
  const size = shape === 'bar' ? [5, 0.4, 1]
    : shape === 'prism' ? [3, 2, 1]
    : shape === 'L' || shape === 'T' || shape === 'notch' ? [5, 3, 1]
    : shape === 'crescent' ? [6, 2.5, 1]   // 대칭 오목 호(스쿱)
    : shape === 'dome' ? [4, 2.2, 1]       // 둥근 봉우리(볼록)
    : shape === 'rramp' ? [5, 3, 1]        // 비대칭 오목 쿼터파이프
    : [3, 1, 1];
  return {
    fixed: false,
    shape,
    role: 'floor',
    size,
    pos: [w / 2, h * 0.7, Math.min(6, (globals.light.vec[2] || 12) - 2)],
    rot: 0,
    allow: { translate: true, rotate: true },
  };
}

/** 레벨 JSON → 2-space pretty 문자열. 배열은 펼쳐지지만 유효·diff 가능. */
export function serializeLevel(level) {
  return JSON.stringify(level, null, 2) + '\n';
}

/** id 목록 → index.json 매니페스트 문자열. */
export function buildManifest(ids) {
  return JSON.stringify(ids, null, 2) + '\n';
}

/** 매니페스트 id ∪ draft id, 순서 유지·중복 제거. */
export function mergeLevelIds(manifestIds, draftIds) {
  const out = [];
  const seen = new Set();
  for (const id of [...(manifestIds || []), ...(draftIds || [])]) {
    if (!seen.has(id)) { seen.add(id); out.push(id); }
  }
  return out;
}

// ── 브라우저 헬퍼(단위테스트 제외) ────────────────────────────────────────

const DRAFT_PREFIX = 'shadowdrive:draft:';
const DRAFT_INDEX = 'shadowdrive:drafts';

function ls() {
  return (typeof localStorage !== 'undefined') ? localStorage : null;
}

/** draft id 목록 반환. */
export function listDrafts() {
  const s = ls();
  if (!s) return [];
  try { return JSON.parse(s.getItem(DRAFT_INDEX) || '[]'); } catch { return []; }
}

/** draft 레벨 저장(자동저장). */
export function saveDraft(id, level) {
  const s = ls();
  if (!s) return;
  s.setItem(DRAFT_PREFIX + id, serializeLevel(level));
  const ids = listDrafts();
  if (!ids.includes(id)) { ids.push(id); s.setItem(DRAFT_INDEX, JSON.stringify(ids)); }
}

/** draft 레벨 로드(없으면 null). */
export function loadDraft(id) {
  const s = ls();
  if (!s) return null;
  const raw = s.getItem(DRAFT_PREFIX + id);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

/** draft 삭제. */
export function deleteDraft(id) {
  const s = ls();
  if (!s) return;
  s.removeItem(DRAFT_PREFIX + id);
  const ids = listDrafts().filter((x) => x !== id);
  s.setItem(DRAFT_INDEX, JSON.stringify(ids));
}

/** 텍스트를 파일로 다운로드. */
export function downloadText(filename, text) {
  if (typeof document === 'undefined') return;
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 클립보드 복사(가능하면). 실패는 조용히 무시. */
export function copyToClipboard(text) {
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    return navigator.clipboard.writeText(text).catch(() => {});
  }
  return Promise.resolve();
}
