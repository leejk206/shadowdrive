# ShadowDrive — 제출 체크리스트 (Submission Checklist)

> 마감: **2026-06-05 자정**. 대표자 1인이 제목 / 팀 / URL / 영상 링크를 제출한다.

## 1. 라이브 동작 확인 (Live URL)
- [ ] 배포된 **라이브 URL**이 브라우저에서 정상 실행된다 (페이지 로드 → L1 자동 표시).
- [ ] 1~7 키로 L1~L7 전 레벨 전환이 동작한다.
- [ ] drag(이동) / wheel(회전) / shift+wheel(깊이) / space(Go) / r(reset) 인터랙션 정상.
- [ ] **콘솔 에러 0건** (개발자 도구 Console 탭에서 확인).

## 2. 기타 사용 기능 (외부 라이브러리 고지)
- **three.js** (r159, `vendor/three.module.js`로 벤더링, importmap 로드) — WebGL 렌더링 / 직교 카메라 / 광원·메시 표현에 사용.
  - 그 외 게임 로직(그림자 투영 `ShadowProjector`, 충돌체 빌드 `ColliderBuilder`, 차량 시뮬 `CarSimulator`, 상태머신, 레벨 로더)은 **전부 직접 구현**.

## 3. 직접 구현 기술 항목 (Tech Writeup)
- **그림자 투영 (Shadow Projection)**: 평행/점 광원 기반으로 오클루더를 벽(z=0) 평면에 투영해 heightfield(floor/ceiling) 생성 — `src/core/ShadowProjector.js`.
- **그림자 길이 = 지형**: 광원 위치에 따라 그림자 길이가 변하고, 그것이 곧 주행 가능한 도로(높이장)가 되는 핵심 메커닉.
- **충돌체 빌드**: heightfield → 주행 가능 콜라이더(경사/갭/천장) 변환 — `src/core/ColliderBuilder.js`.
- **차량 시뮬레이션**: 중력·경사 등반 한계(maxClimbDeg)·갭 통과 비율(gapPassRatio) 기반 전진 적분 — `src/core/CarSimulator.js`.
- **상태머신**: PLAN ↔ GO ↔ 결과(CLEAR/FAIL) 전이 관리 — `src/core/GameStateMachine.js`.
- **레벨 로더 / 스키마 검증**: JSON 레벨 정의 로드 + 유효성 검사 — `src/io/LevelLoader.js`.
- **인터랙션 컨트롤러**: 가동 오클루더 picking / 이동 / 회전 / 깊이 조정 — `src/ui/InteractionController.js`.
- **렌더러(시각화)**: 단색 배경 + 단일 강광원 + 강명암 미니멀 룩. 도로는 채워진 리본 메시로 표현 — `src/render/Renderer.js`.
- **테스트**: 코어 로직 단위/통합 테스트 55개 (node --test) 전부 통과.

## 4. 데모 영상 (3분)
- [ ] 길이 **3분 이내**.
- [ ] **L1 → L7 순서**로 각 레벨 클리어 시연 (그림자 조작 → Go → CLEAR).
- [ ] 그림자 길이 메커닉(광원 기즌모로 광원 위치 가시화)을 영상에서 설명.
- [ ] 영상 링크(YouTube 등)를 제출 폼에 기재.

## 5. 제출물 (ProjectTitle.zip)
- [ ] `ProjectTitle.zip`에 **전체 소스코드**(`src/`, `levels/`, `vendor/`, `test/`, `index.html`, `package.json`) 포함.
- [ ] **Project.pdf**(보고서, `ReportFormat.docx` 양식 기반) 포함.
- [ ] zip 파일명·보고서 제목 = 프로젝트 제목과 일치.

## 6. 제출 폼 (대표자 1인)
- [ ] **제목 (Title)**: ShadowDrive
- [ ] **팀 (Team)**: (팀원 명단)
- [ ] **라이브 URL**: (배포 주소)
- [ ] **영상 링크 (Video)**: (데모 영상 URL)
- [ ] 제출 마감 **2026-06-05 자정** 이전 완료.
