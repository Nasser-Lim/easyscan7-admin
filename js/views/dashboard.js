// 본사 홈 — 시범 지국의 증빙 및 한도 현황.
import { api } from "../api.js?v=4609e37";
import { branchFlag, branchIcon } from "../branchicons.js?v=4609e37";
import { compact, gauge, limitBar, toneOfPct } from "../charts.js?v=4609e37";
import { getPeriod, isDateRange, periodCaption, periodControls, savedDateRange } from "../period.js?v=4609e37";
import { ACCOUNTS, BRANCH, clear, errorText, h, icon, money, spinner } from "../ui.js?v=4609e37";
import { pageHeader } from "./shell.js?v=4609e37";

export const LIVE_BRANCHES = Object.keys(BRANCH);
const PLANNED_BRANCHES = [["paris", "파리"], ["tokyo", "도쿄"], ["beijing", "베이징"]];

const ACC_CLS = { 취재비: "seg-a", 경상비: "seg-b", 차량유지비: "seg-c" };

export function renderDashboard(el) {
  draw(el, savedDateRange() || getPeriod());
}

function draw(el, quarter) {
  clear(el);
  const grid = h("div", { class: "branch-grid" }, h("div", { class: "card-loading" }, spinner()));
  const again = () => draw(el, quarter);
  el.append(
    pageHeader({
      crumbs: ["본사"],
      title: "홈",
      desc: `${periodCaption(quarter)} 지국별 ${isDateRange(quarter) ? "사용액" : "한도 소진"}`,
      actions: [periodControls(quarter, (next) => draw(el, next), { all: false }), h("button", { class: "btn btn-ghost", type: "button", onclick: again }, icon("refresh"), h("span", {}, "새로고침"))],
    }),
    grid,
    h("div", { class: "branch-grid branch-grid-planned", "aria-label": "서비스 예정 지국", role: "group" },
      PLANNED_BRANCHES.map(([id, name]) => branchCard({ id, name, planned: true }))),
  );

  Promise.all(
    LIVE_BRANCHES.map(async (id) => {
      try {
        const u = await api.get(`/limits?period=${encodeURIComponent(quarter)}&branch=${id}`);
        return { id, name: BRANCH[id], range: u.unit === "range", currency: u.currency, accounts: u.accounts || {} };
      } catch (e) {
        return { id, name: BRANCH[id], error: errorText(e) };
      }
    }),
  ).then((branches) => clear(grid).append(...branches.map(branchCard)));
}

function branchCard(b) {
  const head = h("div", { class: "card-head bc-head" },
    h("div", { class: "bc-title" }, h("span", { class: "bc-icon" }, branchIcon(b.id)),
      h("div", {}, h("h2", { class: "card-title branch-name" }, branchFlag(b.id), `${b.name}지국`),
        h("div", { class: "bc-sub" }, b.planned ? "서비스 예정" : b.currency || "미국"))));
  if (b.planned) return h("section", { class: "card branch-card is-mock" }, head);
  if (b.error) return h("section", { class: "card branch-card" }, head, h("p", { class: "card-error" }, b.error));

  if (b.range) {
    return h("section", { class: "card branch-card" }, head,
      h("ul", { class: "lb-list range-usage" }, ACCOUNTS.map((account) => {
        const usage = b.accounts[account] || {};
        return h("li", { class: "lb-head" }, h("span", {}, account),
          h("strong", { class: "num" }, money(usage.used || 0, b.currency)));
      })));
  }
  const rows = ACCOUNTS.map((acc) => [acc, b.accounts[acc]]).filter(([, v]) => v && v.limit > 0);
  const used = rows.reduce((a, [, v]) => a + (Number(v.used) || 0), 0);
  const limit = rows.reduce((a, [, v]) => a + (Number(v.limit) || 0), 0);
  const pct = limit > 0 ? (used / limit) * 100 : 0;
  return h(
    "section",
    { class: "card branch-card" },
    head,
    limit > 0
      ? h(
          "div",
          { class: "bc-body" },
          h("div", { class: "bc-gauge" }, gauge(pct), h("div", { class: "bc-sum" }, h("b", {}, money(used, b.currency)), h("span", {}, ` / ${money(limit, b.currency)}`))),
          h(
            "ul",
            { class: "lb-list" },
            rows.map(([acc, v]) => {
              const p = (v.used / v.limit) * 100;
              return h(
                "li",
                {},
                h("div", { class: "lb-head" }, h("span", { class: "lb-name" }, h("i", { class: `dot ${ACC_CLS[acc] || "seg-d"}` }), acc), h("span", { class: `lb-pct tone-text-${toneOfPct(p)}` }, `${p.toFixed(0)}%`)),
                limitBar(p),
                h("div", { class: "lb-foot" }, h("span", {}, `${compact(v.used, b.currency)} / ${compact(v.limit, b.currency)}`), v.ineligible > 0 ? h("span", { class: "text-bad" }, `비적격 ${compact(v.ineligible, b.currency)}`) : h("span", { class: "muted" }, `${v.count}건`)),
              );
            }),
          ),
        )
      : h("p", { class: "card-pad muted small" }, "설정된 분기 한도가 없습니다."),
  );
}
