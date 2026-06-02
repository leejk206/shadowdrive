# ShadowDrive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 빛/그림자로 도로를 설계해 자동차를 목표까지 보내는 2.5D 퍼즐(ShadowDrive)을, Three.js 렌더 + 직접 구현한 그림자-콜라이더-물리 코어로 7레벨까지 완성한다.

**Architecture:** 렌더 무관 순수 코어(`core/`)가 `오클루더+광원 → convex 그림자 폴리곤 → floor/ceiling 1D heightfield(envelope) → 차 물리 판정`을 담당하고, Three.js `Renderer`는 상태를 그리기만 한다. 레벨은 JSON 데이터. 코어는 `node:test`로 헤드리스 단위테스트.

**Tech Stack:** Three.js 0.159 (importmap + 로컬 vendor, 번들러 없음), ES 모듈, `node --test`(node v24 내장), 정적 서버(`python3 -m http.server`).

---

## 공유 인터페이스 (전 태스크 공통 — 명명·타입 고정)

이 타입들은 모든 태스크에서 동일하게 사용한다. 변경 금지.

```js
// 좌표계: 벽(투영면)은 z=0 평면. 광원·오클루더는 z>0(벽 앞)에 위치.
//   화면 = 벽의 (x,y). x=가로(좌→우 주행), y=세로(높이), z=깊이(광원 방향).
//   회전 rot(deg)은 z축(깊이축) 기준 — 화면 평면 안에서의 회전(램프 생성).

// Light: directional이면 vec=광선 방향, point면 vec=광원 위치
//   { type: 'directional'|'point', vec: [x, y, z] }

// ShadowPolygon: 벽 평면에 맺힌 convex 그림자
//   { polygon: [[x,y], ...](CCW), role: 'floor'|'ceiling' }

// Heightfield: ColliderBuilder 출력
//   { xs: number[], dx: number, floor: (number|null)[], ceiling: number[] }
//     floor[i]=주행면 y 또는 null(void), ceiling[i]=머리 위 한계 y 또는 Infinity

// SimResult: CarSimulator 출력
//   { result: 'CLEAR'|'FAIL', reason: string, trajectory: [[x,y], ...] }

// Occluder(레벨 해석 후):
//   { parts: [{ shape, size, pos, rot }], role: 'floor'|'ceiling', movable: bool, allow:{translate,rotate} }
//   단일 프리미티브는 parts.length===1, L-블록/노치는 compound(parts.length>1).
//   shape ∈ {'bar','prism'}; size/pos = [x,y,z]; rot = deg(z축).
```

---

## Task 0: 프로젝트 스켈레톤

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `index.html`
- Create: `vendor/three.module.js` (다운로드)
- Create: `src/main.js` (임시 스텁)
- Create: `test/smoke.test.js`

- [ ] **Step 1: package.json 작성 (ES 모듈 + 테스트 스크립트)**

```json
{
  "name": "shadowdrive",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "scripts": {
    "test": "node --test",
    "serve": "python3 -m http.server 8080"
  }
}
```

- [ ] **Step 2: .gitignore 작성**

```
.DS_Store
node_modules/
*.log
```

- [ ] **Step 3: Three.js 로컬 vendor 다운로드**

Run:
```bash
curl -L -o vendor/three.module.js https://unpkg.com/three@0.159.0/build/three.module.js
```
Expected: `vendor/three.module.js` 생성, 파일 크기 > 500KB. 확인:
```bash
head -1 vendor/three.module.js
```
Expected: three.js 라이선스 주석 또는 코드 시작.

- [ ] **Step 4: index.html 작성 (importmap은 로컬 vendor를 가리킴)**

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>ShadowDrive</title>
  <style>
    html, body { margin: 0; height: 100%; overflow: hidden; background: #0a0a0a; }
    #ui { position: fixed; left: 0; top: 0; padding: 10px; color: #eee;
          font: 14px/1.4 system-ui, sans-serif; z-index: 10; }
    #ui button { font-size: 14px; padding: 4px 10px; margin-right: 6px; }
    #banner { position: fixed; left: 50%; top: 40%; transform: translateX(-50%);
              color: #fff; font: 700 48px system-ui; display: none; z-index: 20; }
  </style>
  <script type="importmap">
  { "imports": { "three": "./vendor/three.module.js" } }
  </script>
</head>
<body>
  <div id="ui">
    <button id="go">Go</button>
    <button id="reset">Reset</button>
    <span id="levelLabel"></span>
    <span id="hint"></span>
  </div>
  <div id="banner"></div>
  <script type="module" src="./src/main.js"></script>
</body>
</html>
```

- [ ] **Step 5: src/main.js 임시 스텁**

```js
// 임시 스텁 — Task 10에서 실제 부트스트랩으로 교체
console.log('ShadowDrive boot');
```

- [ ] **Step 6: test/smoke.test.js 작성**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('test harness works', () => {
  assert.equal(1 + 1, 2);
});
```

- [ ] **Step 7: 테스트 실행 확인**

Run: `npm test`
Expected: `pass 1  fail 0`.

- [ ] **Step 8: Commit**

```bash
git add package.json .gitignore index.html vendor/three.module.js src/main.js test/smoke.test.js
git commit -m "chore: scaffold ShadowDrive (no-bundler ES modules + vendored three + node:test)"
```

---

## Task 1: mathx — 투영 / convex hull / 수직 span

**Files:**
- Create: `src/core/mathx.js`
- Test: `test/mathx.test.js`

- [ ] **Step 1: 실패하는 테스트 작성**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectVertex, convexHull2D, polygonVerticalSpan } from '../src/core/mathx.js';

const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('directional projection: 평행광은 z만큼 평행이동(전단)', () => {
  // 방향 (0,0,-1): 벽(z=0)에 수직 투영 → x,y 그대로
  assert.deepEqual(projectVertex([2, 3, 5], { type: 'directional', vec: [0, 0, -1] }), [2, 3]);
  // 방향 (1,0,-1): z=5에서 x가 +5 이동 (t = -pz/dz = -5/-1 = 5; x = 2 + 5*1 = 7)
  const p = projectVertex([2, 3, 5], { type: 'directional', vec: [1, 0, -1] });
  assert.ok(close(p[0], 7) && close(p[1], 3));
});

test('point projection: 광원에 가까울수록(큰 z) 확대', () => {
  // 광원 (0,0,10), 점 (1,0,5): t = lz/(lz-pz) = 10/5 = 2 → x = 0 + 2*(1-0) = 2
  const p = projectVertex([1, 0, 5], { type: 'point', vec: [0, 0, 10] });
  assert.ok(close(p[0], 2) && close(p[1], 0));
  // 더 광원 쪽(z=8): t = 10/2 = 5 → x = 5 (그림자 더 큼)
  const q = projectVertex([1, 0, 8], { type: 'point', vec: [0, 0, 10] });
  assert.ok(close(q[0], 5));
});

test('convexHull2D: 사각형 + 내부점 → 4개 모서리만', () => {
  const pts = [[0,0],[2,0],[2,2],[0,2],[1,1]];
  const hull = convexHull2D(pts);
  assert.equal(hull.length, 4);
});

test('polygonVerticalSpan: 사각형의 x=1 수직선 교차 = [0,2]', () => {
  const sq = [[0,0],[2,0],[2,2],[0,2]];
  const span = polygonVerticalSpan(sq, 1);
  assert.ok(close(span[0], 0) && close(span[1], 2));
});

test('polygonVerticalSpan: x가 폴리곤 밖이면 null', () => {
  const sq = [[0,0],[2,0],[2,2],[0,2]];
  assert.equal(polygonVerticalSpan(sq, 5), null);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/mathx.test.js`
Expected: FAIL — `Cannot find module ... mathx.js`.

- [ ] **Step 3: 구현**

```js
// src/core/mathx.js
// 벽(투영면)은 z=0 평면. 정점을 광원 기준으로 벽에 투영한다.

/**
 * @param {[number,number,number]} P  3D 정점
 * @param {{type:string, vec:[number,number,number]}} light
 * @returns {[number,number]} 벽 평면(z=0) 위 좌표
 */
export function projectVertex(P, light) {
  const [px, py, pz] = P;
  if (light.type === 'directional') {
    const [dx, dy, dz] = light.vec;
    // P + t*dir, (P+t*dir).z = 0  →  t = -pz/dz
    const t = -pz / dz;
    return [px + t * dx, py + t * dy];
  } else {
    // point: L + t*(P-L), z=0  →  t = lz/(lz-pz)
    const [lx, ly, lz] = light.vec;
    const t = lz / (lz - pz);
    return [lx + t * (px - lx), ly + t * (py - ly)];
  }
}

/**
 * Andrew's monotone chain. 입력 점들의 2D convex hull (CCW, 중복 꼭짓점 없음).
 * @param {Array<[number,number]>} points
 * @returns {Array<[number,number]>}
 */
export function convexHull2D(points) {
  const pts = points
    .map((p) => [p[0], p[1]])
    .sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
  if (pts.length <= 2) return pts.slice();
  const cross = (o, a, b) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
      lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
      upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/**
 * 수직선 x=xv 가 convex 폴리곤과 만나는 y 구간 [yLow, yHigh]. 안 만나면 null.
 * @param {Array<[number,number]>} poly  (CCW 또는 CW 무관)
 * @param {number} xv
 * @returns {[number,number]|null}
 */
export function polygonVerticalSpan(poly, xv) {
  const ys = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % n];
    if (x1 === x2) {
      // 수직 에지: xv와 일치하면 양 끝 y 포함
      if (Math.abs(x1 - xv) < 1e-12) { ys.push(y1, y2); }
      continue;
    }
    const tlo = Math.min(x1, x2), thi = Math.max(x1, x2);
    if (xv < tlo - 1e-12 || xv > thi + 1e-12) continue;
    const t = (xv - x1) / (x2 - x1);
    ys.push(y1 + t * (y2 - y1));
  }
  if (ys.length === 0) return null;
  return [Math.min(...ys), Math.max(...ys)];
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test test/mathx.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/mathx.js test/mathx.test.js
git commit -m "feat(core): mathx — vertex projection, convex hull, vertical span"
```

---

## Task 2: shapes — 오클루더 정점 생성 + 변환

**Files:**
- Create: `src/core/shapes.js`
- Test: `test/shapes.test.js`

- [ ] **Step 1: 실패하는 테스트 작성**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { primitiveVerts, transformVerts } from '../src/core/shapes.js';

const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('bar는 8정점(직육면체)', () => {
  const v = primitiveVerts('bar', [2, 1, 1]); // size=full extents
  assert.equal(v.length, 8);
  // x는 ±1, y는 ±0.5, z는 ±0.5 범위
  for (const [x, y, z] of v) {
    assert.ok(close(Math.abs(x), 1) && close(Math.abs(y), 0.5) && close(Math.abs(z), 0.5));
  }
});

test('prism은 6정점(삼각 프리즘)', () => {
  const v = primitiveVerts('prism', [2, 2, 1]);
  assert.equal(v.length, 6);
});

test('transformVerts: z축 90° 회전은 (x,y)→(-y,x)', () => {
  const out = transformVerts([[1, 0, 0]], [0, 0, 0], 90);
  assert.ok(close(out[0][0], 0) && close(out[0][1], 1) && close(out[0][2], 0));
});

test('transformVerts: 평행이동', () => {
  const out = transformVerts([[1, 1, 1]], [5, 2, 3], 0);
  assert.deepEqual(out[0], [6, 3, 4]);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/shapes.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: 구현**

```js
// src/core/shapes.js
// 오클루더 로컬 정점 생성 + 월드 변환(z축 회전 후 평행이동).

/**
 * size = full extents [sx, sy, sz]. 로컬 원점 중심.
 * @param {'bar'|'prism'} shape
 * @param {[number,number,number]} size
 * @returns {Array<[number,number,number]>}
 */
export function primitiveVerts(shape, size) {
  const [sx, sy, sz] = size;
  const hx = sx / 2, hy = sy / 2, hz = sz / 2;
  if (shape === 'bar') {
    const v = [];
    for (const x of [-hx, hx])
      for (const y of [-hy, hy])
        for (const z of [-hz, hz]) v.push([x, y, z]);
    return v;
  }
  if (shape === 'prism') {
    // 단면이 삼각형(밑변 sx, 높이 sy), z로 sz만큼 압출. 6정점.
    const tri = [[-hx, -hy], [hx, -hy], [0, hy]];
    const v = [];
    for (const [x, y] of tri)
      for (const z of [-hz, hz]) v.push([x, y, z]);
    return v;
  }
  throw new Error(`unknown shape: ${shape}`);
}

/**
 * z축 기준 rotDeg 회전 후 pos 평행이동.
 * @param {Array<[number,number,number]>} verts
 * @param {[number,number,number]} pos
 * @param {number} rotDeg
 * @returns {Array<[number,number,number]>}
 */
export function transformVerts(verts, pos, rotDeg) {
  const r = (rotDeg * Math.PI) / 180;
  const c = Math.cos(r), s = Math.sin(r);
  const [tx, ty, tz] = pos;
  return verts.map(([x, y, z]) => [
    c * x - s * y + tx,
    s * x + c * y + ty,
    z + tz,
  ]);
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test test/shapes.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/shapes.js test/shapes.test.js
git commit -m "feat(core): shapes — bar/prism verts + z-rotate/translate transform"
```

---

## Task 3: ShadowProjector — 오클루더+광원 → convex 그림자 폴리곤

**Files:**
- Create: `src/core/ShadowProjector.js`
- Test: `test/shadowProjector.test.js`

- [ ] **Step 1: 실패하는 테스트 작성**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectOccluder, projectScene } from '../src/core/ShadowProjector.js';

const close = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test('방향광 아래 bar의 그림자는 동일 크기 사각형', () => {
  // 방향 (0,0,-1): 수직 투영 → 그림자 = 정면 실루엣(가로 sx, 세로 sy)
  const occ = { parts: [{ shape: 'bar', size: [2, 1, 1], pos: [0, 0, 3], rot: 0 }], role: 'floor' };
  const polys = projectOccluder(occ, { type: 'directional', vec: [0, 0, -1] });
  assert.equal(polys.length, 1);
  const xs = polys[0].polygon.map((p) => p[0]);
  assert.ok(close(Math.min(...xs), -1) && close(Math.max(...xs), 1));
  assert.equal(polys[0].role, 'floor');
});

test('점광원 아래 bar는 확대된 그림자', () => {
  const occ = { parts: [{ shape: 'bar', size: [2, 1, 1], pos: [0, 0, 5], rot: 0 }], role: 'floor' };
  const polys = projectOccluder(occ, { type: 'point', vec: [0, 0, 10] });
  const xs = polys[0].polygon.map((p) => p[0]);
  // bar 앞면 z=5.5, 뒷면 z=4.5; 가장 큰 확대는 z=5.5: t=10/4.5≈2.22 → x≈±2.22
  assert.ok(Math.max(...xs) > 2 && Math.max(...xs) < 2.5);
});

test('projectScene: 다중 오클루더 → 폴리곤 평탄 배열, role 보존', () => {
  const occs = [
    { parts: [{ shape: 'bar', size: [2,1,1], pos: [0,0,3], rot: 0 }], role: 'floor' },
    { parts: [{ shape: 'bar', size: [1,1,1], pos: [3,0,3], rot: 0 }], role: 'ceiling' },
  ];
  const polys = projectScene(occs, { type: 'directional', vec: [0,0,-1] });
  assert.equal(polys.length, 2);
  assert.equal(polys.filter((p) => p.role === 'ceiling').length, 1);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/shadowProjector.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: 구현**

```js
// src/core/ShadowProjector.js
import { primitiveVerts, transformVerts } from './shapes.js';
import { projectVertex, convexHull2D } from './mathx.js';

/**
 * 오클루더 1개 → 각 part의 convex 그림자 폴리곤 배열.
 * convex 입체의 그림자 = 정점 투영들의 convex hull.
 * @param {object} occ  { parts:[{shape,size,pos,rot}], role }
 * @param {object} light
 * @returns {Array<{polygon:Array<[number,number]>, role:string}>}
 */
export function projectOccluder(occ, light) {
  return occ.parts.map((part) => {
    const local = primitiveVerts(part.shape, part.size);
    const world = transformVerts(local, part.pos, part.rot || 0);
    const proj = world.map((v) => projectVertex(v, light));
    return { polygon: convexHull2D(proj), role: occ.role };
  });
}

/**
 * 씬 전체 오클루더 → 그림자 폴리곤 평탄 배열.
 * @param {Array<object>} occluders
 * @param {object} light
 * @returns {Array<{polygon, role}>}
 */
export function projectScene(occluders, light) {
  const out = [];
  for (const occ of occluders) out.push(...projectOccluder(occ, light));
  return out;
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test test/shadowProjector.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/ShadowProjector.js test/shadowProjector.test.js
git commit -m "feat(core): ShadowProjector — occluders+light to convex shadow polygons"
```

---

## Task 4: ColliderBuilder — 폴리곤+패드 → floor/ceiling heightfield (envelope)

**Files:**
- Create: `src/core/ColliderBuilder.js`
- Test: `test/colliderBuilder.test.js`

- [ ] **Step 1: 실패하는 테스트 작성**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHeightfield } from '../src/core/ColliderBuilder.js';

test('단일 floor 폴리곤 → 해당 구간 top-y, 밖은 void(null)', () => {
  const polys = [{ polygon: [[0,0],[4,0],[4,2],[0,2]], role: 'floor' }];
  const hf = buildHeightfield({ polygons: polys, pads: [], xMin: -2, xMax: 8, samples: 11 });
  // x=0..4 구간은 floor=2, 그 밖은 null
  const at = (x) => hf.floor[hf.xs.findIndex((v) => Math.abs(v - x) < 1e-9)];
  assert.equal(at(2), 2);
  assert.equal(at(-2), null);
  assert.equal(at(6), null);
});

test('겹치는 두 floor 폴리곤 → 더 높은 top의 max (envelope)', () => {
  const polys = [
    { polygon: [[0,0],[4,0],[4,1],[0,1]], role: 'floor' },   // top=1
    { polygon: [[2,0],[6,0],[6,3],[2,3]], role: 'floor' },   // top=3
  ];
  const hf = buildHeightfield({ polygons: polys, pads: [], xMin: 0, xMax: 6, samples: 7 });
  const at = (x) => hf.floor[hf.xs.findIndex((v) => Math.abs(v - x) < 1e-9)];
  assert.equal(at(1), 1); // 첫 폴리곤만
  assert.equal(at(3), 3); // 겹침 → max
  assert.equal(at(5), 3); // 둘째 폴리곤만
});

test('ceiling 폴리곤 → 하단 y의 min, 없으면 Infinity', () => {
  const polys = [{ polygon: [[1,5],[5,5],[5,7],[1,7]], role: 'ceiling' }];
  const hf = buildHeightfield({ polygons: polys, pads: [], xMin: 0, xMax: 6, samples: 7 });
  const at = (x) => hf.ceiling[hf.xs.findIndex((v) => Math.abs(v - x) < 1e-9)];
  assert.equal(at(3), 5);          // ceiling 하단
  assert.equal(at(0), Infinity);   // 천장 없음
});

test('pads는 floor에 항상 반영', () => {
  const hf = buildHeightfield({ polygons: [], pads: [{ x0: 0, x1: 2, y: 1 }], xMin: 0, xMax: 2, samples: 3 });
  assert.equal(hf.floor[0], 1);
  assert.equal(hf.floor[hf.floor.length - 1], 1);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/colliderBuilder.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: 구현**

```js
// src/core/ColliderBuilder.js
import { polygonVerticalSpan } from './mathx.js';

/**
 * 그림자 폴리곤 + 패드 → 1D floor/ceiling heightfield (envelope).
 *   floor[i]  = role:'floor' 폴리곤들의 상단 y의 max (+ 패드), 미커버 시 null
 *   ceiling[i]= role:'ceiling' 폴리곤들의 하단 y의 min, 미커버 시 Infinity
 * @param {{polygons:Array, pads:Array<{x0,x1,y}>, xMin:number, xMax:number, samples:number}} cfg
 * @returns {{xs:number[], dx:number, floor:(number|null)[], ceiling:number[]}}
 */
export function buildHeightfield({ polygons, pads, xMin, xMax, samples }) {
  const xs = [];
  const dx = (xMax - xMin) / (samples - 1);
  for (let i = 0; i < samples; i++) xs.push(xMin + i * dx);

  const floor = new Array(samples).fill(null);
  const ceiling = new Array(samples).fill(Infinity);

  for (let i = 0; i < samples; i++) {
    const x = xs[i];
    // floor: 폴리곤 상단 y의 max
    for (const sp of polygons) {
      if (sp.role !== 'floor') continue;
      const span = polygonVerticalSpan(sp.polygon, x);
      if (span === null) continue;
      const top = span[1];
      if (floor[i] === null || top > floor[i]) floor[i] = top;
    }
    // pads: 항상 floor에 반영
    for (const pad of pads) {
      if (x >= pad.x0 - 1e-9 && x <= pad.x1 + 1e-9) {
        if (floor[i] === null || pad.y > floor[i]) floor[i] = pad.y;
      }
    }
    // ceiling: 하단 y의 min
    for (const sp of polygons) {
      if (sp.role !== 'ceiling') continue;
      const span = polygonVerticalSpan(sp.polygon, x);
      if (span === null) continue;
      if (span[0] < ceiling[i]) ceiling[i] = span[0];
    }
  }
  return { xs, dx, floor, ceiling };
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test test/colliderBuilder.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/ColliderBuilder.js test/colliderBuilder.test.js
git commit -m "feat(core): ColliderBuilder — floor/ceiling 1D envelope heightfield"
```

---

## Task 5: CarSimulator — heightfield → CLEAR/FAIL 판정

**Files:**
- Create: `src/core/CarSimulator.js`
- Test: `test/carSimulator.test.js`

판정 규칙(§4.5): 좌→우 단방향. 평지 등속, 경사는 중력 가감속. 등판 한계각 초과 시 FAIL.
void 폭 < `carLength * gapPassRatio` 면 점프 통과, 이상이면 추락 FAIL. 차 머리(y+carHeight)가 ceiling 초과면 FAIL. 목표 x 도달 시 CLEAR.

- [ ] **Step 1: 실패하는 테스트 작성**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate } from '../src/core/CarSimulator.js';

// 평탄 heightfield 헬퍼
function flatField(y, xMin, xMax, samples, mut) {
  const xs = [], floor = [], ceiling = [];
  const dx = (xMax - xMin) / (samples - 1);
  for (let i = 0; i < samples; i++) {
    const x = xMin + i * dx;
    xs.push(x); floor.push(y); ceiling.push(Infinity);
  }
  if (mut) mut({ xs, dx, floor, ceiling });
  return { xs, dx, floor, ceiling };
}
const params = { carSpeed: 4, gravity: 9.8, maxClimbDeg: 35, gapPassRatio: 0.8 };
const car = { length: 1, height: 0.5, startX: 0, goalX: 9 };

test('연속 평지 → CLEAR', () => {
  const f = flatField(0, 0, 10, 41);
  const r = simulate(f, params, car);
  assert.equal(r.result, 'CLEAR');
});

test('넓은 void(차길이 초과) → 추락 FAIL', () => {
  const f = flatField(0, 0, 10, 41, (g) => {
    for (let i = 0; i < g.xs.length; i++) if (g.xs[i] > 3 && g.xs[i] < 6) g.floor[i] = null;
  });
  const r = simulate(f, params, car);
  assert.equal(r.result, 'FAIL');
  assert.match(r.reason, /fell|void|gap/i);
});

test('좁은 void(차길이*0.8 미만) → 점프 통과 CLEAR', () => {
  const f = flatField(0, 0, 10, 101, (g) => {
    for (let i = 0; i < g.xs.length; i++) if (g.xs[i] > 4.0 && g.xs[i] < 4.5) g.floor[i] = null; // 폭 0.5 < 0.8
  });
  const r = simulate(f, params, car);
  assert.equal(r.result, 'CLEAR');
});

test('등판 한계각 초과 급경사 → FAIL', () => {
  // x=5에서 거의 수직 상승(0→5) → 경사 >> 35°
  const f = flatField(0, 0, 10, 41, (g) => {
    for (let i = 0; i < g.xs.length; i++) if (g.xs[i] >= 5) g.floor[i] = 5;
  });
  const r = simulate(f, params, car);
  assert.equal(r.result, 'FAIL');
  assert.match(r.reason, /climb|steep|slope/i);
});

test('완만한 경사(35° 이내) → CLEAR', () => {
  // 기울기 0.5 (≈26.6°)
  const f = flatField(0, 0, 10, 41, (g) => {
    for (let i = 0; i < g.xs.length; i++) g.floor[i] = Math.max(0, (g.xs[i] - 2) * 0.5);
  });
  const r = simulate(f, params, { ...car, goalX: 9 });
  assert.equal(r.result, 'CLEAR');
});

test('낮은 천장에 머리 충돌 → FAIL', () => {
  const f = flatField(0, 0, 10, 41, (g) => {
    for (let i = 0; i < g.xs.length; i++) if (g.xs[i] > 4 && g.xs[i] < 6) g.ceiling[i] = 0.3; // 차높이 0.5 > 0.3
  });
  const r = simulate(f, params, car);
  assert.equal(r.result, 'FAIL');
  assert.match(r.reason, /ceiling|head/i);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/carSimulator.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: 구현**

```js
// src/core/CarSimulator.js
// 좌→우 단방향 자동차. 고정 dt 적분. heightfield 위 주행 판정.

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

/** x에서 ceiling 값(가장 가까운 샘플의 min 근방) */
function ceilingAt(field, x) {
  const { xs, ceiling } = field;
  const dx = field.dx;
  let i = Math.round((x - xs[0]) / dx);
  i = Math.max(0, Math.min(xs.length - 1, i));
  return ceiling[i];
}

/**
 * @param {object} field  Heightfield
 * @param {object} params { carSpeed, gravity, maxClimbDeg, gapPassRatio }
 * @param {object} car    { length, height, startX, goalX }
 * @returns {{result:'CLEAR'|'FAIL', reason:string, trajectory:Array<[number,number]>}}
 */
export function simulate(field, params, car) {
  const dt = 0.01;
  const maxSlope = Math.tan((params.maxClimbDeg * Math.PI) / 180);
  const probe = 0.05; // 경사 측정용 전방 거리
  const jumpMax = car.length * params.gapPassRatio;

  let x = car.startX;
  let y = floorAt(field, x);
  if (y === null) return fail('start on void', []);
  const traj = [[x, y]];

  function fail(reason) { return { result: 'FAIL', reason, trajectory: traj }; }

  let guard = 0;
  while (x < car.goalX) {
    if (++guard > 200000) return fail('timeout (stalled)');

    const ahead = x + probe;
    const yAhead = floorAt(field, ahead);

    if (yAhead === null) {
      // void 진입 — 다음 floor 재개 지점 탐색
      let gx = ahead;
      let landY = null;
      while (gx < car.goalX + car.length) {
        gx += field.dx;
        const fy = floorAt(field, gx);
        if (fy !== null) { landY = fy; break; }
      }
      const gapWidth = gx - x;
      if (landY === null || gapWidth > jumpMax) return fail(`fell into void/gap (width=${gapWidth.toFixed(2)})`);
      // 점프 통과: 착지점으로 이동
      x = gx; y = landY; traj.push([x, y]);
      continue;
    }

    // 경사(전방 기울기) 검사 — 오르막만 한계
    const slope = (yAhead - y) / probe;
    if (slope > maxSlope + 1e-6) return fail(`slope too steep to climb (slope=${slope.toFixed(2)})`);

    // 머리 위 천장 검사
    const ceil = ceilingAt(field, x);
    if (y + car.height > ceil + 1e-6) return fail('hit ceiling (head)');

    // 전진 (등속 추력 기준 + 경사 보정은 속도에만 영향 — 판정엔 위치만 사용)
    const slopeFactor = 1 / Math.sqrt(1 + slope * slope); // 경사면 따라가며 수평속도 감소
    const vx = Math.max(0.1, params.carSpeed * slopeFactor);
    x += vx * dt;
    y = floorAt(field, x);
    if (y === null) continue; // 다음 루프에서 void 처리
    traj.push([x, y]);
  }

  // 목표 도달 — 천장 최종 확인
  const ceilEnd = ceilingAt(field, car.goalX);
  const yEnd = floorAt(field, car.goalX);
  if (yEnd !== null && yEnd + car.height > ceilEnd + 1e-6) return fail('hit ceiling at goal');
  return { result: 'CLEAR', reason: 'reached goal', trajectory: traj };
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test test/carSimulator.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/CarSimulator.js test/carSimulator.test.js
git commit -m "feat(core): CarSimulator — thrust+gravity stepper with gap/slope/ceiling judging"
```

---

## Task 6: GameStateMachine — PLAN/GO/CLEAR/FAIL 전이 + 코어 조율

**Files:**
- Create: `src/core/GameStateMachine.js`
- Test: `test/gameStateMachine.test.js`

- [ ] **Step 1: 실패하는 테스트 작성**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameStateMachine } from '../src/core/GameStateMachine.js';

// 최소 레벨: 시작-목표 사이 갭, 가동 막대 1개로 메우면 CLEAR
const level = {
  id: 'T', light: { type: 'directional', vec: [0, 0, -1] },
  wall: { width: 10, height: 6 },
  start: [0, 0], goal: [9, 0],
  fixedOccluders: [],
  movableOccluders: [
    { shape: 'bar', role: 'floor', size: [10, 0.4, 1], spawn: [4.5, 0, 3], allow: { translate: true, rotate: true } },
  ],
  params: { carSpeed: 4, gravity: 9.8, maxClimbDeg: 35, gapPassRatio: 0.8 },
};

test('초기 상태는 PLAN', () => {
  const sm = new GameStateMachine(level);
  assert.equal(sm.phase, 'PLAN');
});

test('recompute는 PLAN 단계 heightfield 미리보기를 만든다', () => {
  const sm = new GameStateMachine(level);
  const hf = sm.recompute();
  assert.ok(hf.floor.some((v) => v !== null));
});

test('go(): 막대 그림자가 길을 메우면 CLEAR로 전이', () => {
  const sm = new GameStateMachine(level);
  // 가동 막대를 길 전체에 깔리도록 (방향광 수직투영 → 그림자=막대 위치 그대로, 폭 10 세로 0.4)
  sm.setMovableTransform(0, { pos: [4.5, 0.2, 3], rot: 0 });
  const res = sm.go();
  assert.equal(res.result, 'CLEAR');
  assert.equal(sm.phase, 'CLEAR');
});

test('FAIL 후 reset은 PLAN으로 복귀하고 배치 유지', () => {
  const sm = new GameStateMachine(level);
  sm.setMovableTransform(0, { pos: [4.5, -5, 3], rot: 0 }); // 길 아래로 치워 실패 유도
  const res = sm.go();
  assert.equal(res.result, 'FAIL');
  sm.reset();
  assert.equal(sm.phase, 'PLAN');
  assert.deepEqual(sm.movables[0].pos, [4.5, -5, 3]); // 배치 유지
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/gameStateMachine.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: 구현**

```js
// src/core/GameStateMachine.js
import { projectScene } from './ShadowProjector.js';
import { buildHeightfield } from './ColliderBuilder.js';
import { simulate } from './CarSimulator.js';

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
    const fixed = this.level.fixedOccluders.map((f) => ({
      parts: [{ shape: f.shape, size: f.size, pos: f.pos, rot: f.rot || 0 }],
      role: f.role || 'floor',
    }));
    const mov = this.movables.map((m) => ({
      parts: [{ shape: m.shape, size: m.size, pos: m.pos, rot: m.rot }],
      role: m.role,
    }));
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
    if (pos && this.movables[i].allow.translate) this.movables[i].pos = pos.slice();
    if (typeof rot === 'number' && this.movables[i].allow.rotate) this.movables[i].rot = rot;
  }

  /** GO: heightfield freeze 후 시뮬레이션 → CLEAR/FAIL 전이 */
  go() {
    if (this.phase !== 'PLAN') return null;
    this.phase = 'GO';
    this.frozen = this.recompute();
    const [sx, sy] = this.level.start;
    const [gx] = this.level.goal;
    const res = simulate(this.frozen, this.level.params, {
      length: 1, height: 0.5, startX: sx, goalX: gx,
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
```

- [ ] **Step 4: 통과 확인**

Run: `node --test test/gameStateMachine.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/GameStateMachine.js test/gameStateMachine.test.js
git commit -m "feat(core): GameStateMachine — PLAN/GO/CLEAR/FAIL + core orchestration"
```

---

## Task 7: LevelLoader + 검증 + L1·L2 데이터 (M1 마일스톤)

**Files:**
- Create: `src/io/LevelLoader.js`
- Create: `levels/L1.json`
- Create: `levels/L2.json`
- Test: `test/levelLoader.test.js`
- Test: `test/solve.L1L2.test.js`

- [ ] **Step 1: LevelLoader 실패 테스트 작성**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateLevel } from '../src/io/LevelLoader.js';

const valid = {
  id: 'X', light: { type: 'point', vec: [0, 0, 10] },
  wall: { width: 12, height: 6 }, start: [1, 0], goal: [11, 0],
  fixedOccluders: [], movableOccluders: [
    { shape: 'bar', size: [3, 0.4, 1], spawn: [5, 1, 4], allow: { translate: true, rotate: true } },
  ],
  params: { carSpeed: 4, gravity: 9.8, maxClimbDeg: 35, gapPassRatio: 0.8 },
};

test('정상 레벨은 통과', () => {
  assert.equal(validateLevel(valid).ok, true);
});

test('light.type 누락이면 에러', () => {
  const bad = JSON.parse(JSON.stringify(valid)); delete bad.light.type;
  const r = validateLevel(bad);
  assert.equal(r.ok, false);
  assert.match(r.errors.join(','), /light/);
});

test('movable shape가 미지원이면 에러', () => {
  const bad = JSON.parse(JSON.stringify(valid)); bad.movableOccluders[0].shape = 'sphere';
  const r = validateLevel(bad);
  assert.equal(r.ok, false);
  assert.match(r.errors.join(','), /shape/);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/levelLoader.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: LevelLoader 구현**

```js
// src/io/LevelLoader.js
const SHAPES = new Set(['bar', 'prism']);
const ROLES = new Set(['floor', 'ceiling']);

/** 레벨 객체 구조 검증. { ok, errors } 반환 */
export function validateLevel(lv) {
  const e = [];
  if (!lv || typeof lv !== 'object') return { ok: false, errors: ['level not an object'] };
  if (!lv.id) e.push('missing id');
  if (!lv.light || !['directional', 'point'].includes(lv.light.type)) e.push('light.type must be directional|point');
  if (!lv.light || !Array.isArray(lv.light.vec) || lv.light.vec.length !== 3) e.push('light.vec must be [x,y,z]');
  if (!lv.wall || typeof lv.wall.width !== 'number' || typeof lv.wall.height !== 'number') e.push('wall.width/height required');
  if (!Array.isArray(lv.start) || lv.start.length !== 2) e.push('start must be [x,y]');
  if (!Array.isArray(lv.goal) || lv.goal.length !== 2) e.push('goal must be [x,y]');
  for (const key of ['fixedOccluders', 'movableOccluders']) {
    if (!Array.isArray(lv[key])) { e.push(`${key} must be array`); continue; }
    lv[key].forEach((o, i) => {
      if (!SHAPES.has(o.shape)) e.push(`${key}[${i}].shape unsupported: ${o.shape}`);
      if (o.role && !ROLES.has(o.role)) e.push(`${key}[${i}].role invalid: ${o.role}`);
      if (!Array.isArray(o.size) || o.size.length !== 3) e.push(`${key}[${i}].size must be [x,y,z]`);
    });
  }
  const p = lv.params || {};
  for (const k of ['carSpeed', 'gravity', 'maxClimbDeg', 'gapPassRatio'])
    if (typeof p[k] !== 'number') e.push(`params.${k} required`);
  return { ok: e.length === 0, errors: e };
}

/** URL에서 레벨 JSON을 fetch + 검증 (브라우저용) */
export async function loadLevel(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`failed to load ${url}: ${res.status}`);
  const lv = await res.json();
  const v = validateLevel(lv);
  if (!v.ok) throw new Error(`invalid level ${url}: ${v.errors.join('; ')}`);
  return lv;
}
```

- [ ] **Step 4: LevelLoader 통과 확인**

Run: `node --test test/levelLoader.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: L1.json 작성 (방향광 갭 메우기)**

```json
{
  "id": "L1",
  "light": { "type": "directional", "vec": [0, 0, -1] },
  "wall": { "width": 12, "height": 6 },
  "start": [1, 0],
  "goal": [11, 0],
  "fixedOccluders": [],
  "movableOccluders": [
    { "shape": "bar", "role": "floor", "size": [6, 0.4, 1], "spawn": [6, 2.5, 3],
      "allow": { "translate": true, "rotate": true } }
  ],
  "params": { "carSpeed": 4, "gravity": 9.8, "maxClimbDeg": 35, "gapPassRatio": 0.8 }
}
```

- [ ] **Step 6: L2.json 작성 (점광원 길이 제어)**

```json
{
  "id": "L2",
  "light": { "type": "point", "vec": [6, 8, 12] },
  "wall": { "width": 16, "height": 8 },
  "start": [1, 0],
  "goal": [15, 0],
  "fixedOccluders": [],
  "movableOccluders": [
    { "shape": "bar", "role": "floor", "size": [4, 0.4, 1], "spawn": [8, 3, 4],
      "allow": { "translate": true, "rotate": true } }
  ],
  "params": { "carSpeed": 4, "gravity": 9.8, "maxClimbDeg": 35, "gapPassRatio": 0.8 }
}
```

- [ ] **Step 7: 솔버 테스트 작성 (의도된 해법 → CLEAR)**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GameStateMachine } from '../src/core/GameStateMachine.js';
import { validateLevel } from '../src/io/LevelLoader.js';

function load(id) {
  return JSON.parse(readFileSync(new URL(`../levels/${id}.json`, import.meta.url)));
}

test('L1: 스키마 유효', () => {
  assert.equal(validateLevel(load('L1')).ok, true);
});

test('L1: 막대를 길 높이로 내려 그림자로 갭 메우면 CLEAR', () => {
  const sm = new GameStateMachine(load('L1'));
  // 방향광 수직투영 → 그림자 = 막대 (x,y). 길 y≈0 높이에 폭 6 막대를 중앙에 배치.
  sm.setMovableTransform(0, { pos: [6, 0.2, 3], rot: 0 });
  assert.equal(sm.go().result, 'CLEAR');
});

test('L2: 스키마 유효', () => {
  assert.equal(validateLevel(load('L2')).ok, true);
});

test('L2: 점광원에서 막대를 광원 쪽으로 밀어 그림자 확대 → 길 연결 시 CLEAR', () => {
  const sm = new GameStateMachine(load('L2'));
  // 광원 (6,8,12). 막대를 광원 가까이(z 큼) + 낮은 y로 → 확대된 그림자가 길 폭을 덮음.
  // 솔버 탐색: 여러 (z,y) 조합 중 CLEAR 나오는 배치 확인.
  let cleared = false;
  for (const z of [9, 10, 11]) {
    for (const y of [0.2, 0.5, 1.0]) {
      sm.reset();
      sm.setMovableTransform(0, { pos: [8, y, z], rot: 0 });
      if (sm.go().result === 'CLEAR') { cleared = true; break; }
    }
    if (cleared) break;
  }
  assert.equal(cleared, true);
});
```

- [ ] **Step 8: M1 전체 테스트 통과 확인**

Run: `npm test`
Expected: 전체 PASS. 특히 `solve.L1L2`가 CLEAR. (만약 L2가 CLEAR 안 나오면 L2.json의 광원 위치/막대 size를 조정 — 그림자가 start~goal x 전 구간을 덮도록. 조정 후 재실행.)

- [ ] **Step 9: Commit**

```bash
git add src/io/LevelLoader.js levels/L1.json levels/L2.json test/levelLoader.test.js test/solve.L1L2.test.js
git commit -m "feat: LevelLoader + validation + L1/L2 data, headless solver tests (M1)"
```

> **M1 마일스톤 완료**: 채점 핵심부(투영·envelope·물리)가 헤드리스로 검증되고 L1·L2가 PLAN→GO→CLEAR로 풀린다.

---

## Task 8: Renderer — Three.js 직교 카메라 + 단색·강명암 + 그림자 프리뷰

**Files:**
- Create: `src/render/Renderer.js`

> 렌더러는 단위테스트 대상이 아니다. 브라우저에서 육안 검증한다.

- [ ] **Step 1: Renderer 구현**

```js
// src/render/Renderer.js
import * as THREE from 'three';

// 단색·강명암 미니멀 룩. 직교 카메라로 벽(z=0)을 정면에서 본다.
export class Renderer {
  constructor(container) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0a0a);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
    this.camera.position.set(0, 0, 50);
    this.camera.lookAt(0, 0, 0);

    this.scene.add(new THREE.AmbientLight(0x404040, 0.6));
    this.sceneLight = new THREE.PointLight(0xffffff, 1.0);
    this.scene.add(this.sceneLight);

    // 동적 객체 그룹
    this.occluderGroup = new THREE.Group();
    this.shadowGroup = new THREE.Group();   // floor heightfield 시각화
    this.ceilingGroup = new THREE.Group();
    this.padGroup = new THREE.Group();
    this.scene.add(this.occluderGroup, this.shadowGroup, this.ceilingGroup, this.padGroup);

    this.car = this._makeCar();
    this.scene.add(this.car);

    window.addEventListener('resize', () => this._onResize());
  }

  fitToWall(wall) {
    const m = 1;
    const aspect = window.innerWidth / window.innerHeight;
    const halfH = wall.height / 2 + m;
    const halfW = Math.max(wall.width / 2 + m, halfH * aspect);
    const cx = wall.width / 2, cy = wall.height / 2 - 1;
    this.camera.left = -halfW + cx; this.camera.right = halfW + cx;
    this.camera.top = halfH + cy; this.camera.bottom = -halfH + cy;
    this.camera.updateProjectionMatrix();
  }

  _makeCar() {
    const g = new THREE.BoxGeometry(1, 0.5, 0.5);
    const mat = new THREE.MeshStandardMaterial({ color: 0xff5533, emissive: 0x220500 });
    return new THREE.Mesh(g, mat);
  }

  setLight(light) {
    if (light.type === 'point') {
      this.sceneLight.position.set(light.vec[0], light.vec[1], light.vec[2]);
    } else {
      this.sceneLight.position.set(light.vec[0] * -20, light.vec[1] * -20, 20);
    }
  }

  // 오클루더(고정+가동) 3D 박스/프리즘을 그린다
  renderOccluders(occluders) {
    this.occluderGroup.clear();
    for (const occ of occluders) {
      for (const part of occ.parts) {
        const mesh = this._partMesh(part, occ.role);
        this.occluderGroup.add(mesh);
      }
    }
  }

  _partMesh(part, role) {
    let geo;
    if (part.shape === 'prism') {
      geo = new THREE.CylinderGeometry(part.size[0] / 2, part.size[0] / 2, part.size[2], 3);
      geo.rotateX(Math.PI / 2);
    } else {
      geo = new THREE.BoxGeometry(part.size[0], part.size[1], part.size[2]);
    }
    const color = role === 'ceiling' ? 0x4466aa : 0x888888;
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color }));
    mesh.position.set(part.pos[0], part.pos[1], part.pos[2]);
    mesh.rotation.z = ((part.rot || 0) * Math.PI) / 180;
    mesh.userData.part = part;
    return mesh;
  }

  // heightfield를 벽(z=0)에 라인/면으로 시각화
  renderHeightfield(hf) {
    this.shadowGroup.clear();
    this.ceilingGroup.clear();
    const floorPts = [];
    for (let i = 0; i < hf.xs.length; i++) {
      if (hf.floor[i] === null) { this._flushStrip(floorPts, 0x222222, this.shadowGroup); continue; }
      floorPts.push(new THREE.Vector3(hf.xs[i], hf.floor[i], 0.01));
    }
    this._flushStrip(floorPts, 0x222222, this.shadowGroup);
  }

  _flushStrip(pts, color, group) {
    if (pts.length >= 2) {
      const geo = new THREE.BufferGeometry().setFromPoints(pts.slice());
      group.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffffff })));
    }
    pts.length = 0;
  }

  renderPads(start, goal) {
    this.padGroup.clear();
    for (const [px, py] of [start, goal]) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 0.2, 0.5),
        new THREE.MeshStandardMaterial({ color: 0x33cc66 }));
      m.position.set(px, py - 0.1, 0);
      this.padGroup.add(m);
    }
  }

  setCar(x, y) {
    this.car.position.set(x, y + 0.25, 0.3);
    this.car.visible = true;
  }

  render() { this.renderer.render(this.scene, this.camera); }

  _onResize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
```

- [ ] **Step 2: 브라우저 육안 검증 (Task 10 이후 가능 — 여기선 import 에러만 확인)**

Run: `node -e "import('./src/render/Renderer.js').catch(e=>{console.log(String(e).slice(0,60))})"`
Expected: three import 해석 실패 메시지(`Cannot find package 'three'`)만 나오면 정상 — 노드엔 importmap이 없으므로 예상된 결과. 문법 오류는 없어야 함.

- [ ] **Step 3: Commit**

```bash
git add src/render/Renderer.js
git commit -m "feat(render): Renderer — ortho camera, occluders, heightfield, pads, car"
```

---

## Task 9: InteractionController — PLAN 드래그/회전 입력

**Files:**
- Create: `src/ui/InteractionController.js`

> 브라우저 입력 의존 → 단위테스트 제외, 브라우저 검증.

- [ ] **Step 1: 구현**

```js
// src/ui/InteractionController.js
import * as THREE from 'three';

// PLAN 단계에서 가동 오클루더 메시를 드래그(이동)/휠·키(회전).
// 변환은 onChange(index, {pos, rot}) 콜백으로 상태머신에 통지.
export class InteractionController {
  constructor(renderer, getPhase, onChange) {
    this.renderer = renderer;
    this.getPhase = getPhase;       // () => 'PLAN'|'GO'|...
    this.onChange = onChange;       // (index, {pos, rot}) => void
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.dragging = null;           // { mesh, index }
    const dom = renderer.renderer.domElement;
    dom.addEventListener('pointerdown', (e) => this._down(e));
    dom.addEventListener('pointermove', (e) => this._move(e));
    dom.addEventListener('pointerup', () => { this.dragging = null; });
    dom.addEventListener('wheel', (e) => this._wheel(e), { passive: false });
  }

  _ndc(e) {
    this.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    this.pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  }

  _pickMovable() {
    this.raycaster.setFromCamera(this.pointer, this.renderer.camera);
    const hits = this.raycaster.intersectObjects(this.renderer.occluderGroup.children, false);
    for (const h of hits) {
      const part = h.object.userData.part;
      if (part && part.movable) return h.object;
    }
    return null;
  }

  _down(e) {
    if (this.getPhase() !== 'PLAN') return;
    this._ndc(e);
    const mesh = this._pickMovable();
    if (mesh) this.dragging = { mesh, index: mesh.userData.part.index };
  }

  _move(e) {
    if (!this.dragging || this.getPhase() !== 'PLAN') return;
    this._ndc(e);
    // 화면 평면 → 월드 (x,y). z는 유지.
    this.raycaster.setFromCamera(this.pointer, this.renderer.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -this.dragging.mesh.position.z);
    const pt = new THREE.Vector3();
    this.raycaster.ray.intersectPlane(plane, pt);
    if (!pt) return;
    const m = this.dragging.mesh;
    m.position.x = pt.x; m.position.y = pt.y;
    this.onChange(this.dragging.index, {
      pos: [m.position.x, m.position.y, m.position.z],
      rot: (m.rotation.z * 180) / Math.PI,
    });
  }

  _wheel(e) {
    if (this.getPhase() !== 'PLAN' || !this.dragging) return;
    e.preventDefault();
    const m = this.dragging.mesh;
    // Shift+휠 = 깊이(z) 조절(점광원 길이제어), 그냥 휠 = 회전
    if (e.shiftKey) m.position.z += (e.deltaY < 0 ? 0.3 : -0.3);
    else m.rotation.z += (e.deltaY < 0 ? 0.05 : -0.05);
    this.onChange(this.dragging.index, {
      pos: [m.position.x, m.position.y, m.position.z],
      rot: (m.rotation.z * 180) / Math.PI,
    });
  }
}
```

- [ ] **Step 2: 문법 확인**

Run: `node -e "import('./src/ui/InteractionController.js').catch(e=>console.log(String(e).slice(0,60)))"`
Expected: `Cannot find package 'three'`만 (문법 오류 없음).

- [ ] **Step 3: Commit**

```bash
git add src/ui/InteractionController.js
git commit -m "feat(ui): InteractionController — drag/rotate/depth for movable occluders in PLAN"
```

---

## Task 10: main.js — 부트스트랩 + 루프 + UI (M2 마일스톤)

**Files:**
- Modify: `src/main.js` (전체 교체)

- [ ] **Step 1: main.js 작성**

```js
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
};

let renderer, sm, interaction;
let levelIdx = 0;
let anim = null; // GO 애니메이션 상태

async function startLevel(idx) {
  cancelAnim();
  const lv = await loadLevel(`./levels/${LEVELS[idx]}.json`);
  sm = new GameStateMachine(lv);
  // 가동 메시에 index/movable 표시 (인터랙션 picking용)
  sm._occluders = patchOccluderMeta(sm);
  renderer.fitToWall(lv.wall);
  renderer.setLight(lv.light);
  renderer.renderPads(lv.start, lv.goal);
  ui.level.textContent = `Level ${LEVELS[idx]}`;
  ui.banner.style.display = 'none';
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
      o.parts.forEach((p) => { p.movable = movable; p.index = movable ? oi - fixedCount : -1; });
    });
    return occs;
  };
}

function syncScene() {
  const occs = sm._occluders();
  renderer.renderOccluders(occs);
  renderer.renderHeightfield(sm.recompute());
  const [sx, sy] = sm.level.start;
  renderer.setCar(sx, sy);
}

function onGo() {
  if (sm.phase !== 'PLAN') return;
  const res = sm.go();
  animateCar(res, () => {
    showBanner(res.result === 'CLEAR' ? 'CLEAR ✓' : 'FAIL ✗', res.result === 'CLEAR');
    if (res.result === 'CLEAR') {
      setTimeout(() => { levelIdx = Math.min(levelIdx + 1, LEVELS.length - 1); startLevel(levelIdx); }, 1500);
    }
  });
}

function onReset() {
  cancelAnim();
  if (sm.phase !== 'PLAN') sm.reset();
  ui.banner.style.display = 'none';
  syncScene();
}

function animateCar(res, done) {
  const traj = res.trajectory;
  let i = 0;
  cancelAnim();
  const step = () => {
    if (i >= traj.length) { done(); return; }
    renderer.setCar(traj[i][0], traj[i][1]);
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
  if (!anim && sm) { syncSceneLight(); renderer.render(); }
  requestAnimationFrame(loop);
}
function syncSceneLight() { /* 그림자 프리뷰는 PLAN 중 드래그 콜백에서 syncScene으로 갱신 */ }

function main() {
  renderer = new Renderer(document.body);
  // 상태머신은 startLevel에서 생성되므로 인터랙션은 게터로 접근
  interaction = new InteractionController(
    renderer,
    () => (sm ? sm.phase : 'GO'),
    (index, t) => { sm.setMovableTransform(index, t); renderer.renderHeightfield(sm.recompute()); }
  );
  ui.go.addEventListener('click', onGo);
  ui.reset.addEventListener('click', onReset);
  window.addEventListener('keydown', (e) => { if (e.key === ' ') onGo(); if (e.key === 'r') onReset(); });
  startLevel(levelIdx).then(loop);
}

main();
```

- [ ] **Step 2: 정적 서버 실행 + 브라우저 검증**

Run: `npm run serve` (백그라운드), 브라우저로 `http://localhost:8080/` 접속.
Expected (M2 육안 체크리스트):
- L1 씬이 단색 배경에 렌더됨(시작/목표 녹색 패드, 회색 막대, 흰색 floor 라인).
- 막대를 마우스로 드래그 → floor 라인(그림자 프리뷰)이 실시간 갱신.
- 막대를 길 높이로 내려 갭을 메운 뒤 **Go** → 빨간 차가 좌→우로 주행, 목표 도달 시 `CLEAR ✓`.
- 막대를 치우고 Go → 차가 추락, `FAIL ✗`. **Reset**(또는 r) → PLAN 복귀, 배치 유지.
- 점광원 레벨(L2)에서 Shift+휠로 깊이 조절 시 그림자 길이 변화.

만약 차 애니메이션 좌표/카메라 프레이밍이 어긋나면 `Renderer.fitToWall`와 `setCar`의 z/offset을 조정.

- [ ] **Step 3: 코어 테스트 회귀 확인**

Run: `npm test`
Expected: 전체 PASS (렌더 변경이 코어를 깨지 않았는지 확인).

- [ ] **Step 4: Commit**

```bash
git add src/main.js
git commit -m "feat: main bootstrap — render loop, Go/Reset UI, car animation (M2)"
```

> **M2 마일스톤 완료**: 브라우저에서 PLAN→GO→CLEAR/FAIL 전체 플레이 가능.

---

## Task 11: 레벨 L3–L7 + 솔버 테스트 (M3 마일스톤)

**Files:**
- Create: `levels/L3.json` `levels/L4.json` `levels/L5.json` `levels/L6.json` `levels/L7.json`
- Test: `test/solve.levels.test.js`

각 레벨은 §6 명세를 따른다. 작성 → 솔버 테스트로 "의도된 해법 배치에서 CLEAR" 검증 → 브라우저 플레이 확인.

- [ ] **Step 1: L3.json (점광원, 회전 램프 — 높은 단 등판)**

```json
{
  "id": "L3",
  "light": { "type": "point", "vec": [7, 9, 12] },
  "wall": { "width": 14, "height": 8 },
  "start": [1, 0],
  "goal": [13, 3],
  "fixedOccluders": [
    { "shape": "bar", "role": "floor", "size": [3, 0.4, 1], "pos": [12.5, 3, 2], "rot": 0 }
  ],
  "movableOccluders": [
    { "shape": "bar", "role": "floor", "size": [7, 0.4, 1], "spawn": [6, 3, 4],
      "allow": { "translate": true, "rotate": true } }
  ],
  "params": { "carSpeed": 4, "gravity": 9.8, "maxClimbDeg": 35, "gapPassRatio": 0.8 }
}
```

- [ ] **Step 2: L4.json (고정 그림자 = 길 전반부, 접속 퍼즐)**

```json
{
  "id": "L4",
  "light": { "type": "point", "vec": [8, 9, 13] },
  "wall": { "width": 18, "height": 8 },
  "start": [1, 0],
  "goal": [17, 0],
  "fixedOccluders": [
    { "shape": "bar", "role": "floor", "size": [7, 0.4, 1], "pos": [5, 0.5, 2.5], "rot": 0 }
  ],
  "movableOccluders": [
    { "shape": "bar", "role": "floor", "size": [7, 0.4, 1], "spawn": [12, 2, 4],
      "allow": { "translate": true, "rotate": true } }
  ],
  "params": { "carSpeed": 4, "gravity": 9.8, "maxClimbDeg": 35, "gapPassRatio": 0.8 }
}
```

- [ ] **Step 3: L5.json (고정 = 낮은 천장 ceiling, 그 아래 통로)**

```json
{
  "id": "L5",
  "light": { "type": "point", "vec": [9, 10, 14] },
  "wall": { "width": 18, "height": 9 },
  "start": [1, 0],
  "goal": [17, 0],
  "fixedOccluders": [
    { "shape": "bar", "role": "ceiling", "size": [6, 1, 1], "pos": [9, 1.2, 3], "rot": 0 }
  ],
  "movableOccluders": [
    { "shape": "bar", "role": "floor", "size": [6, 0.4, 1], "spawn": [5, 3, 4],
      "allow": { "translate": true, "rotate": true } },
    { "shape": "bar", "role": "floor", "size": [6, 0.4, 1], "spawn": [13, 3, 4],
      "allow": { "translate": true, "rotate": true } }
  ],
  "params": { "carSpeed": 4, "gravity": 9.8, "maxClimbDeg": 35, "gapPassRatio": 0.8 }
}
```

- [ ] **Step 4: L6.json (합성 길 — 막대 2 + 삼각 1, 장거리)**

```json
{
  "id": "L6",
  "light": { "type": "point", "vec": [10, 11, 15] },
  "wall": { "width": 22, "height": 9 },
  "start": [1, 0],
  "goal": [21, 0],
  "fixedOccluders": [],
  "movableOccluders": [
    { "shape": "bar", "role": "floor", "size": [7, 0.4, 1], "spawn": [6, 3, 5],
      "allow": { "translate": true, "rotate": true } },
    { "shape": "bar", "role": "floor", "size": [7, 0.4, 1], "spawn": [15, 3, 5],
      "allow": { "translate": true, "rotate": true } },
    { "shape": "prism", "role": "floor", "size": [3, 2, 1], "spawn": [11, 2, 5],
      "allow": { "translate": true, "rotate": true } }
  ],
  "params": { "carSpeed": 4, "gravity": 9.8, "maxClimbDeg": 35, "gapPassRatio": 0.8 }
}
```

- [ ] **Step 5: L7.json (피날레 — 결합 쇼피스)**

```json
{
  "id": "L7",
  "light": { "type": "point", "vec": [11, 12, 16] },
  "wall": { "width": 24, "height": 10 },
  "start": [1, 0],
  "goal": [23, 4],
  "fixedOccluders": [
    { "shape": "bar", "role": "floor", "size": [4, 0.4, 1], "pos": [22, 4, 2.5], "rot": 0 }
  ],
  "movableOccluders": [
    { "shape": "bar", "role": "floor", "size": [8, 0.4, 1], "spawn": [6, 3, 6],
      "allow": { "translate": true, "rotate": true } },
    { "shape": "bar", "role": "floor", "size": [8, 0.4, 1], "spawn": [15, 3, 6],
      "allow": { "translate": true, "rotate": true } },
    { "shape": "prism", "role": "floor", "size": [3, 2.5, 1], "spawn": [11, 2, 6],
      "allow": { "translate": true, "rotate": true } },
    { "shape": "bar", "role": "ceiling", "size": [3, 0.6, 1], "spawn": [18, 2.5, 5],
      "allow": { "translate": true, "rotate": true } }
  ],
  "params": { "carSpeed": 4, "gravity": 9.8, "maxClimbDeg": 35, "gapPassRatio": 0.8 }
}
```

- [ ] **Step 6: 솔버 테스트 — 각 레벨은 "해가 존재"함을 탐색으로 입증**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GameStateMachine } from '../src/core/GameStateMachine.js';
import { validateLevel } from '../src/io/LevelLoader.js';

function load(id) {
  return JSON.parse(readFileSync(new URL(`../levels/${id}.json`, import.meta.url)));
}

// 가동 오클루더들의 (x,y,z,rot)를 거친 격자로 탐색해 CLEAR 배치가 하나라도 있는지 확인.
// (레벨이 풀 수 있게 설계됐는지에 대한 sanity check. 실제 해법은 더 정밀.)
function solvable(id, opts = {}) {
  const lv = load(id);
  const sm = new GameStateMachine(lv);
  const xs = opts.xs || [lv.wall.width * 0.35, lv.wall.width * 0.5, lv.wall.width * 0.65];
  const ys = opts.ys || [0.2, 0.5, 1.0, 1.5];
  const zs = opts.zs || [4, 6, 8, 10];
  const rots = opts.rots || [0, 10, 20, -10, -20];
  const n = sm.movables.length;
  // 단순화를 위해 모든 가동 물체에 같은 (y,z,rot)를 적용하고 x만 분산 배치하는 그리드 탐색
  for (const y of ys) for (const z of zs) for (const rot of rots) {
    sm.reset();
    for (let k = 0; k < n; k++) {
      const x = xs[Math.min(k, xs.length - 1)] + k * 0.01;
      sm.setMovableTransform(k, { pos: [sm.movables[k].pos[0], y, z], rot: sm.movables[k].role === 'ceiling' ? 0 : rot });
    }
    if (sm.go().result === 'CLEAR') return true;
  }
  return false;
}

for (const id of ['L3', 'L4', 'L5', 'L6', 'L7']) {
  test(`${id}: 스키마 유효`, () => assert.equal(validateLevel(load(id)).ok, true));
}

test('L3 solvable', () => assert.equal(solvable('L3'), true));
test('L4 solvable', () => assert.equal(solvable('L4'), true));
test('L5 solvable', () => assert.equal(solvable('L5'), true));
test('L6 solvable', () => assert.equal(solvable('L6'), true));
test('L7 solvable', () => assert.equal(solvable('L7'), true));
```

- [ ] **Step 7: 솔버 통과까지 레벨 튜닝**

Run: `npm test`
Expected: 모든 레벨 `solvable=true`. 실패하는 레벨은 JSON의 광원 위치/오클루더 size·spawn을 조정(그림자가 start~goal 구간을 충분히 덮고, 천장이 차 높이보다 여유 있게). 탐색 그리드(`opts`)를 넓혀도 됨. 조정→재실행 반복.

- [ ] **Step 8: 브라우저 전 레벨 플레이 확인**

Run: `npm run serve`, L1→L7 순차 플레이. 각 레벨이 손으로 풀리고 CLEAR 시 다음 레벨로 넘어가는지 확인.

- [ ] **Step 9: Commit**

```bash
git add levels/L3.json levels/L4.json levels/L5.json levels/L6.json levels/L7.json test/solve.levels.test.js
git commit -m "feat: levels L3-L7 + solvability tests (M3)"
```

> **M3 마일스톤 완료**: 7레벨 전부 데이터로 존재하고, 풀 수 있음이 헤드리스로 입증됨.

---

## Task 12: 마감 — cartoonCar 적용 + 시각 폴리시 + 제출 검증 (M4)

**Files:**
- Modify: `src/render/Renderer.js` (차 모델 교체, 선택)
- Create: `docs/SUBMISSION.md`

- [ ] **Step 1: cartoonCar 모델 복사 (선택 — FBX 로더 사용 시)**

Run:
```bash
mkdir -p assets/models
cp "/home/ljk9121/projects/CG/WebGLDist/ThreeJSSource/assets/models/cartoonCar/Cartoon_Car_Simple.fbx" assets/models/
```
> FBXLoader는 `three/addons/`가 필요하다. importmap에 addons 항목을 추가하거나(아래), 시간이 부족하면 **박스 자동차 유지**(YAGNI). addons 추가 시:
```html
<!-- index.html importmap에 추가 -->
"three/addons/": "./vendor/three-addons/"
```
그리고 필요한 addon 파일(FBXLoader.js + fflate)을 vendor에 복사. 시간 부족 시 이 스텝은 건너뛰고 박스 차로 제출.

- [ ] **Step 2: 시각 폴리시 (단색·강명암 강화)**

`Renderer` 배경/라이트/머티리얼 색을 §8 심미성 방향(단색 배경 + 단일 강한 광원 + 깊은 명암)으로 미세조정. floor 라인을 굵게/발광 처리해 "도로" 가독성 강화. 브라우저에서 확인.

- [ ] **Step 3: 회귀 테스트 + 라이브 실행 확인 (0점 룰 방어)**

Run: `npm test` → 전체 PASS.
Run: `npm run serve` → `http://localhost:8080/`에서 L1~L7 완주. **콘솔 에러 0** 확인(에러 있으면 0점 위험).

- [ ] **Step 4: docs/SUBMISSION.md 작성 (제출 체크리스트)**

```markdown
# ShadowDrive 제출 체크리스트

- [ ] 업로드 URL에서 브라우저 라이브 실행 확인 (미실행=0점)
- [ ] 콘솔 에러 0
- [ ] "기타 사용 기능" Report 섹션: three.js(출처/버전 0.159), 사용 기능 명시
- [ ] 직접 구현 기술 서술: 투영행렬 / 점광원 발산 / convex 실루엣 상하 envelope / floor·ceiling heightfield / 추력+중력 적분
- [ ] 3분 이내 시연 영상(L1→L7 점층 + L7 피날레) YouTube 업로드 + 링크
- [ ] ProjectTitle.zip: 소스 폴더 전체 + Project.pdf
- [ ] 제목 / 팀원(학번,이름) / 업로드 URL / 영상 링크 — 대표 1인 제출
- [ ] 마감 2026-06-05(금) 자정 전 제출
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: M4 finishing — visual polish, submission checklist (+ optional cartoonCar)"
```

> **M4 마일스톤 완료**: 제출 가능 상태.

---

## 자기 검토 (작성자 체크 결과)

- **스펙 커버리지**: §4.1 광원(L1 dir/L2+ point)→L1/L2 데이터, §4.4 envelope→Task4, §4.5 차 물리→Task5(6규칙 전부 테스트), §4.6 상태머신→Task6, §5 프리미티브①~⑦→L1~L7, §6 7레벨→Task7/11, §9 모듈경계→Task1~10, §10 JSON 스키마→LevelLoader, §12 제출→Task12. 갭 없음.
- **Placeholder 스캔**: 모든 코드 스텝에 완전한 코드 포함. "TBD/적절히 처리" 없음. (Task8/9의 cartoonCar·addons는 명시적 "시간 부족 시 생략 가능"으로 YAGNI 처리.)
- **타입 일관성**: `Light{type,vec}`, `ShadowPolygon{polygon,role}`, `Heightfield{xs,dx,floor,ceiling}`, `SimResult{result,reason,trajectory}` — 전 태스크 동일. `projectVertex/convexHull2D/polygonVerticalSpan`(mathx) → `projectScene`(Task3) → `buildHeightfield`(Task4) → `simulate`(Task5) → `GameStateMachine`(Task6) 시그니처 일치. `setMovableTransform(i,{pos,rot})`는 Task6 정의·Task9/10 호출 일치.
- **알려진 튜닝 포인트**: L2 및 L3~L7의 CLEAR 가능성은 JSON 수치에 의존 → 솔버 테스트(Task7-Step8, Task11-Step7)가 게이트. 통과까지 수치 조정.
