// 지국 카드용 대표 랜드마크 아이콘 — 뉴욕 자유의 여신상, 워싱턴 기념탑, 파리 에펠탑, 베이징 천단, 도쿄 후지산.
// 선 하나로 그린 단색 아이콘(현재 글자색을 따른다). 새 지국은 PATHS 에 항목만 추가하면 된다.
import { s } from "./charts.js?v=60a3df0";

const PATHS = {
  // 자유의 여신상: 받침대·옷자락·머리와 왕관·횃불 든 팔
  newyork: ["M13 43h22", "M16 43v-6h16v6", "M18 37l3-16h6l3 16z", "M21.2 20.5a3 3 0 1 1 5.6 0", "M20.5 15.5l-2.5-2M24 14V10M27.5 15.5l2.5-2", "M27.5 22.5l4.5-11.5", "M29.6 11.5h4.8l-.9-3.8h-3z"],
  // 워싱턴 기념탑: 오벨리스크와 반사 연못
  washington: ["M20.5 40l1.6-24L24 8l1.9 8 1.6 24z", "M22 16h4", "M13 40h22", "M16 44h16"],
  // 에펠탑: 다리·교차 보·전망대·아치
  paris: ["M24 5v7", "M24 12l-4 16-5 15M24 12l4 16 5 15", "M21.4 20h5.2", "M18.6 28h10.8", "M17.5 35.5h13", "M17.5 43c1.5-6 4-9 6.5-9s5 3 6.5 9"],
  // 천단(기년전): 3층 처마와 기단
  beijing: ["M19 11c2-3 8-3 10 0z", "M14 21c3-5 17-5 20 0z", "M9 32c4-7 26-7 30 0z", "M16 32v9M32 32v9M24 32v9", "M8 43h32"],
  // 후지산: 능선과 눈 덮인 정상
  tokyo: ["M5 41L19 16h10l14 25z", "M19 16l3.5 4 2.5-3.5 3 3.5 1-4", "M5 41h38"],
};

/** 지국 ID → 아이콘 SVG (없으면 null) */
export function branchIcon(id) {
  const paths = PATHS[id];
  if (!paths) return null;
  return s("svg", { viewBox: "0 0 48 48", class: "bi-svg", fill: "none", stroke: "currentColor", "stroke-width": "1.7", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" }, paths.map((d) => s("path", { d })));
}
