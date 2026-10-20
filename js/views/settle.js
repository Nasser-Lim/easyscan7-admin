// 정산 출력 — 정산 기간(월/분기)의 정산 대상 증빙으로 재무팀 정산 양식(엑셀)과 증빙 묶음 PDF 를 내려받는다.
// 지국 담당자(자기 지국)·보도IMC팀·재무팀. 엑셀은 양식 파일에 값만 채워(정산서 시트 자동 집계 + 세부내역 3개 시트) 서식이 원본 그대로다.
//   · 결재 대상(취재비·경상비·차량유지비): 최종 결재 완료분 → 세부내역 시트
//   · 기타 계정: 보관(제출 완료)분 → 정산서 시트에 계정별 합계
import { api } from "../api.js?v=2cd17b8";
import { LIVE_BRANCHES } from "./dashboard.js?v=2cd17b8";
import { getPeriod, periodOptions, periodSelect, unitName } from "../period.js?v=2cd17b8";
import { BRANCH, clear, empty, errorText, field, h, icon, money, quarterLabel, select, spinner, toast } from "../ui.js?v=2cd17b8";
import { pageHeader } from "./shell.js?v=2cd17b8";

const ACCOUNT_ORDER = ["취재비", "경상비", "차량유지비"];
const SHEET = { 취재비: "취재비", 경상비: "지국경상비", 차량유지비: "차량유지비" };
const HELP = "엑셀: 정산서 시트(규정액·기타 계정 합계 자동 집계) + 세부내역 3개 시트(결재 완료분, 날짜순 번호, 마지막 행 합계).\n증빙 PDF: 계정별로 원본을 엑셀과 같은 번호·순서로 한 쪽에 한 장 — ERP 전표 첨부용.\n원화 등 다른 통화는 현재 환율로 환산해 넣고 세부사용내역에 원래 금액을 적습니다(정산 환율과 다를 수 있음).\n결재가 취소되면 다음 출력부터 빠집니다.";

export function renderSettle(el, { me }) {
  const isStaff = me.role === "staff";
  const start = periodOptions().includes(getPeriod()) ? getPeriod() : periodOptions()[0];
  const period = periodSelect(start, { all: false, cls: "input" });
  const branchSel = isStaff || LIVE_BRANCHES.length < 2 ? null : select(LIVE_BRANCHES.map((id) => [id, `${BRANCH[id] || id}지국`]), LIVE_BRANCHES[0], { class: "input" });
  const body = h("div", { class: "stack" }, h("div", { class: "card-loading" }, spinner()));
  let seq = 0;

  el.append(
    pageHeader({
      crumbs: [isStaff ? `${BRANCH[me.branchId] || me.branchId}지국` : "본사", "업무"],
      title: "정산 출력",
      desc: "정산 양식 엑셀과 증빙 PDF",
      help: HELP,
    }),
    h(
      "section",
      { class: "card" },
      h("div", { class: "settle-pick" }, field(`정산 ${unitName()}`, period), branchSel ? field("지국", branchSel) : null),
    ),
    body,
  );

  const branchQ = (p) => (isStaff ? "" : `branch=${p ? p.branchId : branchSel?.value || LIVE_BRANCHES[0]}`);
  const url = (path, p, extra = "") => {
    const q = [branchQ(p), extra].filter(Boolean).join("&");
    return `/settlements/${p ? p.period : period.value}/${path}${q ? `?${q}` : ""}`;
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
  period.addEventListener("change", load);
  branchSel?.addEventListener("change", load);

  async function download(btn, path, fallback, label) {
    btn.disabled = true;
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
    }
  }

  function draw(p) {
    const cur = p.currency;
    const pdfBtn = (account, n) => {
      const b = h("button", { class: "btn btn-ghost btn-sm", type: "button", disabled: !n, title: `${account} 증빙 원본을 한 파일로` }, icon("pdf"), h("span", {}, "증빙 PDF"));
      b.addEventListener("click", () => download(b, url("evidence", p, `account=${encodeURIComponent(account)}`), `${p.fileName.replace(/\.xlsx$/, "")} 증빙 ${account}.pdf`, "증빙 PDF"));
      return b;
    };
    const row = (name, sub, v) => h("tr", {},
      h("td", {}, h("div", { class: "cell-main" }, name), h("div", { class: "cell-sub" }, sub)),
      h("td", { class: "num" }, `${v.rows}건`),
      h("td", { class: "num strong" }, v.rows ? money(v.sum, cur) : "—"),
      h("td", { class: "cell-action" }, pdfBtn(name, v.rows)));
    const core = ACCOUNT_ORDER.map((a) => row(a, `세부내역 '${SHEET[a]}' · 결재 완료`, p.accounts[a] || { rows: 0, sum: 0 }));
    const other = Object.entries(p.other || {}).map(([a, v]) => row(a, "정산서 시트 · 보관", v));

    const notes = [];
    if (p.inReview) notes.push(note("info", "결재 진행 중", `${p.inReview}건 — 결재가 끝나면 포함`));
    if (p.writing) notes.push(note("warn", "미제출", `작성중·반려 ${p.writing}건 — 제출 전이라 제외`));
    if (p.converted) notes.push(note("info", "환산 포함", `${p.converted}건 — 현재 환율로 ${cur} 환산(참고)`));
    if (p.noRate) notes.push(note("warn", "환율 미확인", `${p.noRate}건 제외 — 잠시 뒤 다시 시도`));

    const xlsBtn = h("button", { class: "btn btn-primary", type: "button", disabled: !p.rows }, icon("file"), h("span", {}, "엑셀 내려받기"));
    xlsBtn.addEventListener("click", () => download(xlsBtn, url("export", p), p.fileName, "엑셀"));

    clear(body).append(
      h(
        "section",
        { class: "card card-flush" },
        h("div", { class: "card-head card-head-pad" }, h("div", { class: "card-title" }, `${p.branchName}지국 · ${quarterLabel(p.period)}`), h("div", { class: "card-meta" }, p.converted ? `환산 ${p.converted}건 포함` : cur)),
        p.rows
          ? h(
              "table",
              { class: "table ledger" },
              h("thead", {}, h("tr", {}, h("th", {}, "계정"), h("th", { class: "num" }, "건수"), h("th", { class: "num" }, `합계 (${cur})`), h("th", {}))),
              h("tbody", {}, core, other.length ? [h("tr", { class: "tr-group" }, h("td", { colspan: "4" }, "기타 계정")), ...other] : null),
              h("tfoot", {}, h("tr", { class: "tr-total" }, h("td", {}, "합계"), h("td", { class: "num" }, `${p.rows}건`), h("td", { class: "num" }, money(p.sum, cur)), h("td", {}))),
            )
          : empty(`${quarterLabel(p.period)} 정산할 증빙이 없습니다`, "결재 완료(세 계정) 또는 보관(기타 계정)된 증빙이 생기면 나타납니다."),
        h("div", { class: "settle-foot" }, notes.length ? h("div", { class: "notes notes-inline" }, notes) : h("span"), xlsBtn),
      ),
    );
  }

  load();
}

function note(tone, label, text) {
  const cls = { info: "chip-info", warn: "chip-warn" }[tone] || "chip-neutral";
  return h("div", { class: "note" }, h("span", { class: `chip ${cls}` }, label), h("span", {}, text));
}

