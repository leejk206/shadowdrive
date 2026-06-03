# ShadowDrive — 2D 차량 물리 전환 설계 (2026-06-04)

## 1. 개요 / 목표

그림자를 **1D 높이맵(envelope)** 으로 축소하던 현재 모델을, **모든 그림자를 고체 2D convex 폴리곤 콜라이더**로 두고 **바퀴 달린 강체 차량**이 그 위를 달리는 풀 2D 물리로 전환한다.

- **근본 버그 수정**: 세로 그림자(L의 수직 팔 등)가 1D 높이맵에선 "벽"을 표현 못 해 차가 절벽 모서리를 기어오르던 이상현상 → 2D 고체 충돌이면 차가 벽에 막혀 자연 해결.
- **차량**: Hill Climb Racing식 — 차체(OBB) + 바퀴 2개(서스펜션) + 모터. 경사 등반, 점프 시 공중 회전, 전복까지.
- **승패**: 목표 존 도달=성공(방향 무관), 바닥 아래 추락=실패, **스테이지 30초 초과=실패**.
- **레벨 워크플로우**: 시드 기반 자동 solvable 오라클을 은퇴하고 **수동 플레이테스트**로 전환.

## 2. 배경 — 왜 바꾸나

`ColliderBuilder.buildHeightfield`는 그림자 폴리곤에서 `floor = 윗변 y의 max`, `ceiling = 아랫변 y의 min`만 추출한다(각 x 컬럼 1값). 옆면·내부·구멍은 버려진다. `CarSimulator`는 이 1D 표면을 따라가는 지형추종 적분기다.

→ 높이맵은 수직 벽/오버행/측면 충돌을 표현할 수 없다. 그래서 키 큰 그림자는 "고원(mesa)"이 되고, 접지 차가 그 왼쪽 절벽을 `MAX_STEEP_RISE`(2.5)까지 기어오르다 실패한다. `role:ceiling`, `MAX_STEEP_RISE`, "엘리베이터 치트 차단" 등은 전부 이 1D 한계를 덧댄 패치였다. 정공법은 2D 고체 콜라이더.

## 3. 범위 (Scope)

**In:**
- 신규 2D 충돌 기하 모듈, 신규 차량 물리 시뮬레이터, GameStateMachine 적응, 렌더러 차체/바퀴, 30초 타이머 UI.
- 그림자 = 전부 고체(역할 폐지). 차량 단위테스트(합성 콜라이더).
- 자동 오라클·레벨 단위테스트 은퇴. 신규 레벨 최소 1개(수직 슬라이스).

**Out (이번 아님):**
- 기존 L1~L7 전체 재설계(물리 안정화 후 플레이테스트로 점진). 라이브 주행 조작(배치 퍼즐 유지). 멀티 바디 조인트/외부 물리 라이브러리.

## 4. 아키텍처 / 모듈

| 모듈 | 처리 |
|---|---|
| `src/core/ShadowProjector.js` | **유지** — `projectScene` → `{polygon(convex,CCW), role}` 배열 |
| `src/core/shapes.js`, `mathx.js` | **유지/확장** — 필요 시 기하 헬퍼 추가 |
| `src/core/collide2d.js` | **신규** — 원·OBB vs convex폴리곤 충돌(법선/관통깊이/접촉점), SAT, 최근접점 |
| `src/core/VehicleSimulator.js` | **신규** — 아케이드 차량 적분기 (`CarSimulator` 대체) |
| `src/core/ColliderBuilder.js` | **은퇴** — 1D heightfield 폐기 |
| `src/core/GameStateMachine.js` | **적응** — GO 시 그림자 폴리곤 집합 freeze → VehicleSimulator 실행, 타이머 결과 반영 |
| `src/render/Renderer.js` | **변경** — 차체 박스+바퀴 2개 pose 렌더, GO 중 trajectory 애니메이션 |
| `src/main.js` | **변경** — 30초 스테이지 타이머 + 상단 카운트다운 UI |

각 모듈은 단일 책임 + 명확한 인터페이스: `collide2d`(순수 기하), `VehicleSimulator`(순수 물리, 콜라이더+파라미터 입력 → 결과+trajectory), `GameStateMachine`(상태/freeze), 렌더·타이머는 main/Renderer.

## 5. 충돌 모델 (`collide2d.js`)

- **콜라이더**: GO 시점에 freeze된 **convex 폴리곤 집합**(그림자). 정적.
- **차량 충돌 도형**: 차체 = OBB(회전 사각), 바퀴 = 원 2개.
- **프리미티브**(결정론, RNG 없음):
  - `circleVsConvex(c, r, poly) → {hit, normal, depth, point}` (원-볼록, SAT/최근접점)
  - `obbVsConvex(obb, poly) → {hit, normal, depth, point}` (SAT)
- **해소**: 패널티 기반 — 관통깊이만큼 법선으로 밀어내고 법선 상대속도를 감쇠(반발≈0, 약간의 스프링/댐퍼). 접선엔 쿨롱 마찰. 폴리곤 순회는 index 고정 순서.
- **터널링 방지**: 고정 dt를 서브스텝으로 분할(예: 차량 속도에 비례한 N 서브스텝, 상한 고정). 바퀴는 작은 원이라 서브스텝으로 충분.

## 6. 차량 물리 (`VehicleSimulator.js`)

상태: 차체 `{pos[x,y], angle, vel, angVel, mass, inertia}`, 바퀴 2개 `{anchorLocal, restLen, radius, contact}`.

스텝(고정 dt, 서브스텝):
1. 중력을 차체에 적용.
2. 각 바퀴: 차체 down축으로 매단 **서스펜션 스프링**(Hooke + 댐퍼). 바퀴 원 vs 폴리곤 충돌로 접지 판정 → 접촉 시 스프링 압축 → 차체를 받쳐 올리는 힘 + **모터 구동력**(접선 전방, GO 시 일정 토크) + 마찰(그립).
3. 차체 OBB 코너 vs 폴리곤 충돌 → 패널티 해소(벽/천장에 부딪히면 막힘·튕김·전복).
4. 적분(semi-implicit Euler): 선·각속도 → pose 갱신.
5. 종료 판정: 목표 AABB와 차체/바퀴 겹침 → **CLEAR**; 최저 도로 아래 `failY` 추락 → **FAIL(fell)**; (타이머는 GameStateMachine/main이 관리).

반환: `{result, reason, trajectory:[{x,y,angle,wheels}...] }`. trajectory는 렌더 애니메이션·디버그용.

- **출발**: 차는 start 상공 스폰 → 낙하 → 그림자에 착지 → 모터로 전진. start 좁은 구간엔 도로 없음(현행 유지).
- **스키점프**: 볼록 입술을 지나면 바퀴 접지가 풀려 차체가 탄도로 발사·공중 회전 → 착지. 자연 발생.

## 7. 결정론

고정 dt + 서브스텝, `Math.random`/`Date.now` 미사용, 폴리곤·접촉 순회 순서 고정. 동일 배치 → 동일 GO 결과(재생 일관, 물리 단위테스트 재현). (참고: `Date.now`는 코어에서 금지 — 타이머의 실시간 측정은 main/렌더 레이어에서만.)

## 8. 게임 규칙

- **역할 폐지**: 모든 그림자 = 고체. `role` 필드는 JSON 호환 위해 남기되 **시뮬은 무시**(추후 제거 가능). 높은 그림자=천장(머리 받힘), 세로=벽이 자연 처리.
- **승리**: 차체 또는 바퀴가 목표 AABB(반폭 goalHW·반높이 goalHH)와 겹침. **방향 무관**(뒤집혀도 OK).
- **실패**: ① 바닥 아래 추락, ② **스테이지 30초 초과**.
- **30초 타이머**:
  - **GO를 누른 시점에 30.0s 시작**(PLAN/배치는 무제한). GO 누를 때마다 30s 재시작.
  - GO 카운트다운 + 주행 동안 **실시간(wall-clock)으로 감소**.
  - CLEAR → 정지·성공. **0 도달 → 즉시 FAIL("시간 초과")**.
  - PLAN(배치)·에디터 모드에선 **비활성/숨김**.
  - UI: 화면 **상단 중앙에 작게** `⏱ 23.4`, **5초 미만 빨강**.

## 9. UI / 렌더러

- `Renderer.setCar(pose)` — pose=`{x, y, angle, wheels:[{x,y}]}`. 차체 박스 회전 + 바퀴 2개 렌더. GO 중 trajectory 따라 프레임 보간.
- 타이머 DOM: `#stageTimer`(top-center, 작게), main 루프에서 매 프레임 갱신, <5s 빨강 클래스.

## 10. 레벨 포맷 & 마이그레이션

- 포맷 대체로 유지(light/wall/start/goal/occluders/params). `role` 무시. 차량 파라미터(질량·바퀴·서스펜션·모터·중력) 일부는 전역 상수 + `params`로 오버라이드 가능.
- 기존 L1~L7: 새 물리에선 다르게 굴러 → **재설계 대상**(이번엔 보존만, 점진 교체). 우선 신규 1개로 검증.

## 11. 테스트 전략

- **은퇴**: `solve.levels.test.js`, `spawn.unsolved.test.js`, `helpers/solvable.js`, `colliderBuilder.test.js`.
- **유지**: `mathx`, `shapes`, `shadowProjector`, `concaveShapes`, `levelLoader`, `levelStore` 테스트.
- **적응**: `gameStateMachine`, `smoke` — 새 시뮬 API에 맞춤.
- **신규**: `collide2d.test.js`(원/OBB vs 폴리곤 단정), `vehicleSimulator.test.js`(합성 콜라이더 시나리오: 평지→직진·정립, 벽→막힘·안기어오름(=원버그 회귀테스트), 경사→등반, 갭→낙하, 목표→CLEAR, 타임아웃 단정). 오라클 없이 물리 신뢰 확보.

## 12. 롤아웃 (상세는 writing-plans)

1. `collide2d` 기하 + 테스트
2. `VehicleSimulator` + 단위테스트(평지/경사/벽/갭/목표/타임아웃)
3. `GameStateMachine` 연결 + 렌더러 차체/바퀴 + 30초 타이머 UI
4. 브라우저 주행 확인(playtest)
5. 신규 레벨 1개 플레이테스트
6. 구 테스트/모듈 정리, 커리큘럼 점진 확장

## 13. 리스크 / 오픈 이슈

- **물리 안정화**: 패널티 충돌은 강성↑ 시 진동/폭주 위험 → dt·서브스텝·강성/댐퍼 튜닝 필요. 단위테스트로 회귀 방지.
- **고속 터널링**: 빠른 차/얇은 폴리곤 → 서브스텝/스윕 필요.
- **수동 검증 비용**: 오라클 은퇴로 레벨 품질은 플레이테스트 의존 → 회귀는 "대표 배치를 박은 시나리오 테스트"로 일부 보강 가능.
- **결정론 vs 카오스**: 결정론은 유지되나 작은 배치 변화에 결과 민감 → 레벨 설계가 더 손이 감(수동 전환의 대가, 합의됨).
