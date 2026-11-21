// 홈 — 고른 정산 분기(현분기·전분기)의 요약 지표, 한도 현황, 최근 증빙, 바로가기.
import { api } from "../api.js?v=986b221";
import { clear, dateText, empty, errorText, h, icon, metricTile, money, spinner, statusChip } from "../ui.js?v=986b221";
import { compactFlow } from "../flow.js?v=986b221";
import { loadFx, sumIn } from "../fx.js?v=986b221";
import { getPeriod, periodCaption, periodControls, savedDateRange } from "../period.js?v=986b221";
import { limitsCard } from "./limits.js?v=986b221";
import { renderDashboard } from "./dashboard.js?v=986b221";
import { pageHeader } from "./shell.js?v=986b221";

export function renderHome(el, ctx) {
  if (ctx.me.role !== "staff") return renderDashboard(el, ctx); // 본사(보도IMC팀·보도국장·재무팀): 전 지국 대시보드
  draw(el, ctx, savedDateRange() || getPeriod());
}

// 분기를 바꾸면 화면 전체를 그 분기로 다시 그린다
function draw(el, { me, go }, quarter) {
  clear(el);
  const qName = periodCaption(quarter).replace(/^\d{4}년 /, "");
  const kpis = h("div", { class: "kpis" }, h("div", { class: "card-loading" }, spinner(true)));
  const recent = h("div", { class: "card-body-flush" }, h("div", { class: "card-loading" }, spinner(true)));

  el.append(
    pageHeader({
      title: "홈",
      actions: [
        periodControls(quarter, (next) => draw(el, { me, go }, next), { all: false }),
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
    .get(`/entries?period=${encodeURIComponent(quarter)}`)
    .then(async ({ entries }) => {
      // 합계는 지국 통화로 환산(현재 환율) — 원화·외화 증빙이 섞여 있어도 한 통화로
      const fx = await loadFx();
      const cur = fx.branchCurrency?.[me.branchId] || entries.find((e) => e.currency)?.currency || "USD";
      const count = (s) => entries.filter((e) => s.includes(e.status)).length;
      const todo = count(["draft", "flagged", "returned"]);
      const inReview = count(["submitted", "chief_review", "finance_review"]);
      const inel = sumIn(entries, "ineligibleAmount", fx, cur).total;
      const totalSum = sumIn(entries, "amount", fx, cur);
      const total = totalSum.total;
      clear(kpis).append(
        metricTile({ label: `${qName} 증빙`, value: `${entries.length}건`, note: `${money(total, cur)}${totalSum.converted ? " · 참고 환산" : ""}` }),
        metricTile({ label: "미제출", value: `${todo}건`, symbol: "edit", tone: todo ? "warn" : "ok",
          note: count(["returned"]) ? `반려 ${count(["returned"])}건` : count(["flagged"]) ? `검토 필요 ${count(["flagged"])}건` : null,
          onClick: () => go(count(["returned"]) ? "entries/returned" : "entries") }),
        metricTile({ label: "결재 진행·완료", value: `${inReview + count(["approved"])}건`, symbol: "clock", tone: "info",
          note: `진행 ${inReview} · 완료 ${count(["approved"])}${count(["rejected"]) ? ` · 불승인 ${count(["rejected"])}` : ""}` }),
        metricTile({ label: "한도 초과 비적격", value: money(inel, cur), symbol: "sliders", tone: inel > 0 ? "bad" : "ok" }),
      );
      const rows = [...entries].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))).slice(0, 8);
      clear(recent).append(
        rows.length
          ? h(
              "table",
              { class: "table home-receipts" },
              h("thead", {}, h("tr", {},
                h("th", {}, "사용일"), h("th", {}, "가맹점"), h("th", { class: "recent-account" }, "계정"),
                h("th", { class: "num" }, "금액"), h("th", {}, "상태"), h("th", { scope: "col" }, "결재 단계"))),
              h(
                "tbody",
                {},
                rows.map((e) =>
                  h(
                    "tr",
                    { class: "row-link", onclick: () => go(`entries/${e.id}`) },
                    h("td", { class: "mono" }, recentDate(e.txnDate)),
                    h("td", {}, h("div", { class: "cell-main" }, e.merchantKo || e.merchant || "—"),
                      e.merchantKo && e.merchant && e.merchantKo !== e.merchant ? h("div", { class: "cell-sub" }, e.merchant) : null),
                    h("td", { class: "recent-account" }, e.account || "—"),
                    h("td", { class: "num" }, money(e.amount, e.currency)),
                    h("td", {}, statusChip(e.status)),
                    h("td", {}, compactFlow(e)),
                  ),
                ),
              ),
            )
          : empty(`${periodCaption(quarter)} 증빙이 없습니다`),
      );
    })
    .catch((e) => {
      clear(kpis);
      clear(recent).append(h("p", { class: "card-error" }, errorText(e)));
    });
}

function recentDate(value) {
  const date = dateText(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  return h("time", { class: "recent-date", datetime: date, "aria-label": date },
    h("span", { class: "recent-year" }, date.slice(0, 4)),
    h("span", { class: "recent-date-sep" }, "-"),
    h("span", {}, date.slice(5)));
}

function guideCard() {
  const steps = [["upload", "업로드"], ["edit", "확인·수정"], ["send", "제출"], ["print", "정산 출력"]];
  return h(
    "section",
    { class: "card desktop-guide" },
    h("div", { class: "card-head" }, h("div", { class: "card-title" }, "정산 절차"),
      h("a", { class: "link-more", href: "#/help" }, "도움말", icon("chevron"))),
    h("ol", { class: "workflow-strip" }, steps.map(([symbol, label]) =>
      h("li", {}, h("span", { class: "workflow-symbol" }, icon(symbol)), h("span", {}, label)))),
  );
}
