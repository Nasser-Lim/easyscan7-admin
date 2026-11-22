// DOM·포맷 헬퍼. CSP(style-src 'self') 때문에 HTML 문자열에 style 속성을 쓰지 않는다 — 요소를 직접 만든다.

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style") Object.assign(el.style, v);
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k === "html") el.innerHTML = v; // 정적 SVG 아이콘 전용
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

// ── 아이콘 (정적 SVG) ──
const ICONS = {
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  upload: '<path d="M12 16V4m0 0-4.5 4.5M12 4l4.5 4.5"/><path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 17l-5-5 5-5M5 12h11"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  pdf: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M8.5 15.5h7M8.5 12h4"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="M5 12.5 10 17l9-10"/>',
  alert: '<path d="M12 4 2.5 20h19z"/><path d="M12 10v4.5"/><circle cx="12" cy="17.2" r=".6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><circle cx="12" cy="7.8" r=".6"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4.3 1.7c-1.1 1-1.8 1.3-1.8 2.6"/><circle cx="12" cy="16.7" r=".6"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 6.3"/><path d="M20 5v6h-6"/>',
  send: '<path d="M4 12 20 4l-6 16-3-7z"/><path d="m11 13 9-9"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  expand: '<path d="M9 4H4v5m11-5h5v5m0 6v5h-5m-6 0H4v-5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  sliders: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  shield: '<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6z"/><path d="m8.8 12.2 2.3 2.3 4.2-4.6"/>',
  print: '<path d="M7 9V3h10v6M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"/><path d="M7 14h10v7H7z"/>',
  receipt: '<path d="M5 3l2 1.5L9 3l3 1.5L15 3l2 1.5L19 3v18l-2-1.5-2 1.5-3-1.5L9 21l-2-1.5L5 21zM8 8h8m-8 4h8m-8 4h5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  bell: '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9zm-8 12a2 2 0 0 0 4 0"/>',
  pin: '<path d="M20 10c0 5-8 11-8 11s-8-6-8-11a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  return: '<path d="M9 6l-5 5 5 5m-5-5h10a5 5 0 0 1 5 5v2"/>',
  edit: '<path d="m4 16-1 5 5-1L21 7l-4-4L4 16Zm10-10 4 4"/>',
};
export function icon(name, cls = "ic") {
  return h("span", {
    class: cls,
    "aria-hidden": "true",
    html: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ""}</svg>`,
  });
}

// ── 업무 상수 ──
export const BRANCH = { newyork: "뉴욕", washington: "워싱턴" };
export const ACCOUNTS = ["경상비", "취재비", "차량유지비"]; // 한도·AI 검증·결재 대상(세 계정)
// 그 밖의 계정 — 결재 없이 '보관'으로 제출되고 정산서 시트에 계정별로 합산된다(백엔드 accounts.py 와 같은 목록)
export const OTHER_ACCOUNTS = [
  "체재비", "사무실 임차료", "건강보험료", "통신비", "통신수신비", "차량관련비(주차료)", "차량관련비(통행료 및 수리비)",
  "현지채용인 급여.시간외수당.상여", "현지채용인 의료비지원", "현지채용인 교통비지원", "급여조정표", "소방서 연납 비용",
];
export const ALL_ACCOUNTS = [...ACCOUNTS, ...OTHER_ACCOUNTS];
export const NON_REVIEW_ACCOUNT_LABEL = "비결재 · 기타";
let bureauCatalog = null;
export function updateCatalog(branch, accounts) {
  if (branch === "newyork" && accounts) bureauCatalog = accounts;
}
export const isCoreAccount = (a) => ACCOUNTS.includes(a);
export function resubmittedBadge(entry) {
  const resubmission = [...(entry.approvals || [])].reverse().find((a) => a.action === "submit");
  if (resubmission?.from !== "returned" || entry.status === "returned") return null;
  return h("span", { class: "resubmitted", title: resubmission.comment || "반려 후 다시 제출했습니다" }, "재제출");
}
// 계정 선택 상자 — 세 계정 먼저, 그 밖은 비결재 계정 묶음
export function accountSelect(value, attrs = {}, { blank, branch } = {}) {
  const opt = (a, label = a) => h("option", { value: a, selected: a === value }, label);
  const other = bureauCatalog
    ? Object.keys(bureauCatalog).filter((a) => !isCoreAccount(a) && (bureauCatalog[a].enabled || a === value))
    : OTHER_ACCOUNTS;
  return h("select", { class: "input", ...attrs },
    blank ? opt("", blank) : null,
    h("optgroup", { label: "결재 대상" }, ACCOUNTS.map((a) => opt(a))),
    branch === "washington" ? null : h("optgroup", { label: NON_REVIEW_ACCOUNT_LABEL }, other.map((a) => opt(a))));
}
export const STATUS = {
  // 이름 규칙: 「지금 처리해야 하는 주체 + 행위」 — 누구 차례인지 바로 보이게
  draft: { label: "지국 작성중", cls: "chip-neutral" },
  flagged: { label: "지국 검토 필요", cls: "chip-neutral" },
  returned: { label: "지국 수정 필요(반려)", cls: "chip-bad" },
  submitted: { label: "보도BIZ팀 결재중", cls: "chip-info" },
  chief_review: { label: "보도국장 결재중", cls: "chip-info" },
  finance_review: { label: "재무팀 결재중", cls: "chip-info" },
  approved: { label: "결재 완료", cls: "chip-ok" },
  rejected: { label: "보도국장 불승인", cls: "chip-bad" },
  filed: { label: "제출 완료(보관)", cls: "chip-ok" },
  deleted: { label: "삭제됨", cls: "chip-muted" },
};
// 상태 묶음 — 백엔드 services/workflow.py 와 같은 규칙
export const WRITING_STATUSES = new Set(["draft", "flagged"]);
export const STAFF_EDITABLE = new Set([...WRITING_STATUSES, "returned"]);
export const IN_REVIEW = new Set(["submitted", "chief_review", "finance_review"]);
export const FINAL = new Set(["approved", "rejected", "deleted"]);
export const ELIGIBILITY = { eligible: ["적격", "ok"], ineligible: ["비적격", "bad"] };
export const REVIEWER_ROLES = new Set(["imc", "bureau_chief", "division_head", "finance", "admin"]);
export const ACTION_LABEL = { submit: "제출", withdraw: "제출 취소", approve: "승인", return: "반려", reject: "불승인", cancel: "결재 취소" };
// AI 1차 적격 검증(gate) 판정 — 백엔드 services/ai_gate.py 와 같은 값
export const AI_VERDICT = {
  pass: { label: "AI 검증 통과", tone: "ok" },
  fail: { label: "AI 정책 위반", tone: "bad" },
  override: { label: "AI 위반 · 지국 소명", tone: "warn" },
  uncertain: { label: "AI 판단 보류", tone: "warn" },
  skipped: { label: "AI 정책 없음", tone: "muted" },
  error: { label: "AI 검증 실패", tone: "warn" },
};
// AI 적격 정책 버전 표기 — 저장할 때마다 0.1 씩(1.0 → 1.1 → 1.2 …). 내부 값은 저장 횟수(정수)
export const policyVer = (n) => (n == null || n === "-" ? "-" : `v${(1 + (Number(n) - 1) / 10).toFixed(1)}`);
export function aiKey(gate) {
  if (!gate?.verdict) return null;
  return gate.verdict === "fail" && gate.override ? "override" : gate.verdict;
}
export const ROLE = {
  staff: "지국 담당자", imc: "보도BIZ팀", bureau_chief: "보도국장",
  division_head: "보도본부장", finance: "재무팀", admin: "관리자",
};
// 저장된 결재 이력과 구버전 API의 팀 표기도 화면에서는 현재 이름으로 보인다.
export const displayTeamName = (text) => String(text ?? "").replace(/보도[ \t]*IMC(?:[ \t]*팀)?|IMC[ \t]*팀/g, ROLE.imc);
export const ACCT = { shared: "지국 공용 계정", personal: "개인 계정", anon: "익명" };
export const DOC_TYPE = {
  CARD_SLIP: "카드 결제 영수증", ITEMIZED_GUEST_CHECK: "식당 계산서", ONLINE_ORDER_INVOICE: "온라인 주문",
  FUEL_RECEIPT: "주유 영수증", COMMERCIAL_BILL: "청구서", OTHER: "기타",
};
export const NOTICE = {
  DUPLICATE_MERGED: ["중복 병합", "info"],
  CONTINUATION_MERGED: ["이어진 페이지 병합", "info"],
  SAME_ORDER_MERGED: ["같은 주문 병합", "warn"],
  ORPHAN_CONTINUATION: ["앞 문서 없음", "warn"],
  ORDER_EXISTS: ["주문번호 중복", "warn"],
  DATE_OUT_OF_PERIOD: ["기간 밖 날짜", "warn"],
  QUARTER_OUTLIER: ["분기 확인", "warn"],
  PAGE_IGNORED: ["제외된 페이지", "neutral"],
  PAGE_FAILED: ["인식 실패", "bad"],
  PAGES_TRUNCATED: ["페이지 초과", "bad"],
};
export function noticeParts(msg) {
  const code = String(msg).split(":", 1)[0];
  const [label, tone] = NOTICE[code] || ["알림", "neutral"];
  const text = String(msg).includes(":") ? String(msg).slice(code.length + 1).trim() : String(msg);
  return { code, label, tone, text };
}

// ── 포맷 ──
export function money(n, cur = "USD") {
  if (n === null || n === undefined || n === "" || Number.isNaN(Number(n))) return "—";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: cur || "USD" }).format(Number(n));
  } catch {
    return `${cur} ${Number(n).toFixed(2)}`;
  }
}
export function dateText(v) {
  if (!v) return "—";
  const s = String(v);
  return s.length >= 10 ? s.slice(0, 10) : s;
}
export function dateTime(v) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
export function currentQuarter(d = new Date()) {
  return `${d.getFullYear()}Q${Math.floor(d.getMonth() / 3) + 1}`;
}
export function quarterOptions(n = 4) {
  const out = [];
  const d = new Date();
  let y = d.getFullYear();
  let q = Math.floor(d.getMonth() / 3) + 1;
  for (let i = 0; i < n; i++) {
    out.push(`${y}Q${q}`);
    q -= 1;
    if (q === 0) {
      q = 4;
      y -= 1;
    }
  }
  return out;
}
export function quarterOf(date) {
  const m = /^(\d{4})-(\d{2})/.exec(date || "");
  if (!m) return null;
  const mo = Number(m[2]);
  return mo >= 1 && mo <= 12 ? `${m[1]}Q${Math.floor((mo - 1) / 3) + 1}` : null;
}
export const QUARTER_SOURCE = { date: "영수증 날짜 기준", manual: "직접 지정", upload: "날짜 미인식 · 업로드 분기" };
// 분기 배지 — 사용일 아래 작게. 이번 분기는 파란 톤, 나머지는 회색. 예: 2026 Q2
export function quarterBadge(q) {
  const m = /^(\d{4})Q([1-4])$/.exec(q || "");
  if (!m) return null;
  return h("span", { class: `q-badge${q === currentQuarter() ? " cur" : ""}`, title: quarterLabel(q) }, `${m[1]} Q${m[2]}`);
}
// 정산 기간 표기 — 분기 '2026Q4' → '2026년 4분기', 월 '2026-10' → '2026년 10월'
export function quarterLabel(q) {
  const m = /^(\d{4})Q([1-4])$/.exec(q || "");
  if (m) return `${m[1]}년 ${m[2]}분기`;
  const mm = /^(\d{4})-(\d{2})$/.exec(q || "");
  return mm ? `${mm[1]}년 ${Number(mm[2])}월` : q || "—";
}
export const periodLabel = quarterLabel;
// 기간 배지 — 분기 '2026 Q4', 월 '2026.10'. 지금 기간은 파란 톤
export function periodBadge(p, current) {
  const q = /^(\d{4})Q([1-4])$/.exec(p || "");
  const m = /^(\d{4})-(\d{2})$/.exec(p || "");
  if (!q && !m) return null;
  return h("span", { class: `q-badge${p === current ? " cur" : ""}`, title: quarterLabel(p) }, q ? `${q[1]} Q${q[2]}` : `${m[1]}.${m[2]}`);
}
// 도움말 아이콘 — 설명 문구 대신 마우스를 올리거나 눌러서 보는 짧은 안내
export function tip(text, label = "도움말", symbol = "info") {
  return h("span", { class: "tip", tabindex: "0", role: "note", "aria-label": `${label}: ${text}`, "data-tip": text }, icon(symbol));
}
export function bytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// ── 공통 컴포넌트 ──
const STATUS_ICON = {
  draft: "edit", flagged: "alert", returned: "return", submitted: "clock", chief_review: "clock",
  finance_review: "clock", approved: "check", rejected: "x", filed: "file", deleted: "trash",
};
export function statusChip(status) {
  const s = STATUS[status] || { label: status || "—", cls: "chip-neutral" };
  const symbol = STATUS_ICON[status];
  return h("span", { class: `chip ${s.cls}${symbol ? " chip-with-icon" : ""}` }, symbol ? icon(symbol) : null, s.label);
}

export function mobileReceiptCard(entry, { open, selection, branch, below }) {
  const details = [branch, dateText(entry.txnDate), entry.account].filter(Boolean).join(" · ");
  return h("li", { class: "receipt-card" }, selection,
    h("button", { class: "receipt-card-open", type: "button", onclick: open },
      h("span", { class: "receipt-card-top" }, h("b", {}, entry.merchantKo || entry.merchant || "증빙 상세"),
        h("strong", { class: "mono" }, money(entry.amount, entry.currency))),
      h("span", { class: "receipt-card-meta" }, details),
      h("span", { class: "receipt-card-status" }, statusChip(entry.status), resubmittedBadge(entry), icon("chevron"))),
    below ? h("div", { class: "receipt-card-extra" }, below) : null);
}

export function mobileDisclosure(label, panel, id) {
  panel.id = id;
  panel.classList.add("mobile-disclosure-panel");
  const button = h("button", { class: "btn btn-ghost mobile-disclosure", type: "button", "aria-controls": id, "aria-expanded": "false" },
    h("span", {}, label), icon("chevron"));
  button.addEventListener("click", () => button.setAttribute("aria-expanded", String(panel.classList.toggle("mobile-expanded"))));
  return button;
}
export function chip(text, tone = "neutral") {
  return h("span", { class: `chip chip-${tone}` }, text);
}
export function select(options, value, attrs = {}) {
  return h(
    "select",
    { class: "input", ...attrs },
    options.map(([v, label]) => h("option", { value: v, selected: v === value }, label)),
  );
}
export function field(label, control, hint) {
  return h("label", { class: "field" }, h("span", { class: "field-label" }, label), control, hint ? h("span", { class: "field-hint" }, hint) : null);
}
export function spinner(small) {
  return h("span", { class: small ? "spinner spinner-sm" : "spinner", role: "status", "aria-label": "불러오는 중" });
}
export function empty(title, desc) {
  return h("div", { class: "empty" }, icon("list", "ic empty-ic"), h("div", { class: "empty-title" }, title), desc ? h("div", { class: "empty-desc" }, desc) : null);
}

export function metricTile({ label, value, note, symbol = "receipt", tone = "neutral", compact = false, onClick, pressed }) {
  return h(onClick ? "button" : "div", {
    class: `kpi kpi-${tone}${compact ? " kpi-mini" : ""}${onClick ? " kpi-link" : ""}`,
    type: onClick ? "button" : null, onclick: onClick, "aria-pressed": pressed === undefined ? null : String(pressed),
  },
  h("span", { class: "kpi-icon" }, icon(symbol)),
  h("span", { class: "kpi-label" }, label),
  h("strong", { class: "kpi-value" }, value),
  note ? h("span", { class: "kpi-sub" }, note) : null);
}

// 알림 메시지 — 화면 가운데에 뜨는 작은 카드(확인 창과 같은 문서형 스타일). 클릭을 막지 않고, 시간이 지나면 사라지며, 누르면 바로 닫힌다.
const TOAST = {
  ok: { title: "완료", ic: "check", ms: 2200 },
  info: { title: "안내", ic: "info", ms: 3200 },
  warn: { title: "확인해 주세요", ic: "alert", ms: 4800 },
  bad: { title: "오류", ic: "alert", ms: 6500 },
};
export function toast(message, tone = "info", ms) {
  const box = document.getElementById("toasts");
  const k = TOAST[tone] || TOAST.info;
  const life = ms ?? k.ms;
  const t = h(
    "div",
    { class: `toast toast-${tone}`, role: tone === "bad" ? "alert" : "status", onclick: () => close() },
    h("span", { class: "toast-ic" }, icon(k.ic)),
    h("div", { class: "toast-body" }, h("div", { class: "toast-title" }, k.title), h("div", { class: "toast-msg" }, message)),
  );
  let timer;
  const close = () => {
    clearTimeout(timer);
    t.classList.add("out");
    setTimeout(() => {
      t.remove();
      if (!box.querySelector(".toast")) box.classList.remove("show");
    }, 260);
  };
  box.append(t);
  box.classList.add("show");
  timer = setTimeout(close, life);
}

export function confirmDialog({ title, message, confirm = "확인", cancel = "취소", danger = false }) {
  return new Promise((resolve) => {
    const close = (v) => {
      back.remove();
      resolve(v);
    };
    const back = h(
      "div",
      { class: "modal-back", onclick: (e) => e.target === back && close(false) },
      h(
        "div",
        { class: "modal", role: "dialog", "aria-modal": "true" },
        h("div", { class: "modal-title" }, title),
        h("div", { class: "modal-body" }, message),
        h(
          "div",
          { class: "modal-actions" },
          h("button", { class: "btn btn-ghost", onclick: () => close(false) }, cancel),
          h("button", { class: danger ? "btn btn-danger" : "btn btn-primary", onclick: () => close(true) }, confirm),
        ),
      ),
    );
    document.body.append(back);
    back.querySelector(".btn-primary, .btn-danger").focus();
  });
}

export function workSummaryDialog({ title, count, days }) {
  return new Promise((resolve) => {
    const later = h("button", { class: "btn btn-ghost", type: "button", onclick: () => dialog.close() }, "나중에");
    const open = h("button", { class: "btn btn-primary", type: "button", onclick: () => dialog.close("open") }, "목록 보기", icon("chevron"));
    const dialog = h("dialog", { class: "work-summary", "aria-labelledby": "work-summary-title", "aria-describedby": "work-summary-count" },
      h("div", { class: "work-summary-inner" },
        h("div", { class: "work-summary-hero" },
          h("div", { class: "work-summary-copy" },
            h("h2", { id: "work-summary-title" }, title),
            h("p", { id: "work-summary-count", class: "work-summary-count" }, h("strong", {}, count.toLocaleString("ko-KR")), "건")),
          h("div", { class: "work-summary-art", "aria-hidden": "true" },
            h("span", { class: "work-summary-paper" }, icon("receipt")),
            h("span", { class: "work-summary-bell" }, icon("bell")))),
        days > 0 ? h("p", { class: "work-summary-wait" }, icon("clock"), `최장 대기 ${days}일`) : null,
        h("div", { class: "work-summary-actions" }, later, open)));
    dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener("close", () => {
      dialog.remove();
      resolve(dialog.returnValue === "open");
    }, { once: true });
    document.body.append(dialog);
    dialog.showModal();
    open.focus();
  });
}

// 한 줄 입력이 필요한 확인 창(소명·사유 등). 확인하면 입력한 문자열, 취소하면 null. required 면 빈 값으로 확인할 수 없다.
export function promptDialog({ title, message, placeholder = "", confirm = "확인", required = true }) {
  return new Promise((resolve) => {
    const area = h("textarea", { class: "input", rows: "3", placeholder });
    const ok = h("button", { class: "btn btn-primary", type: "button", disabled: required }, confirm);
    area.addEventListener("input", () => (ok.disabled = required && !area.value.trim()));
    const close = (v) => {
      back.remove();
      resolve(v);
    };
    ok.addEventListener("click", () => close(area.value.trim()));
    const back = h(
      "div",
      { class: "modal-back", onclick: (e) => e.target === back && close(null) },
      h(
        "div",
        { class: "modal modal-wide", role: "dialog", "aria-modal": "true" },
        h("div", { class: "modal-title" }, title),
        h("div", { class: "modal-body" }, message),
        h("div", { class: "field modal-field" }, area),
        h("div", { class: "modal-actions" }, h("button", { class: "btn btn-ghost", type: "button", onclick: () => close(null) }, "취소"), ok),
      ),
    );
    document.body.append(back);
    area.focus();
  });
}

export function errorText(e) {
  if (!e) return "알 수 없는 오류";
  return displayTeamName(e.detail?.message || e.message || e);
}
