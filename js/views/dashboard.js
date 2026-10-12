// 본사 홈 — 전 지국의 분기 한도 소진 현황을 지국 카드로 한눈에 본다(보도IMC팀·보도국장·재무팀·관리자).
// 지금은 뉴욕만 실데이터이고, 나머지 지국은 화면 설계를 보여 주는 예시(mock) 데이터다 — 카드에 '예시'로 표시한다.
// 지국을 실제로 열 때는 LIVE_BRANCHES 에 ID 를 추가하면 그 지국은 GET /limits 실데이터로 바뀐다(mock 은 무시).
import { api } from "../api.js?v=60a3df0";
import { branchIcon } from "../branchicons.js?v=60a3df0";
import { compact, gauge, limitBar, toneOfPct } from "../charts.js?v=60a3df0";
import { getPeriod, periodSwitch } from "../period.js?v=60a3df0";
import { ACCOUNTS, BRANCH, clear, errorText, h, icon, money, quarterLabel, spinner } from "../ui.js?v=60a3df0";
import { pageHeader } from "./shell.js?v=60a3df0";

export const LIVE_BRANCHES = ["newyork"];

// 예시 데이터 — GET /limits 응답과 같은 모양(통화·계정별 사용액·한도·비적격·건수)
const MOCK = {
  washington: { currency: "USD", accounts: { 취재비: { used: 2480, limit: 4000, ineligible: 0, count: 14 }, 경상비: { used: 1390, limit: 1500, ineligible: 0, count: 22 }, 차량유지비: { used: 410, limit: 900, ineligible: 0, count: 9 } } },
  paris: { currency: "EUR", accounts: { 취재비: { used: 4710, limit: 4500, ineligible: 210, count: 19 }, 경상비: { used: 1180, limit: 2000, ineligible: 0, count: 17 }, 차량유지비: { used: 640, limit: 1000, ineligible: 0, count: 8 } } },
  beijing: { currency: "CNY", accounts: { 취재비: { used: 17200, limit: 30000, ineligible: 0, count: 12 }, 경상비: { used: 8900, limit: 12000, ineligible: 0, count: 25 }, 차량유지비: { used: 2100, limit: 6000, ineligible: 0, count: 6 } } },
  tokyo: { currency: "JPY", accounts: { 취재비: { used: 412000, limit: 600000, ineligible: 0, count: 11 }, 경상비: { used: 188000, limit: 240000, ineligible: 0, count: 16 }, 차량유지비: { used: 96000, limit: 120000, ineligible: 0, count: 7 } } },
};
const COUNTRY = { newyork: "미국", washington: "미국", paris: "프랑스", beijing: "중국", tokyo: "일본" };
const ACC_CLS = { 취재비: "seg-a", 경상비: "seg-b", 차량유지비: "seg-c" };

export function renderDashboard(el, ctx, live = LIVE_BRANCHES) {
  draw(el, ctx, live);
}

function draw(el, ctx, live) {
  clear(el);
  const quarter = getPeriod();
  const grid = h("div", { class: "branch-grid" }, h("div", { class: "card-loading" }, spinner()));
  const again = () => draw(el, ctx, live);
  el.append(
    pageHeader({
      crumbs: ["본사"],
      title: "홈",
      desc: `${quarterLabel(quarter)} 지국별 분기 한도 소진 현황`,
      actions: [periodSwitch(again), h("button", { class: "btn btn-ghost", type: "button", onclick: again }, icon("refresh"), h("span", {}, "새로고침"))],
    }),
    grid,
  );

  // 실데이터 지국은 병렬로 받고, 나머지는 예시로 채운다. 순서는 BRANCH(뉴욕·워싱턴·파리·베이징·도쿄) 그대로.
  Promise.all(
    Object.keys(BRANCH).map(async (id) => {
      if (!live.includes(id)) return { id, name: BRANCH[id], mock: true, ...MOCK[id] };
      try {
        const u = await api.get(`/limits?quarter=${encodeURIComponent(quarter)}&branch=${id}`);
        return { id, name: BRANCH[id], mock: false, currency: u.currency, accounts: u.accounts || {} };
      } catch (e) {
        return { id, name: BRANCH[id], mock: false, error: errorText(e) };
      }
    }),
  ).then((branches) => clear(grid).append(...branches.map(branchCard)));
}

function branchCard(b) {
  const tag = b.mock ? h("span", { class: "bc-tag bc-mock", title: "화면 설계용 예시 데이터입니다" }, "예시") : h("span", { class: "bc-tag bc-live" }, h("i", {}), "실데이터");
  const head = h(
    "div",
    { class: "card-head bc-head" },
    h("div", { class: "bc-title" }, h("span", { class: "bc-icon" }, branchIcon(b.id)), h("div", {}, h("div", { class: "bc-name" }, h("span", { class: "card-title" }, `${b.name}지국`), tag), h("div", { class: "bc-sub" }, [COUNTRY[b.id], b.currency].filter(Boolean).join(" · ")))),
  );
  if (b.error) return h("section", { class: "card branch-card" }, head, h("p", { class: "card-error" }, b.error));

  const rows = ACCOUNTS.map((acc) => [acc, b.accounts[acc]]).filter(([, v]) => v && v.limit > 0);
  const used = rows.reduce((a, [, v]) => a + (Number(v.used) || 0), 0);
  const limit = rows.reduce((a, [, v]) => a + (Number(v.limit) || 0), 0);
  const pct = limit > 0 ? (used / limit) * 100 : 0;
  return h(
    "section",
    { class: `card branch-card${b.mock ? " is-mock" : ""}` },
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
