# 로컬 개발 환경 제약 (`docs/dev-env.md`)

> 소유자 머신(Windows 10) 기준의 실측 제약. 세션 메모리는 디렉터리 경로에 묶여 있어 리포 구조
> 변경 시 소실되므로, 환경 제약은 이 문서가 진실이다. 새 총괄·워커 세션은 셸 실행 전에 읽을 것.

## pnpm 실행

- pnpm 10.13.1은 **npm 전역 경로**(`C:\Users\home\AppData\Roaming\npm`)에 설치돼 있고, 비대화형
  셸(Claude Code의 PowerShell/Bash)의 기본 PATH에 없다. 셸 상태는 호출 간 비영속이므로 **매 호출마다** 프리픽스:
  - PowerShell: `$env:Path = "C:\Users\home\AppData\Roaming\npm;$env:Path"; pnpm ...`
  - Bash: `export PATH="/c/Users/home/AppData/Roaming/npm:$PATH"; pnpm ...`
- corepack(0.29.4)은 서명 키 회전 버그(`Cannot find matching keyid`)로 실패한다 —
  `COREPACK_INTEGRITY_KEYS=0` 우회가 가능하나, 하위 스크립트의 `pnpm -r`이 다시 PATH를 요구하므로
  **PATH 프리픽스 방식을 표준**으로 한다. corepack enable은 Program Files 권한(EPERM)으로 불가.

## Node·툴체인 버전 고정

- 로컬 Node **v22.11.0**. vitest 4의 rolldown 네이티브 바인딩이 Node ≥ 22.12를 요구해
  **vitest 3으로 고정**돼 있다. Node 승급 시 vitest 4 승격 가능.
- typescript는 typescript-eslint 피어 범위(<6.1.0)로 **6.0.x**, eslint는 eslint-plugin-import
  피어 범위로 **9.x** 고정.

## 포맷터·데이터 보호

- `.prettierignore`에 등재된 무수정 보존 대상을 유지할 것: `docs/`, `fixtures/`, `tools/spike/`,
  `packages/engine/src/data/triangle-data.json`(prettier가 재포맷을 시도한 사고 이력 있음), `.worktrees/`.

## 기타

- git이 LF→CRLF 경고를 출력한다(autocrlf 환경) — 무해. 소스는 LF 기준.
- wrangler는 `workers/gist-proxy`의 devDependency — 전역 설치 없이 해당 디렉터리에서 `pnpm exec wrangler ...`.
