// 분기 한도 현황 카드 — 계정별 사용액/한도 막대. 한도 초과분은 비적격.
import { api } from "../api.js";
import { clear, h, money, quarterLabel, spinner } from "../ui.js";

export function limitsCard(quarter, { compact = false } = {}) {
  const body = h("div", { class: "limits" }, h("div", { class: "card-loading" }, spinner(true)));
  const card = h(
    "section",
    { class: "card" },
    h("div", { class: "card-head" }, h("div", {}, h("div", { class: "card-title" }, "분기 한도 현황"), h("div", { class: "card-sub" }, quarterLabel(quarter)))),
    body,
    compact ? null : h("p", { class: "card-note" }, "한도를 넘는 금액은 제출은 되지만 비적격으로 처리됩니다(사용일 순 누적)."),
  );
  load(body, quarter);
  return card;
}

async function load(body, quarter) {
  try {
    const u = await api.get(`/limits?quarter=${encodeURIComponent(quarter)}`);
    clear(body);
    const rows = Object.entries(u.accounts || {});
    if (!rows.length) {
      body.append(h("p", { class: "muted small" }, "이 지국에는 설정된 분기 한도가 없습니다."));
      return;
    }
    for (const [acc, s] of rows) {
      const pct = s.limit > 0 ? (s.used / s.limit) * 100 : 0;
      const tone = pct > 100 ? "bad" : pct >= 80 ? "warn" : "ok";
      const fill = h("div", { class: `meter-fill meter-${tone}` });
      fill.style.width = `${Math.min(pct, 100)}%`;
      body.append(
        h(
          "div",
          { class: "limit-row" },
          h(
            "div",
            { class: "limit-top" },
            h("span", { class: "limit-name" }, acc),
            h("span", { class: "limit-figs" }, h("b", {}, money(s.used, u.currency)), h("span", { class: "muted" }, ` / ${money(s.limit, u.currency)}`)),
          ),
          h("div", { class: "meter", role: "meter", "aria-valuemin": "0", "aria-valuemax": String(s.limit), "aria-valuenow": String(s.used) }, fill),
          h(
            "div",
            { class: "limit-bottom" },
            h("span", { class: "muted" }, `${s.count}건 · ${pct.toFixed(0)}%`),
            s.ineligible > 0
              ? h("span", { class: "text-bad" }, `비적격 ${money(s.ineligible, u.currency)}`)
              : h("span", { class: "muted" }, `잔여 ${money(s.remaining, u.currency)}`),
          ),
        ),
      );
    }
  } catch (e) {
    clear(body);
    body.append(h("p", { class: "muted small" }, "한도 정보를 불러오지 못했습니다."));
  }
}
