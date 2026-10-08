// 홈 — 이번 분기 요약 지표, 한도 현황, 최근 증빙, 바로가기.
import { api } from "../api.js";
import { BRANCH, clear, currentQuarter, dateText, empty, errorText, h, icon, money, quarterLabel, spinner, statusChip } from "../ui.js";
import { loadFx, sumIn } from "../fx.js";
import { limitsCard } from "./limits.js";
import { pageHeader } from "./shell.js";

export function renderHome(el, { me, go }) {
  const quarter = currentQuarter();
  const branch = `${BRANCH[me.branchId] || me.branchId}지국`;
  const kpis = h("div", { class: "kpis" }, h("div", { class: "card-loading" }, spinner(true)));
  const recent = h("div", { class: "card-body-flush" }, h("div", { class: "card-loading" }, spinner(true)));

  el.append(
    pageHeader({
      crumbs: [branch],
      title: "홈",
      desc: `${quarterLabel(quarter)} 정산 현황입니다.`,
      actions: [
        h("a", { class: "btn btn-ghost", href: "#/entries" }, icon("list"), h("span", {}, "증빙 조회")),
        h("a", { class: "btn btn-primary", href: "#/upload" }, icon("upload"), h("span", {}, "증빙 업로드")),
      ],
    }),
    kpis,
    h(
      "div",
      { class: "grid-main" },
      h(
        "section",
        { class: "card" },
        h("div", { class: "card-head" }, h("div", { class: "card-title" }, "최근 증빙"), h("a", { class: "link-more", href: "#/entries" }, "전체 보기", icon("chevron"))),
        recent,
      ),
      h("div", { class: "stack" }, limitsCard(quarter, { compact: true }), guideCard()),
    ),
  );

  api
    .get(`/entries?quarter=${quarter}`)
    .then(async ({ entries }) => {
      // 합계는 지국 통화로 환산(현재 환율) — 원화·외화 증빙이 섞여 있어도 한 통화로
      const fx = await loadFx();
      const cur = fx.branchCurrency?.[me.branchId] || entries.find((e) => e.currency)?.currency || "USD";
      const count = (s) => entries.filter((e) => s.includes(e.status)).length;
      const todo = count(["draft", "flagged", "returned"]);
      const inReview = count(["submitted", "chief_review", "finance_review"]);
      const inel = sumIn(entries, "ineligibleAmount", fx, cur).total;
      const total = sumIn(entries, "amount", fx, cur).total;
      clear(kpis).append(
        kpi("이번 분기 증빙", `${entries.length}건`, money(total, cur), "neutral"),
        kpi("미제출", `${todo}건`, count(["returned"]) ? `반려 ${count(["returned"])}건 — 고쳐서 다시 제출` : count(["flagged"]) ? `검토 필요 ${count(["flagged"])}건` : "확인 후 제출하세요", count(["returned"]) ? "bad" : todo ? "warn" : "ok", () => go("entries")),
        kpi("결재 진행·완료", `${inReview + count(["approved"])}건`, `진행 ${inReview}건 · 완료 ${count(["approved"])}건${count(["rejected"]) ? ` · 불승인 ${count(["rejected"])}건` : ""}`, "info"),
        kpi("한도 초과 비적격", money(inel, cur), inel > 0 ? "초과분은 비적격 처리" : "초과 없음", inel > 0 ? "bad" : "ok"),
      );
      const rows = [...entries].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))).slice(0, 8);
      clear(recent).append(
        rows.length
          ? h(
              "table",
              { class: "table" },
              h("thead", {}, h("tr", {}, h("th", {}, "사용일"), h("th", {}, "가맹점"), h("th", {}, "계정"), h("th", { class: "num" }, "금액"), h("th", {}, "상태"))),
              h(
                "tbody",
                {},
                rows.map((e) =>
                  h(
                    "tr",
                    { class: "row-link", onclick: () => go(`entries/${e.id}`) },
                    h("td", { class: "mono" }, dateText(e.txnDate)),
                    h("td", {}, h("div", { class: "cell-main" }, e.merchantKo || e.merchant || "—"), e.merchantKo && e.merchant ? h("div", { class: "cell-sub" }, e.merchant) : null),
                    h("td", {}, e.account || "—"),
                    h("td", { class: "num" }, money(e.amount, e.currency)),
                    h("td", {}, statusChip(e.status)),
                  ),
                ),
              ),
            )
          : empty("이번 분기 증빙이 없습니다", "증빙을 업로드하면 AI 가 내용을 읽어 정리합니다."),
      );
    })
    .catch((e) => {
      clear(kpis);
      clear(recent).append(h("p", { class: "card-error" }, errorText(e)));
    });
}

function kpi(label, value, sub, tone, onclick) {
  return h(
    onclick ? "button" : "div",
    { class: `kpi kpi-${tone}${onclick ? " kpi-link" : ""}`, onclick, type: onclick ? "button" : null },
    h("div", { class: "kpi-label" }, label),
    h("div", { class: "kpi-value" }, value),
    h("div", { class: "kpi-sub" }, sub),
  );
}

function guideCard() {
  const step = (n, t, d) => h("li", {}, h("span", { class: "step-no" }, n), h("div", {}, h("div", { class: "step-title" }, t), h("div", { class: "step-desc" }, d)));
  return h(
    "section",
    { class: "card" },
    h("div", { class: "card-head" }, h("div", { class: "card-title" }, "정산 절차")),
    h(
      "ol",
      { class: "steps" },
      step("1", "증빙 업로드", "PDF·스크린샷을 여러 개 한 번에 올립니다. 촬영 영수증은 촬영앱을 쓰세요."),
      step("2", "증빙 확인·수정", "AI 가 읽은 날짜·가맹점·금액을 원본과 대조합니다. 취재비는 적요 필수."),
      step("3", "제출", "확인한 증빙을 제출하면 결재선으로 넘어갑니다."),
    ),
  );
}
