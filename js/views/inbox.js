// 결재함 — 내 역할이 결재할 단계의 증빙(전 지국). 행을 열어 원본 대조 후 결재, 단순 승인 단계는 일괄 처리.
import { api } from "../api.js?v=8bbda7c";
import {
  BRANCH, ELIGIBILITY, ROLE, chip, clear, confirmDialog, dateText, dateTime, displayTeamName, empty, errorText, h, icon, metricTile, mobileDisclosure, mobileReceiptCard, money,
  quarterLabel, resubmittedBadge, select, spinner, statusChip, tip, toast,
} from "../ui.js?v=8bbda7c";
import { isPeriodOf, periodOfEntry, periodControls, savedDateRange, unitName } from "../period.js?v=8bbda7c";
import { aiGateMark } from "../aigate.js?v=8bbda7c";
import { compactFlow } from "../flow.js?v=8bbda7c";
import { createPager } from "../pager.js?v=8bbda7c";
import { openDrawer } from "./entries.js?v=8bbda7c";
import { pageHeader, setNavBadge } from "./shell.js?v=8bbda7c";

const ROLE_GUIDE = {
  imc: "제출된 증빙을 원본과 대조해 적격 / 비적격으로 분류합니다. 적격은 재무팀으로, 비적격(사유 필수)은 보도국장 전결로 올라갑니다.",
  bureau_chief: "보도BIZ팀이 비적격으로 분류한 증빙입니다. 승인하면 재무팀 최종 검토로, 불승인하면 지급하지 않고 종결됩니다.",
  division_head: "보도BIZ팀이 비적격으로 분류한 증빙입니다. 승인하면 재무팀 최종 검토로, 불승인하면 지급하지 않고 종결됩니다.",
  finance: "결재선을 거친 증빙을 최종 검토하고 결재합니다. 문제가 있으면 사유를 적어 지국으로 반려합니다.",
  admin: "재무팀 최종 검토 단계 증빙입니다.",
};
// 열어 보지 않고 일괄 처리해도 되는 단계: 재무팀 최종 결재, 보도BIZ팀의 적격 분류(한도 초과가 없는 증빙만),
// 보도국장·보도본부장의 비적격 전결 승인은 확인 창에서 사유를 보여 준다. 불승인·반려는 사유가 필수라 건별로 한다
const BULK = {
  finance_review: { roles: ["finance", "admin"], label: "선택 최종 결재", body: () => ({ action: "approve" }) },
  submitted: { roles: ["imc"], label: "선택 적격 분류", body: () => ({ action: "approve", eligibility: "eligible" }), ok: (e) => !(e.ineligibleAmount > 0) },
  chief_review: { roles: ["bureau_chief", "division_head"], label: "선택 승인", body: () => ({ action: "approve" }) },
};

// 결재 판단에 필요한 사유 한 줄 — 보도BIZ팀의 비적격 사유, 지국 소명, AI 위반 근거, 한도 초과
function reasonParts(e) {
  const out = [];
  const imc = [...(e.approvals || [])].reverse().find((a) => a.from === "submitted" && a.action === "approve" && a.eligibility === "ineligible");
  if (imc?.comment) out.push([ROLE.imc, imc.comment]);
  const just = e.aiGate?.override?.justification;
  if (just) out.push(["소명", just]);
  const viol = (e.aiGate?.violations || []).map((v) => v.reason).filter(Boolean).join(" · ");
  if (e.aiGate?.verdict === "fail" && viol) out.push(["AI", viol]);
  if (e.ineligibleAmount > 0) out.push(["한도", `초과 ${money(e.ineligibleAmount, e.currency)}`]);
  return out;
}
function statusDetail(e) {
  const detail = ELIGIBILITY[e.eligibility] || (e.ineligibleAmount > 0 ? ["한도 초과", "bad"] : null);
  return detail ? chip(detail[0], detail[1]) : null;
}

function amountSummary(rows, fallbackCurrency = "USD") {
  const totals = new Map();
  for (const { amount, currency } of rows) {
    const cur = currency || fallbackCurrency;
    totals.set(cur, (totals.get(cur) || 0) + (Number(amount) || 0));
  }
  return [...totals].map(([currency, amount]) => money(amount, currency)).join(" · ") || money(0, fallbackCurrency);
}

export async function refreshInboxBadge(me) {
  if (me.role === "staff") return;
  try {
    const { entries } = await api.get("/entries/queue");
    setNavBadge("inbox", entries.length);
  } catch {
    /* 배지는 편의 기능 — 실패해도 무시 */
  }
}

let branchFilter = "all";
let periodFilter = "";
let queueOrder = "wait";

export function renderInbox(el, { me }) {
  let rows = [];
  let stages = [];
  let reviewing = false;
  const selected = new Set();
  const branchSel = select([["all", "전체 지국"], ...Object.entries(BRANCH).map(([id, n]) => [id, `${n}지국`])], branchFilter, { class: "input input-sm", "aria-label": "결재함 지국" });
  const kpiBar = h("div", { class: "kpis kpis-sm" });
  const bulk = h("div", { class: "bulkbar" });
  const tableWrap = h("div", { class: "table-wrap" }, h("div", { class: "card-loading" }, spinner()));
  const pagerBox = h("div", {});
  const pager = createPager("inbox", () => paint());
  const order = select([["wait", "오래된 순"], ["amount", "금액 큰 순"], ["reasons", "사유 있는 순"]],
    queueOrder, { class: "input input-sm", "aria-label": "결재함 정렬" });
  order.addEventListener("change", () => { queueOrder = order.value; pager.reset(); paint(); });
  branchSel.addEventListener("change", () => ((branchFilter = branchSel.value), pager.reset(), paint()));
  periodFilter = savedDateRange() || (isPeriodOf(periodFilter) ? periodFilter : "");
  const periodSel = periodControls(periodFilter, (p) => { periodFilter = p; pager.reset(); load(); });
  const filters = h("div", { class: "toolbar-filters" }, branchSel, periodSel, order);
  const filterToggle = mobileDisclosure("필터", filters, "inbox-filters", { expanded: true });

  el.append(
    pageHeader({
      crumbs: ["본사", ROLE[me.role] || me.role],
      title: "결재함",
      help: `${ROLE_GUIDE[me.role] || ""}\n오래 기다린 순으로 쌓입니다. 여기서 '결재'는 이 시스템 안의 결재(ERP 전표 결재와 별개)입니다.`,
      actions: [filterToggle, h("button", { class: "btn btn-ghost", type: "button", onclick: () => load() }, icon("refresh"), h("span", {}, "새로고침"))],
    }),
    kpiBar,
    h(
      "section",
      { class: "card card-flush" },
      h("div", { class: "toolbar mobile-toolbar inbox-toolbar" }, filters),
      bulk,
      tableWrap,
      pagerBox,
    ),
  );

  async function load() {
    clear(tableWrap).append(h("div", { class: "card-loading" }, spinner()));
    selected.clear();
    try {
      const r = await api.get(`/entries/queue${periodFilter ? `?period=${encodeURIComponent(periodFilter)}` : ""}`);
      rows = r.entries;
      stages = r.stages;
      if (!periodFilter) setNavBadge("inbox", rows.length);
      paint();
    } catch (e) {
      clear(tableWrap).append(h("p", { class: "card-error" }, errorText(e)));
    }
  }

  const bulkable = (e) => {
    const b = BULK[e.status];
    return !!b && b.roles.includes(me.role) && (!b.ok || b.ok(e));
  };

  function paint() {
    const list = rows.filter((e) => branchFilter === "all" || e.branchId === branchFilter);
    if (queueOrder === "amount") list.sort((a, b) => String(a.currency).localeCompare(String(b.currency)) || (b.amount || 0) - (a.amount || 0));
    if (queueOrder === "reasons") list.sort((a, b) => reasonParts(b).length - reasonParts(a).length);
    const cur = list.find((e) => e.currency)?.currency || "USD";
    clear(kpiBar).append(
      ...stages.map((s) => {
        const n = list.filter((e) => e.status === s.status);
        return metricTile({ label: displayTeamName(s.label), value: `${n.length}건`, note: amountSummary(n, cur),
          tone: n.length ? "warn" : "ok", symbol: "clock", compact: true });
      }),
      metricTile({ label: "한도 초과", value: `${list.filter((e) => e.ineligibleAmount > 0).length}건`,
        tone: list.some((e) => e.ineligibleAmount > 0) ? "bad" : "neutral", symbol: "alert", compact: true }),
    );
    for (const id of [...selected]) if (!list.some((e) => e.id === id && bulkable(e))) selected.delete(id);
    paintBulk();
    clear(pagerBox);
    if (!list.length) {
      clear(tableWrap).append(empty("결재할 증빙이 없습니다"));
      return;
    }
    const pageRows = pager.slice(list); // 선택은 쪽을 넘어서도 유지, '전체 선택'은 지금 보이는 쪽만
    pagerBox.append(pager.node(list.length));
    const canBulk = pageRows.filter(bulkable);
    const selectAll = () => {
      const all = h("input", { type: "checkbox", class: "check", "aria-label": "이 페이지 전체 선택", disabled: !canBulk.length });
      all.checked = canBulk.length > 0 && canBulk.every((e) => selected.has(e.id));
      all.addEventListener("change", () => {
        canBulk.forEach((e) => (all.checked ? selected.add(e.id) : selected.delete(e.id)));
        paint();
      });
      return all;
    };
    const selectOne = (e) => {
      const cb = h("input", { type: "checkbox", class: "check", "aria-label": "선택", disabled: !bulkable(e) });
      cb.checked = selected.has(e.id);
      cb.addEventListener("click", (ev) => ev.stopPropagation());
      cb.addEventListener("change", () => ((cb.checked ? selected.add(e.id) : selected.delete(e.id)), paint()));
      return cb;
    };
    clear(tableWrap).append(
      h(
        "table",
        { class: "table table-entries queue-table" },
        h(
          "thead",
          {},
          h("tr", {}, h("th", { class: "cell-check" }, selectAll()), h("th", {}, "지국"), h("th", {}, "사용일"), h("th", {}, "가맹점"), h("th", {}, "계정"),
            h("th", { class: "queue-amount" }, "금액"), h("th", {}, "상태"), h("th", {}, "결재 단계"), h("th", {}, "AI 판정")),
        ),
        h(
          "tbody",
          {},
          pageRows.map((e) => {
            const last = (e.approvals || []).at(-1);
            const open = () => openDrawer(e.id, me, load);
            return h(
              "tr",
              { class: `row-link${selected.has(e.id) ? " selected" : ""}`, onclick: open },
              h("td", { class: "cell-check" }, selectOne(e)),
              h("td", {}, `${BRANCH[e.branchId] || e.branchId}`),
              h("td", { class: "mono" }, dateText(e.txnDate), h("div", { class: "cell-sub" }, quarterLabel(periodOfEntry(e)))),
              h("td", { class: "cell-merchant" },
                h("div", { class: "cell-main" }, h("button", { class: "queue-open", type: "button", onclick: (event) => { event.stopPropagation(); open(); } }, e.merchantKo || e.merchant || "증빙 상세")),
                e.memo ? h("div", { class: "cell-sub" }, e.memo) : null),
              h("td", {}, e.account || "—"),
              h("td", { class: "queue-amount mono strong" }, money(e.amount, e.currency)),
              // 올라온 시각·직전 결재자는 마우스를 올리면 보인다
              h("td", { title: `올라온 시각 ${dateTime(last?.at || e.updatedAt)}${last?.roleLabel ? ` · ${displayTeamName(last.roleLabel)}` : ""}` },
                h("div", { class: "queue-status" }, statusChip(e.status), resubmittedBadge(e), statusDetail(e))),
              h("td", {}, compactFlow(e)),
              h("td", { class: "queue-ai" }, aiGateMark(e.aiGate, { all: true })),
            );
          }),
        ),
      ),
      h("div", { class: "mobile-receipts" },
        canBulk.length ? h("label", { class: "receipt-card-select-all" }, selectAll(), "이 페이지 전체 선택") : null,
        h("ul", { class: "receipt-cards", "aria-label": "결재할 증빙" }, pageRows.map((e) => mobileReceiptCard(e, {
          selection: bulkable(e) ? selectOne(e) : null,
          open: () => openDrawer(e.id, me, load), branch: BRANCH[e.branchId] || e.branchId,
          statusDetail: statusDetail(e),
          below: h("dl", { class: "queue-card-meta" },
            h("dt", {}, "결재 단계"), h("dd", {}, compactFlow(e)),
            h("dt", {}, "AI 판정"), h("dd", { class: "queue-ai" }, aiGateMark(e.aiGate, { all: true }))),
        })))),
    );
  }

  function paintBulk() {
    clear(bulk);
    bulk.classList.toggle("show", selected.size > 0);
    if (!selected.size) return;
    const picked = rows.filter((e) => selected.has(e.id));
    const label = BULK[picked[0].status]?.label || "선택 결재";
    bulk.append(
      h("span", {}, h("b", {}, `${selected.size}건`), ` 선택 · ${amountSummary(picked)}`),
      h(
        "div",
        { class: "bulk-actions" },
        h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => (selected.clear(), paint()) }, "선택 해제"),
        h("button", { class: "btn btn-primary btn-sm", type: "button", onclick: () => bulkApprove(picked) }, icon("check"), h("span", {}, label)),
      ),
    );
  }

  async function bulkApprove(picked) {
    if (reviewing) return;
    reviewing = true;
    const classify = picked[0]?.status === "submitted";
    const chief = picked[0]?.status === "chief_review";
    const action = classify ? "적격 분류" : chief ? "승인" : "최종 결재";
    const ok = await confirmDialog({
      title: `${picked.length}건 ${action}`,
      message: h("div", {},
        h("p", {}, `합계 ${amountSummary(picked)}`),
        h("p", {}, classify || chief ? "재무팀 최종 검토로 보냅니다." : "선택한 증빙의 결재를 완료합니다."),
        chief ? h("ul", { class: "reason-list" }, picked.slice(0, 8).map((e) => h("li", {}, h("b", {}, `${e.merchantKo || e.merchant || "—"} ${money(e.amount, e.currency)}`), " — ", reasonParts(e).map(([k, v]) => `${k}: ${v}`).join(" · ") || "사유 없음"))) : null,
        chief && picked.length > 8 ? h("p", { class: "muted small" }, `외 ${picked.length - 8}건`) : null),
      confirm: action,
    });
    if (!ok) {
      reviewing = false;
      return;
    }
    let done = 0;
    const failed = [];
    for (const e of picked) {
      try {
        await api.post(`/entries/${e.id}/review`, { ...BULK[e.status].body(), expectedStatus: e.status });
        done++;
      } catch (ex) {
        failed.push(`${e.merchant || e.id}: ${errorText(ex)}`);
      }
    }
    toast(failed.length ? `${done}건 처리, ${failed.length}건 실패 — ${failed[0]}` : `${done}건 ${action} 완료`, failed.length ? "bad" : "ok", 6000);
    await load();
    reviewing = false;
  }

  load();
}

