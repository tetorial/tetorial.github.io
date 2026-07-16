// 공통 네비게이션 정의 (apps-web §2 공통 셸 — 헤더 네비 슬롯).
// v1 네비는 홈/리플레이 2링크. 후속 마일스톤(가이드 축)의 섹션 네비가 이 슬롯에 추가된다.
export interface NavLink {
  href: string; // withBase 미적용 상대 경로 — Layout이 withBase로 감싼다
  label: string;
}

export const PRIMARY_NAV: NavLink[] = [
  { href: "/", label: "홈" },
  { href: "/replay", label: "리플레이" },
];
