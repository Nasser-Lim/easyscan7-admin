// 결재함 — 내 역할이 결재할 단계의 전표(전 지국). 행을 열어 원본 대조 후 결재, 단순 승인 단계는 일괄 처리.
import { api } from "../api.js";
import {
  BRANCH, ELIGIBILITY, ROLE, chip, clear, confirmDialog, dateText, dateTime, empty, errorText, h, icon, money,
  quarterLabel, select, spinner, statusChip, toast,
} from "../ui.js";
import { openDrawer } from "./entries.js";
import { pageHeader, setNavBadge } from "./shell.js";

const ROLE_GUIDE = {
  imc: "제출된 전표를 원본과 대조해 적격 / 비적격으로 분류합니다. 적격은 보도IMC팀장 전결로, 비적격은 보도국장 전결로 올라갑니다.",
  imc_head: "제출된 전표를 적격 / 비적격으로 분류합니다. 적격은 바로 전결해 재무팀으로, 비적격은 보도국장 전결로 올립니다.",
  bureau_chief: "보도IMC팀이 비적격으로 분류한 전표입니다. 승인하면 재무팀 최종 검토로, 불승인하면 지급하지 않고 종결됩니다.",
  division_head: "보도IMC팀이 비적격으로 분류한 전표입니다. 승인하면 재무팀 최종 검토로, 불승인하면 지급하지 않고 종결됩니다.",
  finance: "결재선을 거친 전표의 증빙을 최종 검토하고 전표를 결재합니다. 문제가 있으면 사유를 적어 지국으로 반려합니다.",
  admin: "재무팀 최종 검토 단계 전표입니다.",
};
// 열어 보지 않고 일괄 처리해도 되는 단계: 재무팀 최종 결재, IMC팀장의 적격 전결(한도 초과가 없는 전표만)
const BULK = {
  finance_review: { roles: ["finance", "admin"], label: "선택 최종 결재", body: () => ({ action: "approve" }) },
  submitted: { roles: ["imc_head"], label: "선택 적격 전결", body: () => ({ action: "approve", eligibility: "eligible" }), ok: (e) => !(e.ineligibleAmount > 0) },
  imc_head_review: { roles: ["imc_head"], label: "선택 적격 전결", body: () => ({ action: "approve", eligibility: "eligible" }), ok: (e) => !(e.ineligibleAmount > 0) },
};

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

export function renderInbox(el, { me }) {
  let rows = [];
  let stages = [];
  const selected = new Set();
  const branchSel = select([["all", "전체 지국"], ...Object.entries(BRANCH).map(([id, n]) => [id, `${n}지국`])], branchFilter, { class: "input input-sm" });
  const kpiBar = h("div", { class: "kpis kpis-sm" });
  const bulk = h("div", { class: "bulkbar" });
  const tableWrap = h("div", { class: "table-wrap" }, h("div", { class: "card-loading" }, spinner()));
  branchSel.addEventListener("change", () => ((branchFilter = branchSel.value), paint()));

  el.append(
    pageHeader({
      crumbs: ["본사", ROLE[me.role] || me.role],
      title: "결재함",
      desc: ROLE_GUIDE[me.role] || "",
      actions: [h("button", { class: "btn btn-ghost", type: "button", onclick: () => load() }, icon("refresh"), h("span", {}, "새로고침"))],
    }),
    kpiBar,
    h(
      "section",
      { class: "card card-flush" },
      h("div", { class: "toolbar" }, h("div", { class: "toolbar-filters" }, branchSel), h("div", { class: "muted small" }, "오래 기다린 순")),
      bulk,
      tableWrap,
    ),
  );

  async function load() {
    clear(tableWrap).append(h("div", { class: "card-loading" }, spinner()));
    selected.clear();
    try {
      const r = await api.get("/entries/queue");
      rows = r.entries;
      stages = r.stages;
      setNavBadge("inbox", rows.length);
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
    const cur = list.find((e) => e.currency)?.currency || "USD";
    clear(kpiBar).append(
      ...stages.map((s) => {
        const n = list.filter((e) => e.status === s.status);
        return mini(s.label, `${n.length}건`, money(n.reduce((a, e) => a + (Number(e.amount) || 0), 0), cur), n.length ? "warn" : "ok");
      }),
      mini("한도 초과 포함", `${list.filter((e) => e.ineligibleAmount > 0).length}건`, "비적격 금액이 있는 전표", list.some((e) => e.ineligibleAmount > 0) ? "bad" : null),
    );
    for (const id of [...selected]) if (!list.some((e) => e.id === id && bulkable(e))) selected.delete(id);
    paintBulk();
    if (!list.length) {
      clear(tableWrap).append(empty("결재할 전표가 없습니다", "새로 올라오는 전표는 여기에 쌓입니다."));
      return;
    }
    const canBulk = list.filter(bulkable);
    const all = h("input", { type: "checkbox", class: "check", "aria-label": "전체 선택", disabled: !canBulk.length });
    all.checked = canBulk.length > 0 && canBulk.every((e) => selected.has(e.id));
    all.addEventListener("change", () => {
      canBulk.forEach((e) => (all.checked ? selected.add(e.id) : selected.delete(e.id)));
      paint();
    });
    clear(tableWrap).append(
      h(
        "table",
        { class: "table table-entries" },
        h(
          "thead",
          {},
          h("tr", {}, h("th", { class: "cell-check" }, all), h("th", {}, "지국"), h("th", {}, "사용일"), h("th", {}, "가맹점"), h("th", {}, "계정"),
            h("th", { class: "num" }, "금액"), h("th", { class: "num" }, "한도 초과"), h("th", {}, "분류"), h("th", {}, "단계"), h("th", {}, "올라온 시각")),
        ),
        h(
          "tbody",
          {},
          list.map((e) => {
            const cb = h("input", { type: "checkbox", class: "check", "aria-label": "선택", disabled: !bulkable(e) });
            cb.checked = selected.has(e.id);
            cb.addEventListener("click", (ev) => ev.stopPropagation());
            cb.addEventListener("change", () => ((cb.checked ? selected.add(e.id) : selected.delete(e.id)), paint()));
            const last = (e.approvals || []).at(-1);
            const elig = e.eligibility ? ELIGIBILITY[e.eligibility] : null;
            return h(
              "tr",
              { class: `row-link${selected.has(e.id) ? " selected" : ""}`, onclick: () => openDrawer(e.id, me, load) },
              h("td", { class: "cell-check" }, cb),
              h("td", {}, `${BRANCH[e.branchId] || e.branchId}`),
              h("td", { class: "mono" }, dateText(e.txnDate), h("div", { class: "cell-sub" }, quarterLabel(e.quarter))),
              h("td", {}, h("div", { class: "cell-main" }, e.merchantKo || e.merchant || "—"), e.memo ? h("div", { class: "cell-sub" }, e.memo) : null),
              h("td", {}, e.account || "—"),
              h("td", { class: "num strong" }, money(e.amount, e.currency)),
              h("td", { class: `num ${e.ineligibleAmount > 0 ? "text-bad" : "muted"}` }, e.ineligibleAmount > 0 ? money(e.ineligibleAmount, e.currency) : "—"),
              h("td", {}, elig ? chip(elig[0], elig[1]) : e.ineligibleAmount > 0 ? chip("비적격 권장", "bad") : h("span", { class: "muted" }, "—")),
              h("td", {}, statusChip(e.status)),
              h("td", { class: "cell-sub mono" }, dateTime(last?.at || e.updatedAt), last ? h("div", { class: "cell-sub" }, `${last.roleLabel || ""} ${last.email || ""}`) : null),
            );
          }),
        ),
      ),
    );
  }

  function paintBulk() {
    clear(bulk);
    bulk.classList.toggle("show", selected.size > 0);
    if (!selected.size) return;
    const picked = rows.filter((e) => selected.has(e.id));
    const cur = picked.find((e) => e.currency)?.currency || "USD";
    const label = BULK[picked[0].status]?.label || "선택 결재";
    bulk.append(
      h("span", {}, h("b", {}, `${selected.size}건`), ` 선택 · ${money(picked.reduce((a, e) => a + (Number(e.amount) || 0), 0), cur)}`),
      h(
        "div",
        { class: "bulk-actions" },
        h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => (selected.clear(), paint()) }, "선택 해제"),
        h("button", { class: "btn btn-primary btn-sm", type: "button", onclick: () => bulkApprove(picked) }, icon("check"), h("span", {}, label)),
      ),
    );
  }

  async function bulkApprove(picked) {
    const ok = await confirmDialog({
      title: `전표 ${picked.length}건 결재`,
      message: h("div", {}, h("p", {}, "선택한 전표를 원본과 대조했나요? 결재하면 다음 단계로 넘어갑니다."),
        h("p", { class: "muted small" }, "한도 초과(비적격 금액)가 있는 전표는 일괄 처리에서 제외됩니다 — 하나씩 열어 결재하세요.")),
      confirm: "결재",
    });
    if (!ok) return;
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
    toast(failed.length ? `${done}건 결재, ${failed.length}건 실패 — ${failed[0]}` : `${done}건을 결재했습니다`, failed.length ? "bad" : "ok", 6000);
    load();
  }

  load();
}

function mini(label, value, sub, tone) {
  return h("div", { class: `kpi kpi-mini${tone ? " kpi-" + tone : ""}` }, h("div", { class: "kpi-label" }, label), h("div", { class: "kpi-value" }, String(value)), h("div", { class: "kpi-sub" }, sub));
}

