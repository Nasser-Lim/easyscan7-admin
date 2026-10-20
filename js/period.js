// 정산 기간 — 정산 방식(월별/분기별, 서버 설정 /settings/settlement)에 맞춰 기간을 고른다.
// 분기 '2026Q4', 월 '2026-10'. 한 기간의 정산은 다음 기간 초에 하므로 [직전 · 지금] 두 칸을 오간다.
// 고른 값은 이 탭에서 기억해 홈·증빙 업로드(한도 현황)가 같은 기간을 본다.
import { api } from "./api.js?v=2cd17b8";
import { currentQuarter, h, quarterLabel, quarterOf } from "./ui.js?v=2cd17b8";

const KEY = "es7.period";
let MODE = "quarter";
let INFO = null;

// 로그인 직후 한 번 — 실패하면 분기별(기존 동작)
export async function loadMode() {
  try {
    INFO = await api.get("/settings/settlement");
    MODE = INFO.mode === "month" ? "month" : "quarter";
  } catch {
    MODE = "quarter";
  }
  return MODE;
}
export const getMode = () => MODE;
export const modeInfo = () => INFO;
export function setMode(m, info) {
  MODE = m === "month" ? "month" : "quarter";
  if (info) INFO = info;
}
export const unitName = () => (MODE === "month" ? "월" : "분기");

const monthOf = (d) => (/^\d{4}-\d{2}/.test(d || "") ? d.slice(0, 7) : null);
function prevOf(p) {
  if (/Q/.test(p)) {
    const [y, n] = p.split("Q").map(Number);
    return n === 1 ? `${y - 1}Q4` : `${y}Q${n - 1}`;
  }
  const [y, m] = p.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}
export function currentPeriod() {
  const d = new Date();
  return MODE === "month" ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` : currentQuarter(d);
}
// 최근 n개 기간(지금부터 과거로). 기본: 월 12개, 분기 4개
export function periodOptions(n = MODE === "month" ? 12 : 4) {
  const out = [currentPeriod()];
  while (out.length < n) out.push(prevOf(out[out.length - 1]));
  return out;
}
// 증빙이 속한 정산 기간 — 서버가 준 month/quarter(사용일 또는 직접 지정)
export function periodOfEntry(e) {
  if (MODE === "month") return e.month || monthOf(e.txnDate) || null;
  return e.quarter || quarterOf(e.txnDate);
}
const matches = (p) => (MODE === "month" ? /^\d{4}-\d{2}$/.test(p || "") : /^\d{4}Q[1-4]$/.test(p || ""));

// [직전, 지금]
export function periodChoices() {
  const cur = currentPeriod();
  return [prevOf(cur), cur];
}

export function getPeriod() {
  const choices = periodChoices();
  try {
    const v = sessionStorage.getItem(KEY);
    if (matches(v) && choices.includes(v)) return v;
  } catch {
    /* 저장소를 못 쓰면 기본값 */
  }
  return choices[1];
}

export function setPeriod(p) {
  try {
    sessionStorage.setItem(KEY, p);
  } catch {
    /* 메모리에만 */
  }
}

const shortLabel = (p) => (/Q/.test(p) ? p.replace("Q", " Q") : `${p.slice(0, 4)}.${p.slice(5)}`);

// 기간 전환 스위치 — [직전 | 지금] 두 칸. onChange(p) 는 값이 바뀔 때만 부른다.
export function periodSwitch(onChange) {
  const [prev, cur] = periodChoices();
  let value = getPeriod();
  const seg = (p) => {
    const b = h("button", { class: "period-seg", type: "button", role: "radio", title: quarterLabel(p), dataset: { p } }, h("span", { class: "period-q" }, shortLabel(p)));
    b.addEventListener("click", () => {
      if (p === value) return;
      value = p;
      setPeriod(p);
      paint();
      onChange(p);
    });
    return b;
  };
  const segs = [seg(prev), seg(cur)];
  const node = h("div", { class: "period-switch", role: "radiogroup", "aria-label": `정산 ${unitName()}` }, h("span", { class: "period-label" }, `정산 ${unitName()}`), h("div", { class: "period-segs" }, segs));
  function paint() {
    for (const b of segs) {
      const on = b.dataset.p === value;
      b.classList.toggle("on", on);
      b.setAttribute("aria-checked", on ? "true" : "false");
    }
  }
  paint();
  return node;
}

// 기간 선택 상자 — '전체' + 최근 기간들(증빙 조회·결재함·정산 출력 공용)
export function periodSelect(value, { all = true, n, cls = "input input-sm" } = {}) {
  const opts = periodOptions(n);
  if (value && matches(value) && !opts.includes(value)) opts.push(value);
  return h("select", { class: cls, "aria-label": `정산 ${unitName()}` },
    all ? h("option", { value: "", selected: !value }, `전체 ${unitName()}`) : null,
    opts.map((p) => h("option", { value: p, selected: p === value }, quarterLabel(p))));
}
export const isPeriodOf = (p) => matches(p);
