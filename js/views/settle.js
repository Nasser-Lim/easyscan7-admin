// 정산 출력 — 정산 기간(월/분기)의 정산 대상 증빙으로 재무팀 정산 양식(엑셀)과 증빙 묶음 PDF 를 내려받는다.
// 지국 담당자용 정산 요청서와 본사 정산내역서를 내려받는다.
//   · 결재 대상(취재비·경상비·차량유지비): 최종 결재 완료분 → 세부내역 시트
//   · 기타 계정: 보관(제출 완료)분 → 정산서 시트에 계정별 합계
import { api } from "../api.js?v=8bbda7c";
import { branchFlag } from "../branchicons.js?v=8bbda7c";
import { getPeriod, periodCaption, periodControls, savedDateRange } from "../period.js?v=8bbda7c";
import { BRANCH, NON_REVIEW_ACCOUNT_LABEL, OTHER_ACCOUNTS, clear, confirmDialog, errorText, field, h, icon,
  money, newYorkOtherAccounts, spinner, toast } from "../ui.js?v=8bbda7c";
import { pageHeader } from "./shell.js?v=8bbda7c";

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

  async function editRates(p) {
    try {
      const data = await api.get(url("rates", p));
      const input = h("textarea", { class: "input", rows: "4", spellcheck: "false", placeholder: "KRW 0.00075\nEUR 1.08" },
        Object.entries(data.rates).map(([code, rate]) => `${code} ${rate}`).join("\n"));
      if (!(await confirmDialog({
        title: "재무팀 송금 환율",
        message: field(`외화 1단위당 ${data.currency} 환율 · 줄마다 통화 코드와 수치`, input),
        confirm: "저장",
      }))) return;
      const rates = {};
      for (const line of input.value.split("\n").map((row) => row.trim()).filter(Boolean)) {
        const [code, rate, extra] = line.toUpperCase().split(/\s+/);
        if (extra || !/^[A-Z]{3}$/.test(code) || code in rates || !Number.isFinite(Number(rate)) || Number(rate) <= 0) {
          throw new Error("통화 코드와 양수 환율을 줄마다 한 쌍씩 입력해 주세요.");
        }
        rates[code] = Number(rate);
      }
      await api.put(url("rates", p), { rates });
      toast("송금 환율을 저장했습니다", "ok");
      load();
    } catch (ex) { toast(errorText(ex), "bad"); }
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
            canSetRates ? h("button", { class: "btn btn-ghost", type: "button", onclick: () => editRates(p) }, "송금 환율 설정") : null,
            pendingBtn,
            xlsBtn)),
      ),
    );
  }

  load();
}

function note(tone, label, text) {
  const cls = { info: "chip-info", warn: "chip-warn" }[tone] || "chip-neutral";
  return h("div", { class: "note" }, h("span", { class: `chip ${cls}` }, label), h("span", {}, text));
}

