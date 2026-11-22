// 홈 — 고른 정산 분기(현분기·전분기)의 요약 지표, 한도 현황, 최근 증빙, 바로가기.
import { api } from "../api.js?v=4609e37";
import { IN_REVIEW, WRITING_STATUSES, clear, dateText, empty, errorText, h, icon, metricTile, money, spinner, statusChip } from "../ui.js?v=4609e37";
import { compactFlow } from "../flow.js?v=4609e37";
import { loadFx, sumIn } from "../fx.js?v=4609e37";
import { getPeriod, periodCaption, periodControls, savedDateRange } from "../period.js?v=4609e37";
import { limitsCard } from "./limits.js?v=4609e37";
import { renderDashboard } from "./dashboard.js?v=4609e37";
import { pageHeader } from "./shell.js?v=4609e37";

export function renderHome(el, ctx) {
  if (ctx.me.role !== "staff") return renderDashboard(el); // 본사(보도BIZ팀·보도국장·재무팀): 전 지국 대시보드
  draw(el, ctx, savedDateRange() || getPeriod());
}

// 분기를 바꾸면 화면 전체를 그 분기로 다시 그린다
function draw(el, { me, go }, quarter) {
  clear(el);
  const qName = periodCaption(quarter).replace(/^\d{4}년 /, "");
  const openEntries = (status) => go(`entries?${new URLSearchParams({ period: quarter, status })}`);
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
      const count = (status) => entries.filter((e) => e.status === status).length;
      const writing = entries.filter((e) => WRITING_STATUSES.has(e.status));
      const returned = entries.filter((e) => e.status === "returned");
      const inReview = entries.filter((e) => IN_REVIEW.has(e.status)).length;
      const approved = count("approved");
      const rejected = count("rejected");
      const amountNote = (rows) => {
        const { total, converted, skipped } = sumIn(rows, "amount", fx, cur);
        return [money(total, cur), converted ? "참고 환산" : null, skipped ? `환율 미확인 ${skipped}건 제외` : null].filter(Boolean).join(" · ");
      };
      clear(kpis).append(
        metricTile({ label: `${qName} 증빙`, value: `${entries.length}건`, note: amountNote(entries),
          onClick: () => openEntries("") }),
        metricTile({ label: "작성중", value: `${writing.length}건`, note: amountNote(writing), symbol: "edit", onClick: () => openEntries("writing") }),
        metricTile({ label: "반려됨", value: `${returned.length}건`, note: amountNote(returned), symbol: "return", tone: returned.length ? "bad" : "neutral",
          onClick: () => openEntries("returned") }),
        metricTile({ label: "결재 진행·완료", value: `${inReview + approved}건`, symbol: "clock", tone: "info",
          note: `진행 ${inReview} · 완료 ${approved}${rejected ? ` · 불승인 ${rejected}` : ""}` }),
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
