// 정산 출력 — 정산 기간(월/분기)의 정산 대상 증빙으로 재무팀 정산 양식(엑셀)과 증빙 묶음 PDF 를 내려받는다.
// 지국 담당자용 정산 요청서와 본사 정산내역서를 내려받는다.
//   · 결재 대상(취재비·경상비·차량유지비): 최종 결재 완료분 → 세부내역 시트
//   · 기타 계정: 보관(제출 완료)분 → 정산서 시트에 계정별 합계
import { api } from "../api.js?v=b8fd816";
import { branchFlag } from "../branchicons.js?v=b8fd816";
import { getPeriod, periodCaption, periodControls, savedDateRange } from "../period.js?v=b8fd816";
import { BRANCH, NON_REVIEW_ACCOUNT_LABEL, OTHER_ACCOUNTS, clear, errorText, field, h, icon,
  money, newYorkOtherAccounts, select, spinner, toast } from "../ui.js?v=b8fd816";
import { pageHeader } from "./shell.js?v=b8fd816";

const ACCOUNT_ORDER = ["취재비", "경상비", "차량유지비"];
const SHEET = { 취재비: "취재비", 경상비: "지국경상비", 차량유지비: "차량유지비" };
// 정산 출력용. 뉴욕은 해당 지국의 계정 설정을 따르고, 워싱턴은 별도의 표시 목록을 갖는다.
const OTHER_ACCOUNTS_BY_BRANCH = new Map([
  ["newyork", newYorkOtherAccounts],
  ["washington", () => OTHER_ACCOUNTS],
]);
const NO_EVIDENCE = { rows: 0, sum: 0 };
const HELP = "월·분기 또는 사용일 범위로 출력할 수 있습니다. 지국용 정산 요청서는 계정별 합계와 세부내역을 제공합니다.\n본사용 정산내역서는 지급대상·적용환율·원화금액·관련근거를 제공합니다. 송금과 이월액은 파일에서 확인해 입력합니다.";

export function renderSettle(el, { me }) {
  const isStaff = me.role === "staff";
  const canSetRates = ["finance", "admin"].includes(me.role);
  let pickedPeriod = savedDateRange() || getPeriod();
  const period = periodControls(pickedPeriod, (p) => { pickedPeriod = p; load(); }, { all: false });
  const branches = Object.entries(BRANCH);
  let pickedBranch = branches[0][0];
  const branchTabs = isStaff || branches.length < 2 ? null : h("div", { class: "branch-tabs", role: "group", "aria-label": "정산 대상 선택" },
    branches.map(([id, name]) => h("button", {
      class: "branch-tab branch-name", type: "button", "aria-pressed": String(id === pickedBranch),
      onclick: (event) => {
        if (pickedBranch === id) return;
        pickedBranch = id;
        for (const tab of branchTabs.children) tab.setAttribute("aria-pressed", String(tab === event.currentTarget));
        load();
      },
    }, branchFlag(id), name)));
  const body = h("div", { class: "stack" }, h("div", { class: "card-loading" }, spinner()));
  let seq = 0;

  el.append(
    pageHeader({
      crumbs: isStaff ? [] : ["본사"],
      title: "정산 출력",
      help: HELP,
    }),
    h(
      "section",
      { class: "card" },
      h("div", { class: "settle-pick" }, branchTabs, period),
    ),
    body,
  );

  const branchQ = (p) => (isStaff ? "" : `branch=${p?.branchId || pickedBranch}`);
  const url = (path, p, extra = "") => {
    const q = [branchQ(p), extra].filter(Boolean).join("&");
    return `/settlements/${encodeURIComponent(p ? p.period : pickedPeriod)}/${path}${q ? `?${q}` : ""}`;
  };

  async function load() {
    const mine = ++seq;
    clear(body).append(h("div", { class: "card-loading" }, spinner()));
    try {
      const p = await api.get(url("export-preview"));
      if (mine === seq) draw(p);
    } catch (e) {
      if (mine === seq) clear(body).append(h("p", { class: "card-error" }, errorText(e)));
    }
  }
  async function download(btn, path, fallback, label) {
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
    const caption = btn.lastElementChild;
    const previous = caption?.textContent;
    if (caption) caption.textContent = "만드는 중…";
    try {
      const { blob, filename } = await api.download(path);
      const href = URL.createObjectURL(blob);
      const a = h("a", { href, download: filename || fallback });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 10_000);
      toast(`${label}을 내려받았습니다`, "ok");
    } catch (e) {
      toast(errorText(e), "bad", 6000);
    } finally {
      btn.disabled = false;
      btn.removeAttribute("aria-busy");
      if (caption) caption.textContent = previous;
    }
  }

  async function editRates(p, trigger) {
    trigger.disabled = true;
    const path = url("rates", p);
    try {
      const data = await api.get(path);
      if (!trigger.isConnected) return;
      const saved = await remittanceDialog(p, data, (rates) => api.put(path, { rates }));
      if (saved) {
        toast("송금 환율을 저장했습니다", "ok");
        if (body.isConnected) load();
      }
    } catch (ex) {
      toast(errorText(ex), "bad");
    } finally {
      trigger.disabled = false;
    }
  }

  function draw(p) {
    const cur = p.currency;
    const detail = !isStaff && p.detailFileName;
    const pdfBtn = (account, { parts = 1 }) => {
      const make = (index) => {
        const b = h("button", { class: "btn btn-ghost btn-sm", type: "button", "aria-label": parts > 1 ? null : "증빙 PDF" },
          icon("pdf"), h("span", {}, parts > 1 ? `${index}부` : "PDF"));
        b.addEventListener("click", () => download(b, url("evidence", p, `account=${encodeURIComponent(account)}&part=${index}`),
          `${p.fileName.replace(/\.xlsx$/, "")} 증빙 ${account} ${index}.pdf`, "증빙 PDF"));
        return b;
      };
      return parts > 1 ? h("details", { class: "pdf-parts" }, h("summary", {}, `PDF ${parts}부`),
        h("div", { class: "bulk-actions" }, Array.from({ length: parts }, (_, index) => make(index + 1)))) : make(1);
    };
    const row = (name, sub, v, label = name) => h("tr", {},
      h("td", {}, h("div", { class: "cell-main" }, label), sub ? h("div", { class: "cell-sub" }, sub) : null),
      h("td", { class: "num" }, `${v.rows}건`),
      h("td", { class: "num strong" }, v.rows ? money(v.sum, cur) : "—"),
      h("td", { class: "cell-action" }, v.rows ? pdfBtn(name, v) : null));
    const core = ACCOUNT_ORDER.map((a) => row(a, detail ? "결재 완료" : `세부내역 '${SHEET[a]}' · 결재 완료`, p.accounts[a] || NO_EVIDENCE));
    const other = new Map(Object.entries(p.other || {}));
    const configured = p.otherAccounts ? Object.keys(p.otherAccounts) : OTHER_ACCOUNTS_BY_BRANCH.get(p.branchId)?.() || [];
    const otherNames = [...new Set([...configured, ...other.keys()])];
    const otherRows = [...other.values()].reduce((total, item) => total + item.rows, 0);
    const table = (rows, label) => h("table", { class: "table ledger", "aria-label": label },
      h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "계정"), h("th", { scope: "col", class: "num" }, "건수"),
        h("th", { scope: "col", class: "num" }, `합계 (${cur})`), h("th", { scope: "col", "aria-label": "증빙 PDF" }))),
      h("tbody", {}, rows));

    const notes = [];
    if (p.inReview) notes.push(note("info", "결재 진행 중", `${p.inReview}건 — 결재가 끝나면 포함`));
    if (p.writing) notes.push(note("warn", "미제출", `작성중·반려 ${p.writing}건 — 제출 전이라 제외`));
    if (p.financeConverted) notes.push(note("info", "송금 환율", `${p.financeConverted}건 적용`));
    const referenceConverted = p.converted - (p.financeConverted || 0);
    if (referenceConverted) notes.push(note("warn", "송금 환율 미등록", `${referenceConverted}건은 참고 환율 적용`));
    if (p.noRate) notes.push(note("warn", "환율 미확인", `${p.noRate}건 제외 — 잠시 뒤 다시 시도`));

    const xlsLabel = detail ? "정산내역서 XLSX" : "정산 요청서 XLSX";
    const xlsBtn = h("button", { class: "btn btn-primary", type: "button", disabled: !p.rows }, icon("file"), h("span", {}, xlsLabel));
    xlsBtn.addEventListener("click", () => download(xlsBtn, url(detail ? "export-detail" : "export", p), detail || p.fileName, xlsLabel));
    const pendingBtn = !isStaff && p.inReview ? h("button", { class: "btn btn-ghost", type: "button" },
      icon("file"), h("span", {}, "마감 점검 엑셀")) : null;
    pendingBtn?.addEventListener("click", () => download(pendingBtn, url("export", p, "include_pending=true"), "마감점검용.xlsx", "마감 점검 엑셀"));

    const groupMeta = (accounts, rows) => h("span", { class: "settle-group-meta" }, `${accounts}개 계정 · ${rows}건`);
    const reviewGroup = h("section", { class: "settle-group settle-review", "aria-labelledby": "settle-review-heading" },
      h("div", { class: "settle-group-head" }, icon("check"), h("h4", { id: "settle-review-heading" }, "결재 대상"),
        groupMeta(core.length, p.rows - otherRows)),
      h("div", { class: "settle-group-table" }, table(core, "결재 대상 계정")));
    const otherGroup = otherNames.length ? h("details", { class: "settle-group settle-other" },
      h("summary", { class: "settle-group-head" }, icon("list"), h("strong", {}, NON_REVIEW_ACCOUNT_LABEL),
        groupMeta(otherNames.length, otherRows), icon("chevron", "ic settle-other-arrow")),
      h("div", { class: "settle-group-table" }, table(
        otherNames.map((name) => row(name, "", other.get(name) || NO_EVIDENCE, p.otherAccounts?.[name] || name)), "비결재 계정"))) : null;
    const accounts = h("section", { class: "settle-accounts", "aria-labelledby": "settle-accounts-heading" },
      h("div", { class: "settle-accounts-head" }, h("h3", { id: "settle-accounts-heading" }, "전체 계정"),
        h("div", { class: "settle-accounts-total" }, h("span", {}, `합계 · ${p.rows}건`), h("strong", { class: "mono" }, money(p.sum, cur)))),
      reviewGroup,
      otherGroup);

    clear(body).append(
      h(
        "section",
        { class: "card card-flush settle-report" },
        h("div", { class: "card-head card-head-pad" }, h("h2", { class: "card-title branch-name" }, branchFlag(p.branchId),
          `${p.branchName}지국 · ${periodCaption(p.period)}`), h("div", { class: "card-meta" }, p.converted ? `환산 ${p.converted}건 포함` : cur)),
        accounts,
        h("div", { class: "settle-foot" }, notes.length ? h("div", { class: "notes notes-inline" }, notes) : h("span"),
          h("div", { class: "bulk-actions" },
            canSetRates ? h("button", { class: "btn btn-ghost", type: "button", onclick: (event) => editRates(p, event.currentTarget) },
              icon("sliders"), h("span", {}, "송금 환율 설정")) : null,
            pendingBtn,
            xlsBtn)),
      ),
    );
  }

  load();
}

const COMMON_CURRENCIES = ["KRW", "USD", "EUR", "JPY", "CAD", "GBP", "AUD", "CNY", "HKD", "SGD", "CHF"];
const rateAmount = new Intl.NumberFormat("ko-KR", { maximumSignificantDigits: 12 });

function decimalAmount(text) {
  const value = text.trim();
  if (!/^(?:(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?|\.\d+)$/.test(value)) return NaN;
  return Number(value.replaceAll(",", ""));
}

function remittanceDialog(preview, { currency, rates }, saveRates) {
  const names = new Intl.DisplayNames("ko", { type: "currency" });
  const codes = new Set([...COMMON_CURRENCIES, ...Object.keys(rates), ...(Intl.supportedValuesOf?.("currency") || [])]);
  codes.delete(currency);
  const options = Array.from(codes, (code) => [code, `${names.of(code)} (${code})`]);
  const rows = new Set();
  const list = h("div", { class: "remittance-rows" });
  const status = h("p", { class: "form-error", role: "alert" });
  const add = h("button", { type: "button", class: "btn btn-ghost btn-sm", onclick: () => {
    const used = new Set(Array.from(rows, (row) => row.code.value));
    const available = options.find(([code]) => !used.has(code));
    if (available) addRate(available[0]).code.focus();
  } }, icon("plus"), "통화 추가");
  const noRates = h("p", { class: "muted small", hidden: true }, "등록한 송금 환율이 없습니다.");
  const editor = h("fieldset", { class: "remittance-editor" }, list, noRates, add);
  const cancel = h("button", { type: "button", class: "btn btn-ghost", autofocus: true, onclick: () => dialog.close() }, "취소");
  const save = h("button", { type: "submit", class: "btn btn-primary" }, "저장");
  const form = h("form", { onsubmit: submit },
    h("h2", { id: "remittance-title", class: "modal-title" }, "송금 환율 설정"),
    h("div", { class: "modal-body remittance-body" },
      h("p", { class: "branch-name strong" }, branchFlag(preview.branchId), `${preview.branchName}지국 · ${periodCaption(preview.period)}`),
      h("p", {}, "송금 내역에 적힌 두 통화의 금액을 입력하세요."),
      currency === "USD" ? h("p", { class: "muted small" }, "예시  1 USD = 1,350 KRW") : null,
      editor, status),
    h("div", { class: "modal-actions" }, cancel, save));
  const dialog = h("dialog", { class: "modal modal-wide remittance-dialog", "aria-labelledby": "remittance-title" }, form);
  dialog.addEventListener("cancel", (event) => { if (save.disabled) event.preventDefault(); });

  function syncRows() {
    add.disabled = rows.size >= 30;
    noRates.hidden = rows.size > 0;
    status.textContent = "";
  }

  function addRate(initialCode, originalRate) {
    const code = select(options, initialCode);
    const initialQuote = originalRate ? rateAmount.format(1 / originalRate) : "";
    const amountInput = (value) => h("input", { class: "input num", type: "text", inputmode: "decimal", autocomplete: "off", value, placeholder: "금액" });
    const base = amountInput("1");
    const quote = amountInput(initialQuote);
    const unit = h("span", { class: "remittance-unit" }, initialCode);
    const row = { code, base, quote, initialCode, initialQuote, originalRate };
    const remove = h("button", { type: "button", class: "icon-btn icon-btn-danger", onclick: () => {
      rows.delete(row);
      card.remove();
      syncRows();
      (add.disabled ? list.querySelector("select") : add)?.focus();
    } }, icon("trash"));
    const syncCurrency = () => {
      unit.textContent = code.value;
      remove.setAttribute("aria-label", `${code.value} 환율 삭제`);
    };
    code.addEventListener("change", syncCurrency);
    syncCurrency();
    const card = h("div", { class: "remittance-row" },
      h("div", { class: "remittance-row-head" }, field("상대 통화", code), remove),
      h("div", { class: "remittance-equation" },
        field("정산 통화 금액", h("span", { class: "remittance-amount" }, base, h("span", { class: "remittance-unit" }, currency))),
        h("span", { class: "remittance-equals", "aria-hidden": "true" }, "="),
        field("상대 통화 금액", h("span", { class: "remittance-amount" }, quote, unit))));
    card.addEventListener("input", (event) => { event.target.removeAttribute("aria-invalid"); status.textContent = ""; });
    rows.add(row);
    list.append(card);
    syncRows();
    return row;
  }

  function invalid(input, message) {
    input.setAttribute("aria-invalid", "true");
    status.textContent = message;
    input.focus();
  }

  async function submit(event) {
    event.preventDefault();
    if (save.disabled) return;
    const next = new Map();
    for (const { code, base, quote, initialCode, initialQuote, originalRate } of rows) {
      if (next.has(code.value)) return invalid(code, `${code.value} 환율은 한 번만 입력해 주세요.`);
      const a = decimalAmount(base.value);
      const b = decimalAmount(quote.value);
      if (!Number.isFinite(a) || a <= 0) return invalid(base, `${currency} 금액에 0보다 큰 숫자를 입력해 주세요.`);
      if (!Number.isFinite(b) || b <= 0) return invalid(quote, `${code.value} 금액에 0보다 큰 숫자를 입력해 주세요.`);
      const rate = originalRate && code.value === initialCode && a === 1 && quote.value === initialQuote ? originalRate : a / b;
      if (!(rate > 0 && rate <= 10_000_000)) return invalid(quote, "입력한 두 금액의 비율을 확인해 주세요.");
      next.set(code.value, rate);
    }
    save.disabled = cancel.disabled = editor.disabled = true;
    save.textContent = "저장 중…";
    status.textContent = "";
    try {
      await saveRates(Object.fromEntries(next));
      dialog.close("saved");
    } catch (error) {
      status.textContent = errorText(error);
    } finally {
      save.disabled = cancel.disabled = editor.disabled = false;
      save.textContent = "저장";
    }
  }

  for (const [code, rate] of Object.entries(rates)) addRate(code, rate);
  if (!rows.size) addRate(options[0][0]);
  return new Promise((resolve) => {
    dialog.addEventListener("close", () => {
      const saved = dialog.returnValue === "saved";
      dialog.remove();
      resolve(saved);
    }, { once: true });
    document.body.append(dialog);
    dialog.showModal();
  });
}

function note(tone, label, text) {
  const cls = { info: "chip-info", warn: "chip-warn" }[tone] || "chip-neutral";
  return h("div", { class: "note" }, h("span", { class: `chip ${cls}` }, label), h("span", {}, text));
}

