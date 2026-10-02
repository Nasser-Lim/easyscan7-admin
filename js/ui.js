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
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 6.3"/><path d="M20 5v6h-6"/>',
  send: '<path d="M4 12 20 4l-6 16-3-7z"/><path d="m11 13 9-9"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  sliders: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  print: '<path d="M7 9V3h10v6M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"/><path d="M7 14h10v7H7z"/>',
};
export function icon(name, cls = "ic") {
  return h("span", {
    class: cls,
    "aria-hidden": "true",
    html: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ""}</svg>`,
  });
}

// ── 업무 상수 ──
export const BRANCH = { newyork: "뉴욕", washington: "워싱턴", paris: "파리", beijing: "베이징", tokyo: "도쿄" };
export const ACCOUNTS = ["경상비", "취재비", "차량유지비"];
export const STATUS = {
  // 이름 규칙: 「지금 처리해야 하는 주체 + 행위」 — 누구 차례인지 바로 보이게
  draft: { label: "지국 작성중", cls: "chip-neutral" },
  flagged: { label: "지국 검토 필요", cls: "chip-warn" },
  returned: { label: "지국 수정 필요(반려)", cls: "chip-bad" },
  submitted: { label: "보도IMC 결재중", cls: "chip-info" },
  chief_review: { label: "보도국장 결재중", cls: "chip-purple" },
  finance_review: { label: "재무팀 결재중", cls: "chip-info" },
  approved: { label: "결재 완료", cls: "chip-ok" },
  rejected: { label: "보도국장 불승인", cls: "chip-bad" },
  deleted: { label: "삭제됨", cls: "chip-muted" },
};
// 상태 묶음 — 백엔드 services/workflow.py 와 같은 규칙
export const STAFF_EDITABLE = new Set(["draft", "flagged", "returned"]);
export const IN_REVIEW = new Set(["submitted", "chief_review", "finance_review"]);
export const FINAL = new Set(["approved", "rejected", "deleted"]);
export const ELIGIBILITY = { eligible: ["적격", "ok"], ineligible: ["비적격", "bad"] };
export const REVIEWER_ROLES = new Set(["imc", "bureau_chief", "division_head", "finance", "admin"]);
export const ACTION_LABEL = { submit: "제출", approve: "승인", return: "반려", reject: "불승인" };
export const ROLE = {
  staff: "지국 담당자", imc: "보도IMC팀", bureau_chief: "보도국장",
  division_head: "보도본부장", finance: "재무팀", admin: "관리자",
};
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
export function quarterLabel(q) {
  const m = /^(\d{4})Q([1-4])$/.exec(q || "");
  return m ? `${m[1]}년 ${m[2]}분기` : q || "—";
}
export function bytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// ── 공통 컴포넌트 ──
export function statusChip(status) {
  const s = STATUS[status] || { label: status || "—", cls: "chip-neutral" };
  return h("span", { class: `chip ${s.cls}` }, s.label);
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

export function toast(message, tone = "info", ms = 3800) {
  const box = document.getElementById("toasts");
  const t = h("div", { class: `toast toast-${tone}` }, icon(tone === "ok" ? "check" : tone === "bad" ? "alert" : "info"), h("span", {}, message));
  box.append(t);
  setTimeout(() => t.classList.add("out"), ms);
  setTimeout(() => t.remove(), ms + 400);
}

export function confirmDialog({ title, message, confirm = "확인", danger = false }) {
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
          h("button", { class: "btn btn-ghost", onclick: () => close(false) }, "취소"),
          h("button", { class: danger ? "btn btn-danger" : "btn btn-primary", onclick: () => close(true) }, confirm),
        ),
      ),
    );
    document.body.append(back);
    back.querySelector(".btn-primary, .btn-danger").focus();
  });
}

export function errorText(e) {
  if (!e) return "알 수 없는 오류";
  if (e.detail && typeof e.detail === "object" && e.detail.message) return e.detail.message;
  return e.message || String(e);
}
