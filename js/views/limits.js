// 분기 한도 현황 카드 — 계정별 사용액·한도·사용률을 원장(ledger) 표로. 한도 초과분은 비적격.
import { api } from "../api.js";
import { fxStrip, loadFx } from "../fx.js";
import { clear, h, money, quarterLabel, spinner } from "../ui.js";

export function limitsCard(quarter, { compact = false } = {}) {
  const body = h("div", { class: "card-body-flush" }, h("div", { class: "card-loading" }, spinner(true)));
  const fxBar = fxStrip();
  fxBar.node.classList.add("fx-strip-card");
  const card = h(
    "section",
    { class: "card" },
    h("div", { class: "card-head" }, h("div", { class: "card-title" }, "분기 한도 현황"), h("div", { class: "card-meta" }, quarterLabel(quarter))),
    fxBar.node,
    body,
    compact ? null : h("p", { class: "card-note" }, "한도를 넘는 금액은 제출은 되지만 비적격으로 처리됩니다(사용일 순 누적)."),
  );
  load(body, quarter, fxBar);
  return card;
}

const pctOf = (used, limit) => (limit > 0 ? (used / limit) * 100 : 0);
const toneOf = (pct) => (pct > 100 ? "bad" : pct >= 80 ? "warn" : "ok");

function usage(pct) {
  const fill = h("span", { class: `meter-fill meter-${toneOf(pct)}` });
  fill.style.width = `${Math.min(pct, 100)}%`;
  return [h("span", { class: `pct pct-${toneOf(pct)}` }, `${pct.toFixed(0)}%`), h("span", { class: "meter", "aria-hidden": "true" }, fill)];
}

async function load(body, quarter, fxBar) {
  try {
    const [u, fx] = await Promise.all([api.get(`/limits?quarter=${encodeURIComponent(quarter)}`), loadFx()]);
    clear(body);
    const rows = Object.entries(u.accounts || {});
    const cur = u.currency;
    const fxCount = rows.reduce((a, [, s]) => a + (s.fxCount || 0), 0);
    const fxSkipped = rows.reduce((a, [, s]) => a + (s.fxSkipped || 0), 0);
    // 지국 통화의 환율(뉴욕=원/달러, 베이징=원/위안…)과 합산 기준
    fxBar.paint(fx, [cur], [`사용액은 ${cur} 환산 합계`, fxCount ? `다른 통화 ${fxCount}건 환산 포함(참고용)` : null, fxSkipped ? `환율 미확인 ${fxSkipped}건 제외` : null].filter(Boolean).join(" · "));
    if (!rows.length) {
      body.append(h("p", { class: "card-pad muted small" }, "이 지국에는 설정된 분기 한도가 없습니다."));
      return;
    }
    const sum = (k) => rows.reduce((a, [, s]) => a + (Number(s[k]) || 0), 0);
    const used = sum("used");
    const limit = sum("limit");
    const inel = sum("ineligible");
    body.append(
      h(
        "table",
        { class: "table ledger" },
        h("thead", {}, h("tr", {}, h("th", {}, "계정"), h("th", { class: "num" }, "사용액"), h("th", { class: "num" }, "한도"), h("th", { class: "num col-usage" }, "사용률"))),
        h(
          "tbody",
          {},
          rows.map(([acc, s]) =>
            h(
              "tr",
              {},
              h("td", {}, h("div", { class: "cell-main" }, acc), h("div", { class: "cell-sub" }, `${s.count}건`, s.fxCount ? ` · 환산 ${s.fxCount}건(참고용)` : "")),
              h("td", { class: "num" }, money(s.used, cur), s.ineligible > 0 ? h("div", { class: "cell-sub text-bad" }, `비적격 ${money(s.ineligible, cur)}`) : null),
              h("td", { class: "num muted" }, money(s.limit, cur)),
              h("td", { class: "num col-usage" }, usage(pctOf(s.used, s.limit))),
            ),
          ),
        ),
        rows.length > 1
          ? h(
              "tfoot",
              {},
              h(
                "tr",
                { class: "tr-total" },
                h("td", {}, "합계"),
                h("td", { class: "num" }, money(used, cur), inel > 0 ? h("div", { class: "cell-sub text-bad" }, `비적격 ${money(inel, cur)}`) : null),
                h("td", { class: "num" }, money(limit, cur)),
                h("td", { class: "num col-usage" }, usage(pctOf(used, limit))),
              ),
            )
          : null,
      ),
    );
  } catch {
    clear(body);
    body.append(h("p", { class: "card-pad muted small" }, "한도 정보를 불러오지 못했습니다."));
  }
}
