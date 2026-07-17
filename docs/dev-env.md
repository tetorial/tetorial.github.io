# 로컬 개발 환경 제약 (`docs/dev-env.md`)

> 소유자 머신(Windows 10) 기준의 실측 제약. 세션 메모리는 디렉터리 경로에 묶여 있어 리포 구조
> 변경 시 소실되므로, 환경 제약은 이 문서가 진실이다. 새 총괄·워커 세션은 셸 실행 전에 읽을 것.

## pnpm 실행

- pnpm 10.13.1은 npm 전역 경로(`C:\Users\home\AppData\Roaming\npm`)에 설치돼 있고, 이 경로가
  **Windows 사용자 환경 변수 PATH에 등록돼 있다**(2026-07-17) — 비대화형 셸에서도 `pnpm` 직접 호출 가능.
  `pnpm --version`이 실패하면 등록이 풀린 것이니 이 절차를 복구할 것.
- corepack(0.29.4)은 서명 키 회전 버그(`Cannot find matching keyid`)로 실패하고, corepack enable은
  Program Files 권한(EPERM)으로 불가 — **corepack을 쓰지 않는다.**

## Node·툴체인 버전 고정

- 로컬 Node **v22.11.0**. vitest 4의 rolldown 네이티브 바인딩이 Node ≥ 22.12를 요구해
  **vitest 3으로 고정**돼 있다. Node 승급 시 vitest 4 승격 가능(#28).
- typescript는 typescript-eslint 피어 범위(<6.1.0)로 **6.0.x**, eslint는 eslint-plugin-import
  피어 범위로 **9.x** 고정.

## 포맷터·데이터 보호

- 무수정 보존 대상의 진실은 `.prettierignore`다 — 대상과 사유는 그 파일의 주석 참조. 여기 복사하지 않는다.

## 기타

- git이 LF→CRLF 경고를 출력한다(autocrlf 환경) — 무해. 소스는 LF 기준.
- wrangler는 `workers/gist-proxy`의 devDependency — 전역 설치 없이 해당 디렉터리에서 `pnpm exec wrangler ...`.
