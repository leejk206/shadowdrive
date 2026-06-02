# ShadowDrive Iteration 3 — 사용자 피드백 & 결정

iteration-2 구현 후 손 플레이에서 나온 피드백. 본 문서가 iteration-3 spec 역할을 겸한다.

## #1 compound(L/T/노치)가 한 덩어리로 안 움직임 — 확정

- **증상**: L/T 블록의 가로 bar와 세로 bar가 따로 드래그·회전된다.
- **원인**: `Renderer.renderOccluders`가 occluder를 part마다 별도 메시로 생성 → InteractionController가 part 단위로 picking/드래그.
- **결정**: occluder 1개 = 강체 1개. part 지오메트리를 occluder-local(`posRel`) 위치로 **하나의 병합 메시**로 합쳐 단일 메시로 렌더·조작.
  - `GameStateMachine._occluders()`가 occluder `origin`/`occRot` + part `posRel`(로컬)을 함께 노출.
  - 병합은 `geometry.toNonIndexed()` 후 position/normal 어트리뷰트 concat (vendored three에 BufferGeometryUtils 없음).
  - InteractionController는 변경 0 (이미 단일 메시 picking·아크볼·emissive 기반).

## #2 start 영역 — 확정

- **증상**: PLAN 중 start_x에 그림자가 닿으면 차 프리뷰가 그 위로 자동 점프. "물리가 미리 적용되는 느낌."
- **결정 (출발 메커닉)**: **그림자 위로 떨어지는 설계.**
  - start에 발판(pad) 제거. start 지점 y를 지금보다 **조금 높게** 설정(공중 발사대).
  - Go+3초 뒤 차가 전진속도로 발사 → 플레이어가 만든 그림자 도로에 **낙하·착지**해야 함.
  - 시뮬레이터: start에 floor가 없으면 'start on void' 실패 대신 **공중(grounded=false) 시작**으로 낙하.
- **결정 (그림자 차단)**: **start 구간 도로 마스킹.**
  - heightfield에서 start_x 좌우 좁은 구간의 floor를 강제 null → 그 영역엔 그림자 도로가 생기지 않음.

## #3 물리 타이밍 — 확정

- go 누르기 전(PLAN): 물리 미적용. 차는 고정된 (높은) start 위치에 정지.
- go + 3초 카운트다운 후: 물리 적용(궤적 재생) 시작.
- 현재 이미 카운트다운 후에만 차가 움직이므로, PLAN 프리뷰가 그림자 높이로 스냅하던 것만 고정 위치로 교정하면 됨.

## 영향

- 출발 메커닉 변경으로 L1~L7 풀이 가능성 재검증 필요 → 솔버 테스트로 게이트, 실패 레벨은 start y / 그림자 도로 위치 / spawn 재조정.

## #4 (후속) start 그림자 순간이동 — 확정 & 일부 보류

- **증상**: 그림자가 start 부근(마스크 바깥)에 발사대보다 높게 형성되면 공중의 차가 그 꼭대기로 순간이동.
- **drill**: `CarSimulator` 지면 구속 `if (gh!==null && y<=gh){y=gh}` 가 "위에서 착지"와 "더 높은 그림자 벽 정면충돌"을 구분 못 함 → 무조건 floor 위로 끌어올림. 재현: x1.99 y2.69 → x2.02 y5.
- **fix (반영)**: `MAX_STEP_UP=0.5` 등판 한계. grounded 추종 또는 상승량 ≤0.5만 올라타고, 그 이상(그림자 벽)은 올라타지 않고 계속 비행→낙하. (그림자=장애물, 순간이동 0.)
  - 처음엔 "낙하 착지 여부"로 엄격 판정했다가 램프 등판 미세 오버슈트를 벽으로 오인(false positive) → step-up 한계 방식으로 교정.
- **보류 (사용자 결정)**: 엔진 fix만 먼저 커밋. L5/L6/L7(compound)은 순간이동으로만 solver 통과하던 상태라 fix 후 자동 검증 불가 → 레벨 재설계는 후속 작업으로 분리. `test/solve.levels.test.js`의 L5~L7 solvable는 명시적 `skip`(사유 기록). **재설계 전 L5~L7 최종 출시 금지.**

## #5 추력 = 접지 마찰만 (공중 추력 금지) — 확정

- **증상**: (1) start에 여전히 초록 발판(visual)이 남아 있음. (2) Go 시 차가 공중에서 추력을 받은 채 전진(발사 시 vx=carSpeed).
- **원칙(사용자)**: 차는 오로지 바퀴 마찰(접지)로만 추력을 얻는다 → 발판/도로에 닿아있지 않으면 추력 0.
- **fix (반영)**:
  - `Renderer.renderPads`: START 발판 박스 제거(라벨만, 그림자도 안 만듦).
  - `CarSimulator`: start가 공중(발사대 startY가 start_x 도로보다 위, 또는 도로 없음)이면 **vx=0**으로 제자리 낙하 — 공중 추력 0. 접지 후에야 마찰 추력으로 가속(정지→carSpeed). 도로에 바로 접지하는 경우만 vx=carSpeed.
  - `GameStateMachine`: **start 도로 마스킹 제거**. 차가 start_x 아래 그림자 도로에 떨어져 접지해야 출발하므로, 그 영역 도로 형성을 막으면 안 됨. (마스킹의 원래 목적인 'PLAN 프리뷰 자동 이동/순간이동'은 프리뷰 핀 + MAX_STEP_UP으로 이미 해결.)
- **결과**: L1~L4 solver 통과(차가 start_x 아래 도로로 낙하·접지 후 우측 주행). L5~L7은 여전히 coarse solver로 검증 불가(skip 유지) — compound 레벨 재설계 대기.
