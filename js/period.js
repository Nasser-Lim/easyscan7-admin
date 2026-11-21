// 정산 기간 — 정산 방식(월별/분기별, 서버 설정 /settings/settlement)에 맞춰 기간을 고른다.
// 분기 '2026Q4', 월 '2026-10'. 한 기간의 정산은 다음 기간 초에 하므로 [직전 · 지금] 두 칸을 오간다.
// 조회·출력 화면에서 고른 값은 이 탭에서 기억한다.
import { api } from "./api.js?v=986b221";
import { currentQuarter, h, quarterLabel, quarterOf } from "./ui.js?v=986b221";

const KEY = "es7.period";
const RANGE_KEY = "es7.period.range";
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
export function currentPeriod(mode = MODE) {
  const d = new Date();
  return mode === "month" ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` : currentQuarter(d);
}
// 최근 n개 기간(지금부터 과거로). 기본: 월 12개, 분기 4개
export function periodOptions(n, mode = MODE) {
  const count = n ?? (mode === "month" ? 12 : 4);
  const out = [currentPeriod(mode)];
  while (out.length < count) out.push(prevOf(out[out.length - 1]));
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

// 기간 선택 상자 — '전체' + 최근 기간들(증빙 조회·결재함·정산 출력 공용)
export function periodSelect(value, { all = true, n, cls = "input input-sm" } = {}) {
  const opts = periodOptions(n);
  if (value && matches(value) && !opts.includes(value)) opts.push(value);
  return h("select", { class: cls, "aria-label": `정산 ${unitName()}` },
    all ? h("option", { value: "", selected: !value }, `전체 ${unitName()}`) : null,
    opts.map((p) => h("option", { value: p, selected: p === value }, quarterLabel(p))));
}
export const isPeriodOf = (p) => matches(p);

export const isDateRange = (p) => /^\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}$/.test(p || "");
export const periodCaption = (p) => (isDateRange(p) ? p.replace("..", " ~ ") : quarterLabel(p));

export function savedDateRange() {
  try {
    const range = sessionStorage.getItem(RANGE_KEY);
    return isDateRange(range) ? range : "";
  } catch {
    return "";
  }
}

export function periodControls(value, onChange, options = {}) {
  const manual = isDateRange(value);
  const select = periodSelect(manual ? "" : value, options);
  select.append(h("option", { value: "range" }, "날짜 직접 지정"));
  if (manual) select.value = "range";
  const [start = "", end = ""] = (manual ? value : savedDateRange()).split("..");
  const from = h("input", { class: "input input-sm", type: "date", value: start, required: true, "aria-label": "시작일" });
  const to = h("input", { class: "input input-sm", type: "date", value: end, required: true, "aria-label": "종료일" });
  const range = h("div", { class: "date-range" }, from, h("span", { "aria-hidden": "true" }, "~"), to,
    h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: apply }, "적용"));
  function apply() {
    to.setCustomValidity(from.value && to.value && to.value < from.value ? "종료일은 시작일 이후여야 합니다." : "");
    if (!from.reportValidity() || !to.reportValidity()) return;
    const p = `${from.value}..${to.value}`;
    try { sessionStorage.setItem(RANGE_KEY, p); } catch { /* storage is optional */ }
    onChange(p);
  }
  for (const input of [from, to]) {
    input.addEventListener("input", () => to.setCustomValidity(""));
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") apply(); });
  }
  range.hidden = !manual;
  select.addEventListener("change", () => {
    range.hidden = select.value !== "range";
    if (range.hidden) {
      try { sessionStorage.removeItem(RANGE_KEY); } catch { /* storage is optional */ }
      if (select.value) setPeriod(select.value);
      onChange(select.value);
    } else {
      from.focus();
    }
  });
  return h("div", { class: "period-controls" }, select, range);
}
