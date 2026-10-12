// 대시보드용 작은 차트 모음 — 외부 라이브러리 없이 SVG/CSS 로 그린다.
// 색은 CSS 클래스(style.css 의 .tone-* / .seg-*)로 입히고, 값만 코드에서 정한다(CSP 상 인라인 스타일 속성은 쓰지 않는다).
import { h } from "./ui.js?v=25c4b60";

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

export const toneOfPct = (pct) => (pct > 100 ? "bad" : pct >= 80 ? "warn" : "ok");

/** 270° 링 게이지 — 한도 사용률. 80% 지점에 눈금, 100% 초과는 가득 채운 빨간 링. */
export function gauge(pct, { label = "한도 사용", size = 168 } = {}) {
  const r = 62;
  const C = 2 * Math.PI * r;
  const arc = 0.75 * C;
  const shown = Math.max(0, Math.min(pct, 100));
  const tone = toneOfPct(pct);
  // 80% 눈금 — 링 시작(135°)에서 270° 의 80% 지점
  const ang = ((135 + 270 * 0.8) * Math.PI) / 180;
  const tick = s("line", { x1: 80 + (r - 11) * Math.cos(ang), y1: 80 + (r - 11) * Math.sin(ang), x2: 80 + (r + 11) * Math.cos(ang), y2: 80 + (r + 11) * Math.sin(ang), class: "g-tick" });
  const svg = s(
    "svg",
    { viewBox: "0 0 160 160", class: "gauge-svg", role: "img", "aria-label": `${label} ${pct.toFixed(0)}%` },
    s("circle", { cx: 80, cy: 80, r, class: "g-track", "stroke-dasharray": `${arc} ${C}`, transform: "rotate(135 80 80)" }),
    s("circle", { cx: 80, cy: 80, r, class: `g-fill tone-${tone}`, "stroke-dasharray": `${(arc * shown) / 100} ${C}`, transform: "rotate(135 80 80)" }),
    tick,
  );
  return h(
    "div",
    { class: "gauge" },
    svg,
    h("div", { class: "gauge-center" }, h("div", { class: `gauge-pct tone-text-${tone}` }, pct.toFixed(0), h("small", {}, "%")), h("div", { class: "gauge-label" }, pct > 100 ? "한도 초과" : label)),
  );
}

/** 도넛 — 구성비. segs: [{label, value, cls}] */
export function donut(segs, { center, sub } = {}) {
  const r = 52;
  const C = 2 * Math.PI * r;
  const total = segs.reduce((a, x) => a + x.value, 0);
  const svg = s("svg", { viewBox: "0 0 140 140", class: "donut-svg", role: "img" }, s("circle", { cx: 70, cy: 70, r, class: "d-track" }));
  let off = 0;
  if (total > 0) {
    for (const x of segs) {
      if (x.value <= 0) continue;
      const len = (x.value / total) * C;
      const gap = segs.filter((y) => y.value > 0).length > 1 ? 2 : 0;
      svg.append(s("circle", { cx: 70, cy: 70, r, class: `d-seg ${x.cls}`, "stroke-dasharray": `${Math.max(len - gap, 0.5)} ${C}`, "stroke-dashoffset": -off, transform: "rotate(-90 70 70)" }, s("title", {}, `${x.label} ${((x.value / total) * 100).toFixed(0)}%`)));
      off += len;
    }
  }
  return h("div", { class: "donut" }, svg, h("div", { class: "donut-center" }, h("div", { class: "donut-n" }, center ?? ""), sub ? h("div", { class: "donut-sub" }, sub) : null));
}

const nice = (max, n = 4) => {
  const raw = max / n || 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const f = raw / mag;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
};

/**
 * 분기 누적 지출 추이 — 날짜별 누적(영역+선)을 한도선·균등 소진선과 함께 그린다.
 * { days, points:[누적 값(0..lastDay)], limit, today(일 인덱스|null), months:[{day,label}], cur }
 */
export function trendChart({ days, points, limit, today, months, cur }) {
  const W = 640;
  const H = 250;
  const pad = { l: 56, r: 18, t: 18, b: 30 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const last = points.length ? points[points.length - 1] : 0;
  const top = Math.max((limit || 0) * 1.12, last * 1.12, 1);
  const step = nice(top, 4);
  const yMax = Math.ceil(top / step) * step;
  const x = (d) => pad.l + (iw * d) / Math.max(days - 1, 1);
  const y = (v) => pad.t + ih - (ih * v) / yMax;

  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, class: "trend-svg", role: "img", "aria-label": "분기 누적 지출 추이" });
  for (let v = 0; v <= yMax + 1e-9; v += step) {
    svg.append(s("line", { x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v), class: v === 0 ? "t-axis" : "t-grid" }), s("text", { x: pad.l - 8, y: y(v) + 4, class: "t-ytick", "text-anchor": "end" }, compact(v, cur)));
  }
  for (const m of months) {
    svg.append(s("line", { x1: x(m.day), x2: x(m.day), y1: pad.t + ih, y2: pad.t + ih + 4, class: "t-axis" }), s("text", { x: x(m.day) + 4, y: H - 8, class: "t-xtick" }, m.label));
  }
  if (limit > 0) {
    // 균등 소진 기준선 — 분기 내내 같은 속도로 쓴다면 지나가는 길
    svg.append(s("line", { x1: x(0), y1: y(0), x2: x(days - 1), y2: y(limit), class: "t-pace" }));
    svg.append(s("line", { x1: pad.l, x2: W - pad.r, y1: y(limit), y2: y(limit), class: "t-limit" }), s("text", { x: W - pad.r, y: y(limit) - 6, class: "t-limit-label", "text-anchor": "end" }, `한도 ${compact(limit, cur)}`));
  }
  if (points.length) {
    const line = points.map((v, d) => `${d ? "L" : "M"}${x(d).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
    const area = `${line} L${x(points.length - 1).toFixed(1)},${y(0)} L${x(0)},${y(0)} Z`;
    svg.append(s("path", { d: area, class: "t-area" }), s("path", { d: line, class: "t-line" }));
    const d = points.length - 1;
    const over = limit > 0 && last > limit;
    svg.append(s("circle", { cx: x(d), cy: y(last), r: 4.5, class: `t-dot${over ? " bad" : ""}` }, s("title", {}, `누적 ${compact(last, cur)}${limit > 0 ? ` · 한도의 ${((last / limit) * 100).toFixed(0)}%` : ""}`)));
    svg.append(s("text", { x: Math.min(x(d), W - pad.r - 4), y: y(last) - 11, class: `t-now${over ? " bad" : ""}`, "text-anchor": x(d) > W - 90 ? "end" : "middle" }, compact(last, cur)));
  }
  if (today !== null && today !== undefined) svg.append(s("line", { x1: x(today), x2: x(today), y1: pad.t, y2: pad.t + ih, class: "t-today" }), s("text", { x: x(today), y: pad.t - 5, class: "t-today-label", "text-anchor": "middle" }, "오늘"));
  return h("div", { class: "trend" }, svg);
}

/** 한 줄 누적 막대 — 결재 단계별 건수 비중. segs: [{label, n, cls}] */
export function stackBar(segs) {
  const total = segs.reduce((a, x) => a + x.n, 0);
  const bar = h("div", { class: "stackbar", role: "img", "aria-label": "결재 단계별 비중" });
  if (!total) {
    bar.append(h("span", { class: "stack-empty" }));
    return bar;
  }
  for (const x of segs) {
    if (!x.n) continue;
    const seg = h("span", { class: `stack-seg ${x.cls}`, title: `${x.label} ${x.n}건` });
    seg.style.flexGrow = String(x.n);
    bar.append(seg);
  }
  return bar;
}

/** 계정별 한도 막대 — 사용률 채움 + 80% 눈금(초과분은 빨강) */
export function limitBar(pct) {
  const tone = toneOfPct(pct);
  const fill = h("span", { class: `lb-fill tone-bg-${tone}` });
  fill.style.width = `${Math.min(Math.max(pct, 0), 100)}%`;
  return h("div", { class: "lb", role: "img", "aria-label": `${pct.toFixed(0)}%` }, fill, h("span", { class: "lb-tick", "aria-hidden": "true" }));
}
