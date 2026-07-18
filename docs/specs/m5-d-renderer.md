# Tetorial 명세: 하이라이트 외곽선 렌더링 (@tetorial/renderer)

> 상태: M5 W5-2a (#54 U-7의 renderer 축) · 관련 모듈: **packages/renderer 단독**
> 역할: **하이라이트 오버레이를 셀 채움에서 흰색 inside 외곽선(오토 타일링)으로 바꾼다 — 하이라이트 영역의 바깥 윤곽만 남긴다.**
>
> 현행 (2026-07-18 실측): `drawHighlights`(`src/draw.ts`)가 `theme.highlight`(반투명 노랑)로 셀 전체를 `fillRect`. 기존 테스트(`board-renderer.test.ts`)는 `fillStyle === theme.highlight`인 fillRect를 찾는 방식.

## 1. 경계 / 책임

- 수정 범위는 **packages/renderer뿐이다.** `drawHighlights`와 `theme.ts`의 highlight 관련만 — 다른 그리기 경로(보드·falling·ghost·effects) 불변.
- 공개 API 표면 불변: 함수 시그니처·`RenderFrame`·`RendererOptions` 변경 없음. `Theme.highlight`는 **의미만 재정의**(채움색 → 외곽선 색)하고 주석을 갱신한다.
- 하지 않는 것: 하이라이트 저작 로직(sim, W5-2a 병렬 세션) · 팔레트 UI(apps/web, W5-2b) · 애니메이션.

## 2. 그리기 규범(規範)

- **RD-8 외곽선**: 하이라이트 셀을 채우지 않는다. 셀 경계 **안쪽**(inside)에 `theme.highlight` 색으로 스트로크를 그린다.
  - 기본 테마의 highlight 값을 **불투명 흰색 `#ffffff`** 로 교체한다 (`theme.ts`, 주석 포함).
  - 선 두께: `cellSize`에 비례(권장 `max(1, round(cellSize / 8))`), inside — 셀 밖으로 삐져나가지 않는다. 정확한 계수는 재량이나 **비례+최소 1px+inside는 규범**.
- **RD-9 오토 타일링**: 셀의 4변 각각에 대해, 그 방향의 이웃 셀이 하이라이트면 **그 변의 스트로크를 생략**한다. 결과적으로 인접 하이라이트 묶음은 바깥 윤곽만 남는다.
  - 이웃 판정은 `highlights` 인코딩 데이터 기준(보드 좌표 전체, 행 부재/문자 부재 = 비하이라이트).
  - **가시 클리핑과 분리**: 셀 그리기 여부는 현행 `isVisibleCell` 규칙 그대로, 이웃 판정은 데이터 기준 — 가시 경계 밖의 하이라이트 이웃도 이웃이다(경계에서 윤곽이 임의로 닫히지 않게).
  - 코너 이음은 재량(선분을 셀 변 전체 길이로 그리면 자연히 이어진다).
- 대각 이웃은 무시한다(4-이웃만).
- `renderThumbnail`도 같은 `drawHighlights`를 경유하므로 자동으로 동일 규범을 따른다 — 별도 분기 금지.

## 3. 기존 테스트 처리

- `board-renderer.test.ts`의 하이라이트 관련 기존 검증(채움 fillRect 탐지)은 새 규범(스트로크 탐지)으로 갱신한다. **기존 테스트 이름의 수용 기준 ID(RD-1~7)는 유지**하고 검증 내용만 바꾼다 — ID를 지우면 check-acceptance 대조가 깨진다.

## 수용 기준 (작업 세션 완료 조건)

- **RD-8 하이라이트 외곽선**: drawHighlights가 셀 채움 대신 흰색 inside 스트로크로 그린다 — 채움 fillRect 부재 + 스트로크 색/두께/inside 검증, 커스텀 theme.highlight 반영 포함
- **RD-9 오토 타일링**: 인접 하이라이트 셀의 맞닿은 변은 스트로크 생략 (바깥 윤곽만 남음) — 단독 셀 4변 / 가로 2연 셀의 맞닿은 변 생략 / ㄱ자 배치 윤곽 검증

## 참고자료

- #54 (U-7) — 이슈 본문에 전체 그림(팔레트·토글은 타 세션)
- D-21 (더미 셀·overlays 저작 UI 구현 확정 — 이 축의 근거)
- 테스트 기법: 기존 fake ctx 연산 기록 방식(`board-renderer.test.ts`) 재사용
