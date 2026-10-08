// 환율 — 백엔드 GET /fx(원화 기준 KRW per 1 단위)를 한 번 받아 두고, 합계를 지국 통화로 환산해 표시한다.
// 표시용 합산이다. 증빙별 적격/비적격 배분은 서버가 같은 통화 증빙만으로 계산한다.
import { api } from "./api.js";
import { h } from "./ui.js";

const TTL = 10 * 60 * 1000;
let cache = null;
let at = 0;
let inflight = null;

// 통화별 표기 — 한국 관행(원/달러, 원/위안, 100엔당 원)
const NAME = { USD: ["원/달러", 1], EUR: ["원/유로", 1], CNY: ["원/위안", 1], JPY: ["원/100엔", 100] };

// 실패해도 throw 하지 않는다(환율은 부가 정보) — { available: false } 를 돌려준다.
export function loadFx() {
  if (cache && Date.now() - at < TTL) return Promise.resolve(cache);
  inflight ||= api
    .get("/fx")
    .catch(() => ({ available: false, krwPer: {}, branchCurrency: {} }))
    .then((r) => {
      cache = r;
      at = r.available ? Date.now() : Date.now() - TTL + 30_000; // 실패하면 30초 뒤 다시 시도
      inflight = null;
      return r;
    });
  return inflight;
}

export function rateOf(fx, cur) {
  const n = NAME[cur];
  const kp = fx?.available ? fx.krwPer?.[cur] : null;
  return n && kp ? { cur, label: n[0], value: kp * n[1] } : null;
}
export const fmtRate = (v) => v.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// (금액, 통화) → target 통화 금액. 환율을 모르면 null.
export function converter(fx, target) {
  const kp = fx?.available ? fx.krwPer || {} : {};
  return (amount, cur = "USD") => {
    if (amount === null || amount === undefined || amount === "" || Number.isNaN(Number(amount))) return 0;
    if (cur === target) return Number(amount);
    if (!kp[cur] || !kp[target]) return null;
    return (Number(amount) * kp[cur]) / kp[target];
  };
}

// 합계: rows 의 f 필드를 target 으로 환산해 더한다. { total, skipped(환율을 몰라 못 더한 건수), converted(환산해 더한 건수) }
export function sumIn(rows, f, fx, target) {
  const conv = converter(fx, target);
  let total = 0;
  let skipped = 0;
  let converted = 0;
  for (const e of rows) {
    const v = conv(e[f], e.currency || "USD");
    if (v === null) skipped++;
    else {
      total += v;
      if ((e.currency || "USD") !== target && Number(e[f])) converted++;
    }
  }
  return { total, skipped, converted };
}

// 환율 띠 — 현재 환율과 기준일. currencies: 보여 줄 통화 목록(원화 제외).
export function fxStrip() {
  const node = h("div", { class: "fx-strip", role: "note" });
  return {
    node,
    paint(fx, currencies, note) {
      node.replaceChildren();
      const list = [...new Set(currencies)].filter((c) => c && c !== "KRW");
      node.append(h("span", { class: "fx-label" }, "환율"));
      if (!fx?.available) {
        node.append(h("span", { class: "fx-miss" }, "환율을 불러오지 못했습니다 — 다른 통화 금액은 합계에서 제외됩니다"));
        return;
      }
      for (const c of list) {
        const r = rateOf(fx, c);
        if (r) node.append(h("span", { class: "fx-chip" }, h("span", { class: "fx-pair" }, r.label), h("b", {}, fmtRate(r.value))));
      }
      node.append(h("span", { class: "fx-asof" }, `${fx.asOf || ""} 기준`, fx.source ? h("span", { class: "fx-src" }, ` · ${fx.source}`) : null, fx.stale ? " · 갱신 실패, 직전 값" : ""));
      if (note) node.append(h("span", { class: "fx-note" }, note));
    },
  };
}
