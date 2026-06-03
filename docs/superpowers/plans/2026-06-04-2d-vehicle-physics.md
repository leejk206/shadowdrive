# 2D 차량 물리 전환 Implementation Plan

> **For agentic workers:** 구현은 TDD + 잦은 커밋. 스텝은 체크박스로 추적.

**Goal:** 그림자를 고체 2D convex 폴리곤 콜라이더로, 바퀴+서스펜션 아케이드 차량으로 전환해 수직벽 등반 버그를 근본 해결하고 30초 스테이지 타이머를 추가한다.

**Architecture:** `collide2d`(순수 기하: 원/볼록 vs 볼록 SAT) → `VehicleSimulator`(차체 OBB + 바퀴2 서스펜션 + 모터, 패널티 충돌, 고정 dt 서브스텝) → `GameStateMachine`(GO 시 그림자 폴리곤 freeze 후 시뮬) → `Renderer`(차체+바퀴 pose) → `main`(30초 타이머 UI). 자동 오라클 은퇴, 수동 플레이테스트.

**Tech Stack:** Vanilla ES modules, Three.js(vendored), node:test. 의존성 추가 없음.

---

## File Structure

- Create `src/core/collide2d.js` — 2D 충돌 기하(순수 함수)
- Create `src/core/VehicleSimulator.js` — 아케이드 차량 적분기(`CarSimulator` 대체)
- Modify `src/core/GameStateMachine.js` — 콜라이더=그림자 폴리곤, VehicleSimulator 호출
- Modify `src/render/Renderer.js` — `setCar(pose)` 차체 박스+바퀴
- Modify `src/main.js` — 30초 타이머 + 상단 카운트다운, GO 흐름
- Modify `index.html` — `#stageTimer` 요소+스타일
- Create `test/collide2d.test.js`, `test/vehicleSimulator.test.js`
- Remove `src/core/ColliderBuilder.js`, `src/core/CarSimulator.js`, `test/colliderBuilder.test.js`, `test/carSimulator.test.js`, `test/solve.levels.test.js`, `test/spawn.unsolved.test.js`, `test/helpers/solvable.js`
- Adapt `test/gameStateMachine.test.js`, `test/smoke.test.js`

---

## Task 1: collide2d.js (충돌 기하)

**Files:** Create `src/core/collide2d.js`, `test/collide2d.test.js`

인터페이스:
- `obbCorners(cx, cy, angle, hw, hh) → [[x,y]×4]` (CCW)
- `convexVsConvex(a, b) → null | {nx, ny, depth}` — MTV, 법선은 b→a 방향(a를 빼내는 방향)
- `circleVsConvex(cx, cy, r, poly) → null | {nx, ny, depth, px, py}` — 법선 poly→원, px/py 접촉점

- [ ] Step 1: 테스트 작성 — `circleVsConvex`: 사각형 위 원이 살짝 관통 시 normal≈(0,1), depth>0; 멀리 있으면 null. `convexVsConvex`: 겹친 두 사각형 MTV 방향/깊이; 안 겹치면 null. `obbCorners`: 45° 회전 코너 좌표.
- [ ] Step 2: 실패 확인 (`node --test test/collide2d.test.js`)
- [ ] Step 3: 구현 — SAT(두 폴리곤 edge 법선 축들에 투영, 최소 겹침 축=MTV). circle: 볼록폴리곤 최근접점(각 edge에 clamp, 내부면 최소 edge 침투) + r 비교.
- [ ] Step 4: 통과 확인
- [ ] Step 5: 커밋 `feat(core): collide2d 2D 충돌 기하`

## Task 2: VehicleSimulator.js (차량 물리)

**Files:** Create `src/core/VehicleSimulator.js`, `test/vehicleSimulator.test.js`

인터페이스: `simulateVehicle(colliders, params, vehicle) → {result, reason, trajectory:[{x,y,angle,wheels:[[x,y],[x,y]]}]}`
- `colliders`: convex 폴리곤 배열(각 [[x,y]…])
- `params`: `{gravity, driveForce, suspK, suspDamp, grip, ...}` (코어 상수 + 오버라이드)
- `vehicle`: `{startX, startY, chassisHW, chassisHH, wheelR, wheelBase, suspRest, mass, goal:{x,y,hw,hh}, failY, maxSteps}`

물리(고정 dt=0.008, 속도비례 서브스텝, RNG 없음):
1. 중력 → 차체.
2. 바퀴 i: 월드 anchor = chassis 중심 + 회전(±wheelBase/2, -suspRest). `circleVsConvex`로 접지·법선 n·관통 p. 접지면 서스펜션 스프링(`k*p - damp*pRate`)을 n 방향으로 차체 anchor에 힘+토크. 접선 t=perp(n)으로 모터 구동력(전방), grip*normalForce로 캡.
3. 차체 OBB 코너 vs 각 폴리곤 `convexVsConvex` → 위치보정 + 법선 임펄스(벽/천장/전복).
4. semi-implicit Euler 적분 → pose.
5. 종료: 차체/바퀴가 goal AABB 겹침 → CLEAR; y<failY → FAIL('fell'); maxSteps 초과 → FAIL('stalled').

- [ ] Step 1: 시나리오 테스트 작성 (합성 콜라이더):
  - 평지(긴 바 폴리곤): 차가 우측 전진하며 angle≈0 유지, 목표 도달 → CLEAR.
  - **벽(세로 높은 폴리곤): 차가 막혀 수직 등반 안 함**(x 진행이 벽에서 멈춤, y 급상승 없음) — 원버그 회귀.
  - 경사(완만 램프 폴리곤): 등반해서 목표 → CLEAR.
  - 갭(폴리곤 사이 빈 공간, 그 아래 failY): 차가 떨어짐 → FAIL('fell').
  - 목표 위 스폰+평지: CLEAR.
- [ ] Step 2: 실패 확인
- [ ] Step 3: 구현 + dt/k/damp/grip/서브스텝 튜닝(테스트 통과까지 반복).
- [ ] Step 4: 통과 확인
- [ ] Step 5: 커밋 `feat(core): VehicleSimulator 아케이드 차량 물리`

## Task 3: GameStateMachine 연결

**Files:** Modify `src/core/GameStateMachine.js`, adapt `test/gameStateMachine.test.js`

- `go()`: `colliders = projectScene(this._occluders(), light).map(s => s.polygon)` (role 무시), `simulateVehicle(colliders, params, vehicle)` 실행. vehicle은 start/goal/params로 구성. `recompute()`는 PLAN 미리보기용으로 폴리곤 배열 반환(렌더 도로 표시용)으로 단순화.
- [ ] Step 1: 테스트 적응 — go()가 합성 가능한 레벨에서 CLEAR/FAIL 반환, PLAN/GO 전이 유지.
- [ ] Step 2~4: 구현/통과.
- [ ] Step 5: 커밋 `feat(core): GameStateMachine 차량 시뮬 연결`

## Task 4: Renderer 차체+바퀴

**Files:** Modify `src/render/Renderer.js`

- `setCar(pose)` — pose=`{x,y,angle,wheels:[[x,y],[x,y]]}`. 차체 박스(회전) + 바퀴 2개 메시. PLAN에선 start에 정지 pose, GO에선 trajectory 보간.
- 도로 렌더: heightfield 대신 그림자 폴리곤 윤곽(`renderOccluders`의 castShadow는 유지) — 기존 그림자 시각 유지.
- [ ] Step 1: 수동/smoke — 브라우저에서 차체+바퀴 보이고 GO 시 굴러감.
- [ ] Step 2: 커밋 `feat(render): 차체+바퀴 pose 렌더`

## Task 5: 30초 스테이지 타이머

**Files:** Modify `src/main.js`, `index.html`

- `index.html`: `#stageTimer`(top-center, 작게) + `.danger`(빨강) 스타일.
- `main.js`: `stageDeadline` = PLAN 진입(레벨 로드/`r`) 시 30s 설정. loop에서 매 프레임 남은시간 표시(`⏱ 23.4`), <5s `.danger`. 0 도달 → FAIL('시간 초과') 배너 + GO 중단. CLEAR/edit 모드에선 정지. play 모드 한정.
- [ ] Step 1: 구현.
- [ ] Step 2: 브라우저 확인(카운트다운 감소, 0에서 FAIL, 5초 빨강).
- [ ] Step 3: 커밋 `feat(ui): 30초 스테이지 타이머`

## Task 6: 구 모듈/테스트 정리

**Files:** Remove ColliderBuilder/CarSimulator + 관련 테스트, solvable 하네스, solve.levels/spawn.unsolved; adapt smoke.

- [ ] Step 1: 삭제 + smoke 적응(새 API). `npm test` 전부 통과.
- [ ] Step 2: 커밋 `chore(test): 1D heightfield·오라클 테스트 은퇴`

## Task 7: 검증 레벨 1개

**Files:** 새 레벨(예: `levels/L1.json` 재설계 또는 신규) — 벽/경사/갭/점프가 새 물리로 풀리는 1개.

- [ ] Step 1: 손으로 배치 → 브라우저 GO로 플레이테스트 → CLEAR 확인, 벽 등반 버그 없음 확인.
- [ ] Step 2: 커밋 `feat(level): 차량 물리 검증 레벨`

---

## Self-Review
- Spec 커버: 고체콜라이더(T1~3)·차량물리(T2)·렌더(T4)·타이머(T8/T5)·오라클은퇴(T6)·검증레벨(T7) 전부 대응.
- 타입 일관: `simulateVehicle(colliders,params,vehicle)`, pose `{x,y,angle,wheels}`, MTV `{nx,ny,depth}` 전 태스크 통일.
- 플레이스홀더: 물리 상수 값은 Task2 튜닝 단계에서 확정(시나리오 테스트가 게이트).
