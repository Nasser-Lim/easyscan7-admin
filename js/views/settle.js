// 정산출력 — 최종 결재가 끝난 증빙으로 재무팀 정산 양식(엑셀)을 바로 만들어 내려받는다.
// 지국 담당자(자기 지국)·보도IMC팀·재무팀. 서버가 양식 파일에 값만 채워 주므로 서식·수식은 원본 그대로다.
import { api } from "../api.js?v=a3e2aca";
import { LIVE_BRANCHES } from "./dashboard.js?v=a3e2aca";
import { getPeriod } from "../period.js?v=a3e2aca";
import { BRANCH, clear, empty, errorText, field, h, icon, money, quarterLabel, quarterOptions, select, spinner, toast } from "../ui.js?v=a3e2aca";
import { pageHeader } from "./shell.js?v=a3e2aca";

const ACCOUNT_ORDER = ["취재비", "경상비", "차량유지비"];
const SHEET = { 취재비: "취재비", 경상비: "지국경상비", 차량유지비: "차량유지비" };

export function renderSettle(el, { me }) {
  const isStaff = me.role === "staff";
  const quarters = quarterOptions(6);
  const quarter = select(quarters.map((q) => [q, quarterLabel(q)]), quarters.includes(getPeriod()) ? getPeriod() : quarters[0], { class: "input" });
  const branchSel = isStaff || LIVE_BRANCHES.length < 2 ? null : select(LIVE_BRANCHES.map((id) => [id, `${BRANCH[id] || id}지국`]), LIVE_BRANCHES[0], { class: "input" });
  const body = h("div", { class: "stack" }, h("div", { class: "card-loading" }, spinner()));
  let seq = 0;

  el.append(
    pageHeader({
      crumbs: [isStaff ? `${BRANCH[me.branchId] || me.branchId}지국` : "본사", "업무"],
      title: "정산출력",
      desc: "최종 결재가 끝난 증빙으로 해외지국 정산 양식(엑셀)을 만듭니다.",
    }),
    h(
      "div",
      { class: "grid-main" },
      h(
        "div",
        { class: "stack" },
        h(
          "section",
          { class: "card" },
          h("div", { class: "card-head" }, h("div", { class: "card-title" }, "1. 정산 대상")),
          h("div", { class: "settle-pick" }, field("정산 분기", quarter), branchSel ? field("지국", branchSel) : null),
        ),
        body,
      ),
      h("div", { class: "stack" }, guideCard()),
    ),
  );

  const branchId = () => (isStaff ? me.branchId : branchSel?.value || LIVE_BRANCHES[0]);
  const query = () => `/settlements/${quarter.value}/export-preview${isStaff ? "" : `?branch=${branchId()}`}`;

  async function load() {
    const mine = ++seq;
    clear(body).append(h("div", { class: "card-loading" }, spinner()));
    try {
      const p = await api.get(query());
      if (mine === seq) draw(p);
    } catch (e) {
      if (mine === seq) clear(body).append(h("p", { class: "card-error" }, errorText(e)));
    }
  }
  quarter.addEventListener("change", load);
  branchSel?.addEventListener("change", load);

  function draw(p) {
    const cur = p.currency;
    const rows = ACCOUNT_ORDER.map((a) => [a, p.accounts[a] || { rows: 0, sum: 0 }]);
    const notes = [];
    if (p.inReview) notes.push(note("info", "결재 진행 중", `${p.inReview}건은 아직 결재 중이라 들어가지 않습니다. 결재가 끝난 뒤 다시 출력하세요.`));
    if (p.writing) notes.push(note("warn", "미제출", `작성중·반려 ${p.writing}건은 제출·결재 전이라 들어가지 않습니다.`));
    if (p.otherCurrency) notes.push(note("warn", "다른 통화 제외", `지국 통화(${cur})와 다른 통화의 결재 완료 증빙 ${p.otherCurrency}건은 양식에 넣지 않습니다. 정산 때 재무팀이 따로 반영합니다.`));
    if (p.otherAccount) notes.push(note("warn", "다른 계정 제외", `취재비·경상비·차량유지비가 아닌 계정 ${p.otherAccount}건은 양식에 세부내역 시트가 없어 넣지 않습니다.`));

    const btn = h("button", { class: "btn btn-primary btn-lg", type: "button", disabled: !p.rows }, icon("file"), h("span", {}, "엑셀 내려받기"));
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        const { blob, filename } = await api.download(`/settlements/${p.quarter}/export${isStaff ? "" : `?branch=${p.branchId}`}`);
        const url = URL.createObjectURL(blob);
        const a = h("a", { href: url, download: filename || p.fileName });
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
        toast("엑셀을 내려받았습니다", "ok");
      } catch (e) {
        toast(errorText(e), "bad", 6000);
      } finally {
        btn.disabled = !p.rows;
      }
    });

    clear(body).append(
      h(
        "section",
        { class: "card card-flush" },
        h("div", { class: "card-head card-head-pad" }, h("div", { class: "card-title" }, "2. 엑셀에 들어갈 내역"), h("div", { class: "card-meta" }, `${p.branchName}지국 · ${quarterLabel(p.quarter)} · 최종 결재 완료`)),
        p.rows
          ? h(
              "table",
              { class: "table ledger" },
              h("thead", {}, h("tr", {}, h("th", {}, "시트"), h("th", { class: "num" }, "건수"), h("th", { class: "num" }, `합계 (${cur})`))),
              h(
                "tbody",
                {},
                rows.map(([a, v]) => h("tr", {}, h("td", {}, h("div", { class: "cell-main" }, a), h("div", { class: "cell-sub" }, `시트 '${SHEET[a]}'`)), h("td", { class: "num" }, `${v.rows}건`), h("td", { class: "num strong" }, v.rows ? money(v.sum, cur) : "—"))),
              ),
              h("tfoot", {}, h("tr", { class: "tr-total" }, h("td", {}, "합계"), h("td", { class: "num" }, `${p.rows}건`), h("td", { class: "num" }, money(p.sum, cur)))),
            )
          : empty("아직 최종 결재된 증빙이 없습니다", "재무팀 최종 결재까지 끝난 증빙이 생기면 여기에 나타납니다."),
        h("div", { class: "settle-foot" }, h("span", { class: "muted small" }, p.rows ? `파일 이름: ${p.fileName}` : ""), btn),
      ),
      notes.length ? h("div", { class: "notes" }, notes) : null,
    );
  }

  load();
}

function note(tone, label, text) {
  const cls = { info: "chip-info", warn: "chip-warn" }[tone] || "chip-neutral";
  return h("div", { class: "note" }, h("span", { class: `chip ${cls}` }, label), h("span", {}, text));
}

function guideCard() {
  return h(
    "section",
    { class: "card" },
    h("div", { class: "card-head" }, h("div", { class: "card-title" }, "이렇게 만들어집니다")),
    h(
      "ul",
      { class: "tips" },
      h("li", {}, "재무팀 양식(해외지국 정산 양식)과 똑같은 엑셀입니다. 취재비·경상비·차량유지비 세부내역 시트와 정산서 시트가 들어 있습니다."),
      h("li", {}, h("b", {}, "최종 결재가 끝난 증빙만"), " 들어갑니다. 결재 중인 증빙은 끝난 뒤 다시 출력하세요."),
      h("li", {}, "날짜순으로 번호가 매겨지고 합계는 엑셀 수식입니다."),
      h("li", {}, "결재가 취소되면 그 증빙은 다음 출력부터 빠집니다."),
    ),
  );
}
