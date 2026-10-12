// 대시보드용 작은 차트 모음 — 외부 라이브러리 없이 SVG/CSS 로 그린다.
// 색은 CSS 클래스(style.css 의 .tone-* / .seg-*)로 입히고, 값만 코드에서 정한다(CSP 상 인라인 스타일 속성은 쓰지 않는다).
import { h } from "./ui.js?v=88cfd8a";

const NS = "http://www.w3.org/2000/svg";
export function s(tag, attrs = {}, ...children) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined && v !== false) el.setAttribute(k, v);
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}

// 통화별 짧은 금액 표기 — 축·범례용. KRW 는 만/억, 그 밖은 K/M
export function compact(n, cur = "USD") {
  const v = Number(n) || 0;
  const a = Math.abs(v);
  const sym = { USD: "$", KRW: "₩", EUR: "€", CNY: "¥", JPY: "¥" }[cur] || "";
  const trim = (x) => String(Math.round(x * 10) / 10).replace(/\.0$/, "");
  if (cur === "KRW") {
    if (a >= 1e8) return `${sym}${trim(v / 1e8)}억`;
    if (a >= 1e4) return `${sym}${Math.round(v / 1e4).toLocaleString()}만`;
    return `${sym}${Math.round(v).toLocaleString()}`;
  }
  if (a >= 1e6) return `${sym}${trim(v / 1e6)}M`;
  if (a >= 1e3) return `${sym}${trim(v / 1e3)}K`;
  return `${sym}${Math.round(v).toLocaleString()}`;
}

// 정상 / 초과 두 단계만 — 한도 이내는 정상, 넘으면 초과
export const toneOfPct = (pct) => (pct > 100 ? "bad" : "ok");

/** 270° 링 게이지 — 한도 사용률. 100% 초과는 가득 채운 빨간 링. */
export function gauge(pct, { label = "한도 사용" } = {}) {
  const r = 62;
  const C = 2 * Math.PI * r;
  const arc = 0.75 * C;
  const shown = Math.max(0, Math.min(pct, 100));
  const tone = toneOfPct(pct);
  const svg = s(
    "svg",
    { viewBox: "0 0 160 160", class: "gauge-svg", role: "img", "aria-label": `${label} ${pct.toFixed(0)}%` },
    s("circle", { cx: 80, cy: 80, r, class: "g-track", "stroke-dasharray": `${arc} ${C}`, transform: "rotate(135 80 80)" }),
    s("circle", { cx: 80, cy: 80, r, class: `g-fill tone-${tone}`, "stroke-dasharray": `${(arc * shown) / 100} ${C}`, transform: "rotate(135 80 80)" }),
  );
  return h(
    "div",
    { class: "gauge" },
    svg,
    h("div", { class: "gauge-center" }, h("div", { class: `gauge-pct tone-text-${tone}` }, pct.toFixed(0), h("small", {}, "%")), h("div", { class: "gauge-label" }, pct > 100 ? "한도 초과" : label)),
  );
}

/** 계정별 한도 막대 — 사용률 채움(초과는 빨강) */
export function limitBar(pct) {
  const tone = toneOfPct(pct);
  const fill = h("span", { class: `lb-fill tone-bg-${tone}` });
  fill.style.width = `${Math.min(Math.max(pct, 0), 100)}%`;
  return h("div", { class: "lb", role: "img", "aria-label": `${pct.toFixed(0)}%` }, fill);
}
