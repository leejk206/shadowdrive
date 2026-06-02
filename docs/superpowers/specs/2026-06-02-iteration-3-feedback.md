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
