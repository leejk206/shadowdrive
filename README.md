# ShadowDrive

빛과 그림자로 **길을 설계**해, 추력·중력으로 달리는 자동차를 목표 영역까지 보내는 2.5D 공간 추론 퍼즐. Computer Graphics (Fall 2025) Term Project.

> 고정 광원 앞에서 3D 오브젝트를 **움직이고 회전**시켜 벽에 드리운 **그림자를 도로로** 만들고, "GO" 하면 자동차가 그 그림자 위를 달려 목표에 도달한다.

## 실행

번들러 없이 ES 모듈 + importmap로 동작한다. 정적 서버로 열기만 하면 된다:

```bash
python3 -m http.server 8080 --directory .
# http://localhost:8080/
```

Three.js(r159)는 `vendor/`에 로컬 vendoring 되어 있어 네트워크 의존이 없다.

## 조작

| 입력 | 동작 |
|---|---|
| 좌드래그 (물체) | 아크볼 회전 (잡은 점이 따라옴, 전체 3D) |
| Shift+좌드래그 | 물체 이동 (화면 평면 내) |
| 우드래그 | 카메라 궤도 회전 (선택 물체 중심) |
| 휠 | 카메라 줌 |
| Space / Go | 카운트다운 후 출발 |
| r / Reset | PLAN으로 복귀 |
| 1–7 | 레벨 선택 |

## 게임플레이

- **PLAN**: 가동 오브젝트를 배치·회전해 그림자 도로를 만든다. 광원에는 일정 거리 이상 접근할 수 없다(그림자 과확대 방지).
- **GO**: 3·2·1 카운트다운 → 오브젝트 본체가 사라지고 그림자만 남음 → 자동차 출발.
- **물리**: 평지에선 추력 주행, 내리막 가속, 볼록한 램프 입술에서 발사체로 점프(스키점프), 갭은 실제 포물선으로 비행.
- **성공**: 자동차가 목표 영역(존)에 닿으면 클리어. 도로 아래로 추락하면 실패.

## 구조

```
index.html              # importmap 진입점
vendor/three.module.js  # 로컬 vendored Three.js r159
src/
  core/                 # 렌더 무관 순수 모듈 (node:test 단위테스트)
    mathx.js            # 투영 / convex hull / 수직 span
    shapes.js           # 오클루더 정점 + 3D 변환 + compound(L/T/notch) 분해
    ShadowProjector.js  # 오클루더+광원 → 그림자 폴리곤
    ColliderBuilder.js  # 폴리곤 → floor/ceiling 1D envelope heightfield
    CarSimulator.js     # 탄도+지면구속 물리 / 목표 영역 판정
    GameStateMachine.js # PLAN/GO/CLEAR/FAIL + 광원 접근 클램프
  io/LevelLoader.js     # 레벨 JSON 로드·검증
  ui/InteractionController.js  # 아크볼 회전/이동 + 카메라 분리
  render/Renderer.js    # Three.js 씬·라이팅·캐스트섀도·도로·UI
levels/L1..L7.json      # 데이터 기반 7레벨
test/                   # 코어 모듈 헤드리스 단위/통합 테스트
docs/                   # 설계 스펙 / 구현 계획 / 제출 체크리스트
```

## 테스트

```bash
npm test    # node --test (코어 로직 단위/통합 + 레벨 솔버블/미해결 불변식)
```
