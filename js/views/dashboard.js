// 본사 홈 — 시범 지국의 증빙 및 한도 현황.
import { api } from "../api.js?v=892dfa9";
import { branchIcon } from "../branchicons.js?v=892dfa9";
import { compact, gauge, limitBar, toneOfPct } from "../charts.js?v=892dfa9";
import { getPeriod, isDateRange, periodCaption, periodControls, savedDateRange } from "../period.js?v=892dfa9";
import { ACCOUNTS, BRANCH, clear, errorText, h, icon, money, spinner } from "../ui.js?v=892dfa9";
import { pageHeader } from "./shell.js?v=892dfa9";

export const LIVE_BRANCHES = Object.keys(BRANCH);

const ACC_CLS = { 취재비: "seg-a", 경상비: "seg-b", 차량유지비: "seg-c" };

export function renderDashboard(el, ctx) {
  draw(el, ctx, savedDateRange() || getPeriod());
}

function draw(el, ctx, quarter) {
  clear(el);
  const grid = h("div", { class: "branch-grid" }, h("div", { class: "card-loading" }, spinner()));
  const again = () => draw(el, ctx, quarter);
  el.append(
    pageHeader({
      crumbs: ["본사"],
      title: "홈",
      desc: `${periodCaption(quarter)} 지국별 ${isDateRange(quarter) ? "사용액" : "한도 소진"}`,
      actions: [periodControls(quarter, (next) => draw(el, ctx, next), { all: false }), h("button", { class: "btn btn-ghost", type: "button", onclick: again }, icon("refresh"), h("span", {}, "새로고침"))],
    }),
    grid,
    ["imc", "finance", "admin"].includes(ctx.me.role) ? recognitionStats() : null,
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

function recognitionStats() {
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  const month = h("input", { type: "month", class: "input input-sm", "aria-label": "사용량 집계 월", value: today.slice(0, 7) });
  const content = h("div", {});
  const el = h("section", { class: "card usage-card desktop-guide" },
    h("div", { class: "card-head" }, h("h2", { class: "card-title with-symbol" }, icon("shield"), "AI 판독 사용량"), month), content);
  let revision = 0;
  async function load() {
    if (!month.value) return;
    const current = ++revision;
    clear(content).append(spinner());
    try {
      const { rows } = await api.get(`/settings/recognition-stats?month=${encodeURIComponent(month.value)}`);
      if (revision !== current) return;
      const table = h("table", { class: "table" },
        h("thead", {}, h("tr", {}, ["지국", "모델", "판독 쪽", "오류", "입력 토큰", "출력 토큰", "평균 시간"].map((x) => h("th", {}, x)))),
        h("tbody", {}, rows.map((row) => h("tr", {}, h("td", {}, BRANCH[row.branchId]), h("td", {}, row.model),
          h("td", {}, row.pages.toLocaleString()), h("td", {}, row.errors.toLocaleString()),
          h("td", {}, row.inputTokens.toLocaleString()), h("td", {}, row.outputTokens.toLocaleString()),
          h("td", {}, `${(row.meanLatencyMs / 1000).toFixed(1)}초`)))));
      clear(content).append(rows.length ? h("div", { class: "table-wrap" }, table) : h("p", { class: "muted" }, "이달 기록 없음"));
    } catch (err) {
      if (revision === current) clear(content).append(h("p", { class: "card-error" }, errorText(err)));
    }
  }
  month.addEventListener("change", load);
  load();
  return el;
}

function branchCard(b) {
  const head = h("div", { class: "card-head bc-head" },
    h("div", { class: "bc-title" }, h("span", { class: "bc-icon" }, branchIcon(b.id)),
      h("div", {}, h("div", { class: "bc-name" }, h("span", { class: "card-title" }, `${b.name}지국`)),
        h("div", { class: "bc-sub" }, b.currency || "미국"))));
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
