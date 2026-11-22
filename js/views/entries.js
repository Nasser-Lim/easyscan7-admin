// 증빙 조회 — 필터·정렬 목록, 일괄 제출, 상세 서랍(원본 증빙 대조 + 수정·제출·삭제 / 결재).
// 지국 담당자: 자기 지국 · 본사 결재자: 전 지국(지국 필터), 결재는 결재함 또는 이 화면의 상세 서랍에서.
import { api } from "../api.js?v=8bbda7c";
import {
  ACCOUNTS, ACTION_LABEL, BRANCH, DOC_TYPE, ELIGIBILITY, FINAL, IN_REVIEW, NON_REVIEW_ACCOUNT_LABEL, ROLE, STAFF_EDITABLE, STATUS, WRITING_STATUSES, chip, clear,
  confirmDialog, promptDialog, dateText, dateTime, displayTeamName, empty, errorText, field, h, icon, money, noticeParts,
  ALL_ACCOUNTS, accountSelect, isCoreAccount, metricTile, mobileDisclosure, mobileReceiptCard, periodBadge, quarterLabel, quarterOf, resubmittedBadge, select, spinner, statusChip, tip, toast,
} from "../ui.js?v=8bbda7c";
import { currentPeriod, getMode, isDateRange, isPeriodOf, periodCaption, periodOfEntry, periodOptions, periodControls,
  savedDateRange, unitName } from "../period.js?v=8bbda7c";
import { aiGatePanel } from "../aigate.js?v=8bbda7c";
import { createPager } from "../pager.js?v=8bbda7c";
import { compactFlow, flowDiagram } from "../flow.js?v=8bbda7c";
import { fxStrip, loadFx, sumIn } from "../fx.js?v=8bbda7c";
import { refreshInboxBadge } from "./inbox.js?v=8bbda7c";
import { pageHeader } from "./shell.js?v=8bbda7c";

const EDITABLE_STATUS = STAFF_EDITABLE; // 지국 담당자가 고치고 제출할 수 있는 상태
const STATUS_GROUPS = { writing: WRITING_STATUSES, review: IN_REVIEW };
const STATUS_OPTIONS = [["", "전체 상태"], ["writing", "작성중"], ["review", "결재 대기"],
  ...Object.keys(STATUS).filter((key) => key !== "deleted").map((key) => [key, STATUS[key].label])];
const NON_REVIEW_ACCOUNTS = Symbol("non-review accounts");
const ACCOUNT_PRESETS = [["", "전체 계정"], ["경상비", "경상비"], ["취재비", "취재비"], ["차량유지비", "차량유지비"],
  [NON_REVIEW_ACCOUNTS, NON_REVIEW_ACCOUNT_LABEL]];
const matchesAccount = (filter, account) => filter === NON_REVIEW_ACCOUNTS
  ? Boolean(account?.trim()) && !isCoreAccount(account)
  : !filter || account === filter;
// 화면을 옮겨 다녀도 필터는 유지(세션 동안)
// 정산 기간(월/분기)은 영수증 날짜로 자동 지정되므로 방금 올린 증빙이 이번 기간이 아닐 수 있다 — 기본은 전체("")
// 기간 선택지: 정산 방식에 따라 최근 12개월 또는 최근 4분기
const state = { period: "", account: "", status: "", q: "", sort: "txnDate", dir: -1, branch: "all" };

export function renderEntries(el, { me, params, query }) {
  const isStaff = me.role === "staff";
  const source = me.cloudData === true ? "cloud" : "local";
  const canWrite = isStaff && source === "local";
  const open = (id) => openDrawer(id, me, onChanged, source);
  let rows = [];
  let loadRevision = 0;
  const selected = new Set();

  const linkedPeriod = query.get("period");
  const validLinkedPeriod = isPeriodOf(linkedPeriod) || isDateRange(linkedPeriod);
  state.period = validLinkedPeriod ? linkedPeriod : savedDateRange() || (isPeriodOf(state.period) ? state.period : "");
  if (validLinkedPeriod || query.has("status")) {
    const linkedStatus = query.get("status");
    state.status = STATUS_OPTIONS.some(([value]) => value === linkedStatus) ? linkedStatus : "";
    state.account = "";
    state.q = "";
  } else if (params[0] === "returned") {
    state.status = "returned";
  }
  const quarter = periodControls(state.period, (p) => { state.period = p; pager.reset(); load(); });
  const account = accountSelect(state.account, { class: "input input-sm", "aria-label": "계정 필터" }, { blank: ACCOUNT_PRESETS[0][1], branch: me.branchId });
  // 필터의 묶음 선택지는 실제 계정 이름과 구분한다.
  const nonReviewOption = h("option", { value: "", selected: state.account === NON_REVIEW_ACCOUNTS }, NON_REVIEW_ACCOUNT_LABEL);
  account.insertBefore(nonReviewOption, account.firstElementChild.nextElementSibling);
  const status = select(STATUS_OPTIONS, state.status, { class: "input input-sm", "aria-label": "상태 필터" });
  const branchSel = isStaff ? null : select([["all", "전체 지국"], ...Object.entries(BRANCH).map(([id, n]) => [id, `${n}지국`])], state.branch, { class: "input input-sm" });
  branchSel?.addEventListener("change", () => ((state.branch = branchSel.value), pager.reset(), load()));
  const search = h("input", { class: "input input-sm", type: "search", placeholder: "가맹점·주문번호·적요 검색", value: state.q });
  const kpiBar = h("div", { class: "kpis kpis-sm entries-kpis", role: "group", "aria-label": "상태 빠른 필터" });
  const accountButtons = ACCOUNT_PRESETS.map(([value, label]) => {
    const count = h("span", { class: "account-preset-count", "aria-hidden": "true" });
    const button = h("button", {
      class: "btn btn-ghost btn-sm", type: "button", "aria-pressed": String(state.account === value),
      onclick: () => applyAccount(state.account === value ? "" : value),
    }, label, count);
    return { value, label, count, button };
  });
  const accountPresets = h("div", { class: "entry-account-presets", role: "group", "aria-label": "계정 빠른 필터" }, accountButtons.map(({ button }) => button));
  const statusSelection = h("span", { class: "entry-preset-selection" });
  const accountSelection = h("span", { class: "entry-preset-selection" });
  const presets = h("div", { class: "entry-presets" },
    h("div", { class: "entry-preset-section" }, mobileDisclosure(["상태별", statusSelection], kpiBar, "entry-status-presets", { expanded: true }), kpiBar),
    h("div", { class: "entry-preset-section" }, mobileDisclosure(["계정별", accountSelection], accountPresets, "entry-account-presets"), accountPresets));
  const fxBar = fxStrip();
  let fx = null;
  const bulk = h("div", { class: "bulkbar" });
  const tableWrap = h("div", { class: "table-wrap" }, h("div", { class: "card-loading" }, spinner()));
  const pager = createPager("entries", () => paint());
  const pagerBox = h("div", {});
  const refreshBtn = h("button", { class: "btn btn-ghost", type: "button", onclick: () => load() }, icon("refresh"), h("span", {}, "새로고침"));

  account.addEventListener("change", () => applyAccount(nonReviewOption.selected ? NON_REVIEW_ACCOUNTS : account.value));
  status.addEventListener("change", () => ((state.status = status.value), pager.reset(), paint()));
  search.addEventListener("input", () => ((state.q = search.value), pager.reset(), paint()));
  const filters = h("div", { class: "toolbar-filters" }, branchSel, quarter, account, status);

  el.append(
    pageHeader({
      crumbs: source === "cloud" ? ["운영 클라우드 · 읽기 전용"] : isStaff ? [] : ["본사"],
      title: isStaff ? "증빙 조회" : "전체 증빙",
      help: source === "cloud" ? "운영 클라우드에 저장된 증빙과 결재 진행 상황을 조회합니다."
        : isStaff
        ? "AI 가 읽은 내용을 원본과 대조해 고치고 제출합니다.\n결재 대상(세 계정)은 결재선으로, 기타 계정은 '보관'으로 제출됩니다.\n여기서 '결재'는 이 시스템 안의 결재이며 ERP 전표 결재와 별개입니다."
        : "전 지국 증빙과 결재 진행 상황입니다.\n여기서 '결재'는 이 시스템 안의 결재이며 ERP 전표 결재와 별개입니다.",
      actions: [refreshBtn, canWrite ? h("a", { class: "btn btn-primary", href: "#/upload" }, icon("upload"), h("span", {}, "증빙 업로드")) : null],
    }),
    fxBar.node,
    presets,
    h(
      "section",
      { class: "card card-flush" },
      h("div", { class: "toolbar mobile-toolbar" }, filters, h("div", { class: "toolbar-search" }, icon("search"), search), mobileDisclosure("필터", filters, "entry-filters")),
      bulk,
      tableWrap,
      pagerBox,
    ),
  );

  async function load() {
    const revision = ++loadRevision;
    clear(tableWrap).append(h("div", { class: "card-loading" }, spinner()));
    selected.clear();
    try {
      const params = new URLSearchParams();
      if (state.period) params.set("period", state.period);
      if (!isStaff) params.set("branch", state.branch);
      if (source === "cloud") params.set("source", source);
      const [loadedRows, loadedFx] = await Promise.all([api.get(`/entries${params.size ? `?${params}` : ""}`).then((r) => r.entries), loadFx()]);
      if (revision !== loadRevision) return;
      rows = loadedRows;
      fx = loadedFx;
      for (const { value, label, count, button } of accountButtons) {
        count.textContent = rows.filter((entry) => matchesAccount(value, entry.account)).length.toLocaleString("ko-KR");
        button.setAttribute("aria-label", `${label} ${count.textContent}건`);
      }
      paint();
    } catch (e) {
      if (revision === loadRevision) clear(tableWrap).append(h("p", { class: "card-error" }, errorText(e)));
    }
  }

  function visible() {
    const q = state.q.trim().toLowerCase();
    const statusGroup = STATUS_GROUPS[state.status];
    const out = rows.filter(
      (e) =>
        matchesAccount(state.account, e.account) &&
        (!state.status || (statusGroup ? statusGroup.has(e.status) : e.status === state.status)) &&
        (!q || [e.merchant, e.merchantKo, e.orderNumber, e.memo, e.purpose].some((v) => v && String(v).toLowerCase().includes(q))),
    );
    const k = state.sort;
    return out.sort((a, b) => {
      const x = a[k] ?? "";
      const y = b[k] ?? "";
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * state.dir;
    });
  }

  function paint() {
    statusSelection.textContent = state.status ? STATUS_OPTIONS.find(([key]) => key === state.status)?.[1] || "" : "";
    accountSelection.textContent = state.account ? accountButtons.find(({ value }) => value === state.account)?.label || state.account : "";
    // 합계는 지국 통화로 환산(현재 환율). 지국 담당자=자기 지국 통화, 본사: 한 지국을 고르면 그 지국 통화, 전체 지국이면 원화
    const cur = displayCurrency();
    const by = (set) => rows.filter((e) => set.has(e.status));
    const conv = (arr, f = "amount") => sumIn(arr, f, fx, cur);
    const sum = (arr, f = "amount") => conv(arr, f).total;
    const skipped = conv(rows).skipped;
    const scope = isStaff ? [me.branchId] : state.branch === "all" ? Object.keys(fx?.branchCurrency || {}) : [state.branch];
    // 환율 띠: 보고 있는 지국의 통화(뉴욕=원/달러, 베이징=원/위안…) + 증빙에 실제로 나온 다른 통화
    const shown = [...scope.map((b) => fx?.branchCurrency?.[b]), cur, ...rows.map((e) => e.currency)];
    fxBar.paint(
      fx,
      shown,
      skipped ? `환율 미확인 ${skipped}건 제외` : "",
    );
    const writing = by(STATUS_GROUPS.writing);
    const returned = by(new Set(["returned"]));
    clear(kpiBar).append(
      mini("전체", rows.length, money(sum(rows), cur), "receipt", "neutral", () => applyStatus(""), state.status === ""),
      mini("작성중", writing.length, money(sum(writing), cur), "edit", "neutral", () => applyStatus("writing"), state.status === "writing"),
      mini("반려됨", returned.length, money(sum(returned), cur), "return", returned.length ? "bad" : "neutral", () => applyStatus("returned"), state.status === "returned"),
      mini("결재 대기", by(IN_REVIEW).length, money(sum(by(IN_REVIEW)), cur), "clock", "info", () => applyStatus("review"), state.status === "review"),
      mini("결재 완료", by(new Set(["approved"])).length, money(sum(by(new Set(["approved"]))), cur), "check", "ok", () => applyStatus("approved"), state.status === "approved"),
      mini("비적격", money(sum(rows, "ineligibleAmount"), cur), "한도 초과분", "alert", sum(rows, "ineligibleAmount") > 0 ? "bad" : "neutral"),
    );

    const list = visible();
    for (const id of [...selected]) if (!list.some((e) => e.id === id && EDITABLE_STATUS.has(e.status))) selected.delete(id);
    paintBulk();
    clear(pagerBox);
    if (!list.length) {
      clear(tableWrap).append(rows.length ? empty("조건에 맞는 증빙이 없습니다", "필터를 바꿔 보세요.") : empty(`${state.period ? periodCaption(state.period) : "등록된"} 증빙이 없습니다`));
      return;
    }
    const pageRows = pager.slice(list); // 선택은 쪽을 넘어서도 유지하고, '전체 선택'은 지금 보이는 쪽만
    pagerBox.append(pager.node(list.length));
    const selectable = canWrite ? pageRows.filter((e) => EDITABLE_STATUS.has(e.status)) : [];
    const selectAll = () => {
      const all = h("input", { type: "checkbox", class: "check", "aria-label": "이 페이지 전체 선택", disabled: !selectable.length });
      all.checked = selectable.length > 0 && selectable.every((e) => selected.has(e.id));
      all.addEventListener("change", () => {
        selectable.forEach((e) => (all.checked ? selected.add(e.id) : selected.delete(e.id)));
        paint();
      });
      return all;
    };
    const selectOne = (e) => {
      const cb = h("input", { type: "checkbox", class: "check", "aria-label": "선택", disabled: !EDITABLE_STATUS.has(e.status) });
      cb.checked = selected.has(e.id);
      cb.addEventListener("click", (ev) => ev.stopPropagation());
      cb.addEventListener("change", () => ((cb.checked ? selected.add(e.id) : selected.delete(e.id)), paint()));
      return cb;
    };
    const th = (label, key, cls) =>
      h(
        "th",
        { class: `${cls || ""} sortable${state.sort === key ? " sorted" : ""}`, "aria-sort": state.sort === key ? (state.dir > 0 ? "ascending" : "descending") : null },
        h("button", { type: "button", class: "sort-button", onclick: () => ((state.dir = state.sort === key ? -state.dir : -1), (state.sort = key), pager.reset(), paint()) },
          label, h("span", { class: "sort-ind", "aria-hidden": "true" }, state.sort === key ? (state.dir > 0 ? "▲" : "▼") : "↕")),
      );
    clear(tableWrap).append(
      h(
        "table",
        { class: "table table-entries receipt-list" },
        h(
          "thead",
          {},
          h(
            "tr",
            {},
            canWrite ? h("th", { class: "cell-check" }, selectAll()) : null,
            isStaff ? null : th("지국", "branchId"),
            th("사용일", "txnDate"),
            th("가맹점", "merchant"),
            th("계정", "account"),
            th("증빙", "docType"),
            th("금액", "amount", "num"),
            th("상태", "status"),
            h("th", { scope: "col" }, "결재 단계"),
            th("등록", "createdAt"),
            canWrite ? h("th", { class: "cell-del" }) : null,
          ),
        ),
        h(
          "tbody",
          {},
          pageRows.map((e) => {
            const notes = (e.notices || []).length;
            const merchantMeta = [e.merchantKo && e.merchantKo !== e.merchant ? e.merchant : null,
              e.orderNumber ? `#${e.orderNumber}` : null].filter(Boolean).join(" · ");
            return h(
              "tr",
              { class: `row-link${selected.has(e.id) ? " selected" : ""}`, onclick: () => open(e.id) },
              canWrite ? h("td", { class: "cell-check" }, selectOne(e)) : null,
              isStaff ? null : h("td", {}, BRANCH[e.branchId] || e.branchId),
              h("td", { class: "mono" }, dateText(e.txnDate), h("div", { class: "q-line" }, periodBadge(periodOfEntry(e), currentPeriod()))),
              h(
                "td",
                { class: "cell-merchant" },
                h("div", { class: "cell-main" }, e.merchantKo || e.merchant || "—", notes ? h("span", { class: "dot-note", title: `알림 ${notes}건` }) : null),
                merchantMeta ? h("div", { class: "cell-sub" }, merchantMeta) : null,
              ),
              h("td", {}, e.account || h("span", { class: "text-warn" }, "계정 미분류")),
              h("td", { class: "cell-sub" }, DOC_TYPE[e.docType] || e.docType || "—"),
              h("td", { class: "num" }, h("span", { class: "strong" }, money(e.amount, e.currency)),
                e.ineligibleAmount > 0 ? h("div", { class: "cell-sub text-bad" }, `한도 초과 ${money(e.ineligibleAmount, e.currency)}`) : null),
              h("td", {}, statusChip(e.status), resubmittedBadge(e)),
              h("td", {}, compactFlow(e)),
              h("td", { class: "cell-sub mono" }, dateTime(e.createdAt)),
              canWrite ? h("td", { class: "cell-del" }, EDITABLE_STATUS.has(e.status) ? rowDelete(e) : null) : null,
            );
          }),
        ),
      ),
      h("div", { class: "mobile-receipts" },
        selectable.length ? h("label", { class: "receipt-card-select-all" }, selectAll(), "이 페이지 전체 선택") : null,
        h("ul", { class: "receipt-cards", "aria-label": "증빙 목록" }, pageRows.map((e) => mobileReceiptCard(e, {
          selection: canWrite && EDITABLE_STATUS.has(e.status) ? selectOne(e) : null,
          open: () => open(e.id), branch: isStaff ? null : BRANCH[e.branchId] || e.branchId,
          below: [compactFlow(e), e.ineligibleAmount > 0 ? h("span", { class: "text-bad" }, `한도 초과 ${money(e.ineligibleAmount, e.currency)}`) : null],
        })))),
    );
  }

  // 증빙 1건 삭제 — 지국 담당자가 작성중·검토 필요·반려 상태의 증빙만(서버도 같은 규칙). 한도 계산에서도 빠진다.
  function rowDelete(e) {
    return h(
      "button",
      {
        class: "icon-btn icon-btn-danger",
        type: "button",
        title: "삭제",
        "aria-label": "삭제",
        onclick: async (ev) => {
          ev.stopPropagation();
          const ok = await confirmDialog({ title: "증빙 삭제", message: h("div", {}, h("p", {}, `${e.merchantKo || e.merchant || "이 증빙"} ${money(e.amount, e.currency)} 을(를) 삭제할까요?`), h("p", { class: "muted small" }, "한도 계산에서도 빠지며 되돌릴 수 없습니다.")), confirm: "삭제", danger: true });
          if (!ok) return;
          try {
            await api.del(`/entries/${e.id}`);
            toast("삭제했습니다", "ok");
            load();
          } catch (ex) {
            toast(errorText(ex), "bad");
          }
        },
      },
      icon("trash"),
    );
  }

  async function bulkDelete(picked) {
    const ok = await confirmDialog({
      title: `증빙 ${picked.length}건 삭제`,
      message: h("div", {}, h("p", {}, `선택한 증빙 ${picked.length}건(${money(sumIn(picked, "amount", fx, displayCurrency()).total, displayCurrency())})을 삭제할까요?`), h("p", { class: "muted small" }, "한도 계산에서도 빠지며 되돌릴 수 없습니다.")),
      confirm: `${picked.length}건 삭제`,
      danger: true,
    });
    if (!ok) return;
    let done = 0;
    const failed = [];
    for (const e of picked) {
      try {
        await api.del(`/entries/${e.id}`);
        done++;
      } catch (ex) {
        failed.push(`${e.merchant || e.id}: ${errorText(ex)}`);
      }
    }
    toast(failed.length ? `${done}건 삭제, ${failed.length}건 실패 — ${failed[0]}` : `${done}건을 삭제했습니다`, failed.length ? "bad" : "ok", failed.length ? 6000 : 3800);
    load();
  }

  function displayCurrency() {
    const bc = fx?.branchCurrency || {};
    if (isStaff) return bc[me.branchId] || rows.find((e) => e.currency)?.currency || "USD";
    return state.branch === "all" ? "KRW" : bc[state.branch] || "USD";
  }

  function applyStatus(value) {
    state.status = value;
    status.value = value;
    pager.reset();
    paint();
    kpiBar.querySelector("[aria-pressed='true']")?.focus();
  }

  function applyAccount(value) {
    state.account = value;
    if (value === NON_REVIEW_ACCOUNTS) nonReviewOption.selected = true;
    else account.value = value;
    for (const preset of accountButtons) preset.button.setAttribute("aria-pressed", String(preset.value === value));
    pager.reset();
    paint();
  }

  function paintBulk() {
    clear(bulk);
    bulk.classList.toggle("show", selected.size > 0);
    if (!selected.size) return;
    const picked = rows.filter((e) => selected.has(e.id));
    const cur = displayCurrency();
    bulk.append(
      h("span", {}, h("b", {}, `${selected.size}건`), ` 선택 · ${money(sumIn(picked, "amount", fx, cur).total, cur)}`),
      h("div", { class: "bulk-actions" },
        h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => (selected.clear(), paint()) }, "선택 해제"),
        h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => bulkAccount(picked) }, "계정 변경"),
        h("button", { class: "btn btn-ghost btn-sm btn-bulk-danger", type: "button", onclick: () => bulkDelete(picked) }, icon("trash"), h("span", {}, "선택 삭제")),
        h("button", { class: "btn btn-primary btn-sm", type: "button", onclick: () => bulkSubmit(picked) }, icon("send"), h("span", {}, "선택 제출"))),
    );
  }

  async function bulkAccount(picked) {
    const next = accountSelect("", {}, { blank: "계정 선택", branch: me.branchId });
    const accepted = await confirmDialog({
      title: `증빙 ${picked.length}건 계정 변경`,
      message: field("변경할 계정", next),
      confirm: "계정 변경",
    });
    if (!accepted || !next.value) return;
    const missing = picked.filter((e) => next.value === "취재비" && !(e.memo || "").trim());
    if (missing.length) {
      toast(`적요가 없는 ${missing.length}건을 먼저 확인해 주세요`, "warn");
      return;
    }
    let changed = 0;
    let overLimit = 0;
    const failed = [];
    for (const e of picked.filter((row) => row.account !== next.value)) {
      try {
        const saved = await api.patch(`/entries/${e.id}`, { account: next.value });
        changed++;
        if (saved.ineligibleAmount > 0) overLimit++;
      } catch (err) { failed.push(errorText(err)); }
    }
    toast(`${changed}건 변경${overLimit ? ` · 한도 초과 ${overLimit}건` : ""}${failed.length ? ` · ${failed.length}건 실패 (${failed[0]})` : ""}`, failed.length ? "warn" : "ok");
    load();
  }

  async function bulkSubmit(picked) {
    const missing = picked.filter((e) => e.account === "취재비" && !(e.memo || "").trim());
    if (missing.length) {
      toast(`취재비 증빙 ${missing.length}건에 적요가 없습니다. 적요를 입력한 뒤 제출하세요.`, "warn", 5000);
      return;
    }
    const flagged = picked.filter((e) => e.status === "flagged").length;
    const ok = await confirmDialog({
      title: `증빙 ${picked.length}건 제출`,
      message: h("div", {},
        submitCheck(picked.slice(0, 6).map((e) => ({ amount: money(e.amount, e.currency), merchant: e.merchantKo || e.merchant, date: e.txnDate, account: e.account }))),
        picked.length > 6 ? h("p", { class: "muted small" }, `외 ${picked.length - 6}건`) : null,
        flagged ? h("p", { class: "text-warn" }, `검토 필요 ${flagged}건 포함`) : null),
      confirm: "제출",
    });
    if (!ok) return;
    let done = 0;
    let filed = 0;
    let aiReturned = 0;
    const failed = [];
    for (const e of picked) {
      try {
        const r = await api.post(`/entries/${e.id}/submit`, {});
        if (r.status === "returned") aiReturned++;
        else if (r.status === "filed") filed++;
        else done++;
      } catch (ex) {
        failed.push(`${e.merchant || e.id}: ${errorText(ex)}`);
      }
    }
    const parts = [`${done}건 제출`];
    if (filed) parts.push(`${filed}건 보관(기타 계정)`);
    if (aiReturned) parts.push(`${aiReturned}건은 AI 1차 검증에서 정책 위반으로 자동 반려(증빙을 열어 사유 확인 · 소명 후 재제출 가능)`);
    if (failed.length) parts.push(`${failed.length}건 실패 — ${failed[0]}`);
    toast(parts.join(" · "), failed.length ? "bad" : aiReturned ? "warn" : "ok", aiReturned || failed.length ? 7000 : undefined);
    load();
  }

  function onChanged() {
    load();
  }

  load();
  const [entryId] = params;
  if (entryId && entryId !== "returned") {
    history.replaceState(null, "", "#/entries");
    // 업로드 결과나 정책 의견에서 연 증빙은 해당 작업의 상세로 연결한다.
    const detailSource = query.get("work") === "1" ? "local" : source;
    openDrawer(entryId, me, onChanged, detailSource);
  }
}

// 제출 전 확인(G1) — 인식 오류를 놓치지 않게 금액·사용일·가맹점을 크게 보여 주고 1차 책임을 알린다
export function submitCheck(rows) {
  return h("div", { class: "submit-check" },
    rows.map((r) => h("div", { class: "sc-row" },
      h("div", { class: "sc-amount" }, r.amount),
      h("div", { class: "sc-meta" }, h("b", {}, r.merchant || "가맹점 미입력"), h("span", {}, r.date || "사용일 미입력"), r.account ? h("span", {}, r.account) : null))),
    h("p", { class: "sc-note" }, icon("alert"), h("span", {}, "원본과 금액·날짜·가맹점이 맞는지 확인하세요. 제출 내용의 1차 책임은 작성자에게 있습니다.")));
}

function mini(label, value, note, symbol, tone, onClick, pressed) {
  return metricTile({ label, value, note, symbol, tone, onClick, pressed, compact: true });
}

// ── 상세 서랍 ─────────────────────────────────────────────
let openBack = null;

export function openDrawer(id, me, onChanged, source = "local") {
  if (openBack) openBack.close();
  const urls = [];
  const body = h("div", { class: "drawer-body" }, h("div", { class: "card-loading" }, spinner()));
  const titleEl = h("div", { class: "drawer-title" }, "증빙 상세");
  const subEl = h("div", { class: "drawer-sub" });
  const foot = h("div", { class: "drawer-foot" });
  let dirty = () => false;

  const close = async (force = false) => {
    if (!force && dirty() && !(await confirmDialog({ title: "저장하지 않은 수정", message: "수정한 내용을 버리고 닫을까요?", confirm: "버리고 닫기", danger: true }))) return;
    back.querySelector(".receipt-photo-dialog[open]")?.close();
    urls.forEach((u) => URL.revokeObjectURL(u));
    document.removeEventListener("keydown", onKey);
    back.remove();
    document.body.classList.remove("no-scroll");
    openBack = null;
  };
  const onKey = (e) => e.key === "Escape" && !document.querySelector(".modal-back, .receipt-photo-dialog[open]") && close();
  const back = h(
    "div",
    { class: "drawer-back", onclick: (e) => e.target === back && close() },
    h(
      "aside",
      { class: "drawer", role: "dialog", "aria-modal": "true", "aria-label": "증빙 상세" },
      h("div", { class: "drawer-head" }, h("div", {}, titleEl, subEl), h("button", { class: "icon-btn", type: "button", title: "닫기", onclick: () => close() }, icon("x"))),
      body,
      foot,
    ),
  );
  back.close = close;
  openBack = back;
  document.body.append(back);
  document.body.classList.add("no-scroll");
  document.addEventListener("keydown", onKey);

  const cloud = source === "cloud";
  api
    .get(`/entries/${encodeURIComponent(id)}${cloud ? "?source=cloud" : ""}`)
    .then((e) => {
      if (!back.isConnected) return;
      clear(titleEl).append(h("span", { class: "drawer-merchant" }, e.merchantKo || e.merchant || "증빙 상세"), statusChip(e.status));
      const meta = [cloud ? "운영 클라우드 · 조회" : null, e.account, quarterLabel(periodOfEntry(e)), e.orderNumber ? `주문 #${e.orderNumber}` : null].filter(Boolean).join(" · ");
      clear(subEl).append(meta, h("span", { class: "drawer-id" }, `${meta ? " · " : ""}ID ${e.id}`));
      const form = detailForm(e, me, cloud);
      dirty = form.dirty;
      const details = h("section", { class: "detail-side", "aria-label": "증빙 정보" }, form.node);
      clear(body).append(h("div", { class: "detail" }, evidenceViewer(e, urls, cloud), details));
      if (cloud) {
        foot.hidden = true;
        return;
      }
      const ctx = { me, close, onChanged: () => (onChanged(), refreshInboxBadge(me)), reopen: () => openDrawer(id, me, onChanged) };
      clear(foot).append(...(e.stage?.canAct ? reviewFooter(e, form, ctx) : footer(e, form, ctx)));
    })
    .catch((ex) => clear(body).append(h("p", { class: "card-error" }, errorText(ex))));
}

function evidenceViewer(e, urls, cloud) {
  const ids = e.uploadIds || [];
  const stage = h("div", { class: "viewer-stage" });
  const tabs = h("div", { class: "viewer-tabs", role: "tablist" });
  const nameOf = (uid, i) => (e.sources || []).find((s) => s.uploadId === uid)?.fileName || `증빙 ${i + 1}`;
  const pagesOf = (uid) => [...new Set((e.sources || [])
    .filter((s) => s.uploadId === uid && Number.isInteger(s.page) && s.page > 0)
    .map((s) => s.page))].sort((a, b) => a - b);
  const cache = {};
  let active = 0;
  let size = localStorage.getItem("es7.viewer.size") || "fit";
  let request = 0;
  const sizes = select([["fit", "맞춤"], ["small", "작게"], ["large", "크게"]], size,
    { class: "input input-sm", "aria-label": "원본 보기 크기" });
  const photoButton = h("button", { class: "btn btn-ghost viewer-open-photo", type: "button", "aria-haspopup": "dialog" }, icon("expand"), "전체 화면");
  const viewer = h("section", { class: "viewer", dataset: { singleFile: String(ids.length === 1) } },
    h("div", { class: "viewer-head" }, h("span", { class: "section-label" }, "원본 증빙"),
      h("div", { class: "viewer-controls" }, ids.length ? sizes : null, photoButton)),
    tabs, stage);
  sizes.addEventListener("change", () => {
    size = sizes.value;
    localStorage.setItem("es7.viewer.size", size);
    if (ids[active]) show(ids[active], active);
  });

  async function show(uid, i) {
    active = i;
    const mine = ++request;
    [...tabs.children].forEach((t, j) => {
      t.classList.toggle("active", j === i);
      t.setAttribute("aria-selected", String(j === i));
    });
    viewer.dataset.kind = "";
    clear(stage).append(h("div", { class: "card-loading" }, spinner()));
    try {
      if (!cache[uid]) {
        const params = cloud ? `?source=cloud&entry=${encodeURIComponent(e.id)}` : "";
        const blob = await api.blob(`/uploads/${encodeURIComponent(uid)}/file${params}`);
        if (mine !== request || !stage.isConnected) return;
        const url = URL.createObjectURL(blob);
        urls.push(url);
        cache[uid] = { url, type: blob.type };
      }
      const { url, type } = cache[uid];
      const pages = pagesOf(uid);
      if (mine !== request) return;
      clear(stage);
      stage.scrollTo(0, 0);
      stage.dataset.size = size;
      const filename = nameOf(uid, i);
      const downloadFallback = (message) => {
        viewer.dataset.kind = "download";
        clear(stage).append(h("div", { class: "viewer-empty" }, icon("image", "ic empty-ic"), h("div", {}, message),
          h("a", { class: "btn btn-ghost btn-sm", href: url, download: filename }, "원본 내려받기")));
      };
      if (type === "application/pdf") {
        viewer.dataset.kind = "pdf";
        const zoom = size === "large" ? "150" : size === "small" ? "65" : "page-fit";
        stage.append(h("iframe", { class: "viewer-pdf", src: `${url}#page=${pages[0] || 1}&zoom=${zoom}`, title: filename }));
      } else if (type === "image/heic" || type === "image/heif") {
        downloadFallback("이 사진 형식은 브라우저에서 미리 볼 수 없습니다.");
      } else {
        viewer.dataset.kind = "image";
        const openPhoto = () => openReceiptPhoto(viewer, url, filename);
        const openLabel = `원본 증빙 열기 · ${filename}`;
        photoButton.onclick = openPhoto;
        const img = h("img", { class: "viewer-img", src: url, alt: "", draggable: false, onerror: () => {
          if (mine === request) downloadFallback("미리보기를 표시할 수 없습니다.");
        } });
        stage.append(h("button", { class: "viewer-photo", type: "button", "aria-label": openLabel, "aria-haspopup": "dialog", onclick: openPhoto },
          h("span", { class: "viewer-photo-preview" }, img),
          h("span", { class: "viewer-photo-caption" }, "원본 증빙"),
          h("span", { class: "viewer-photo-expand" }, icon("expand"))));
      }
    } catch (ex) {
      if (mine !== request) return;
      viewer.dataset.kind = "";
      clear(stage).append(h("div", { class: "viewer-empty" }, icon("alert", "ic empty-ic"), h("div", {}, `원본을 불러오지 못했습니다 — ${errorText(ex)}`)));
    }
  }

  ids.forEach((uid, i) => {
    const filename = nameOf(uid, i);
    const pdf = /\.pdf$/i.test(filename);
    const pages = pdf ? pagesOf(uid) : [];
    tabs.append(
      h(
        "button",
        { class: "viewer-tab", type: "button", role: "tab", onclick: () => show(uid, i), title: filename },
        icon(pdf ? "pdf" : "image"),
        h("span", { class: "viewer-tab-name" }, filename),
        pages.length ? h("span", { class: "viewer-tab-page" }, `${pages.join(",")}쪽`) : null,
      ),
    );
  });
  if (ids.length) show(ids[0], 0);
  else stage.append(h("div", { class: "viewer-empty" }, icon("file", "ic empty-ic"), h("div", {}, "연결된 원본 증빙이 없습니다.")));

  return viewer;
}

function openReceiptPhoto(viewer, url, filename) {
  const levels = [1, 1.5, 2, 3, 4];
  const fitWidth = getComputedStyle(viewer).getPropertyValue("--receipt-photo-width-fit").trim() === "1";
  const fitLabel = fitWidth ? "너비 맞춤" : "전체 맞춤";
  let level = 0;
  let positioned = false;
  const zoomOut = h("button", { class: "icon-btn", type: "button", "aria-label": "축소", onclick: () => changeZoom(level - 1) }, icon("minus"));
  const zoomIn = h("button", { class: "icon-btn", type: "button", "aria-label": "확대", onclick: () => changeZoom(level + 1) }, icon("plus"));
  const fit = h("button", { class: "receipt-photo-fit", type: "button", "aria-label": fitLabel, onclick: () => changeZoom(0) });
  const photo = h("img", { class: "receipt-photo-img", src: url, alt: filename, draggable: false, onload: resize });
  const frame = h("div", { class: "receipt-photo-frame" }, photo);
  const viewport = h("div", { class: "receipt-photo-viewport", role: "region", "aria-label": "원본 사진", tabindex: "0" }, frame);
  const close = h("button", { class: "icon-btn receipt-photo-close", type: "button", "aria-label": "원본 보기 닫기",
    autofocus: true, onclick: () => dialog.close() }, icon("x"));
  const dialog = h("dialog", { class: "receipt-photo-dialog", "aria-label": "원본 증빙 전체 화면" },
    h("header", { class: "receipt-photo-head" }, h("div", {}, h("h2", {}, "원본 증빙"), h("p", {}, filename)), close),
    viewport,
    h("footer", { class: "receipt-photo-tools" }, h("div", { class: "receipt-photo-zoom", role: "group", "aria-label": "사진 크기" }, zoomOut, fit, zoomIn)));

  // Keep the same part of the document in the center when its scale changes.
  function resize() {
    if (!photo.naturalWidth || !viewport.clientWidth || !viewport.clientHeight) return;
    const centerX = (viewport.scrollLeft + viewport.clientWidth / 2 - photo.offsetLeft) / photo.offsetWidth;
    const centerY = (viewport.scrollTop + viewport.clientHeight / 2 - photo.offsetTop) / photo.offsetHeight;
    const padding = 2 * parseFloat(getComputedStyle(frame).paddingLeft);
    const widthScale = (viewport.clientWidth - padding) / photo.naturalWidth;
    const fitScale = fitWidth ? widthScale : Math.min(widthScale, (viewport.clientHeight - padding) / photo.naturalHeight);
    photo.style.width = `${Math.max(1, Math.floor(photo.naturalWidth * fitScale * levels[level]))}px`;
    if (positioned) {
      viewport.scrollTo(
        photo.offsetLeft + (Number.isFinite(centerX) ? centerX : .5) * photo.offsetWidth - viewport.clientWidth / 2,
        photo.offsetTop + (Number.isFinite(centerY) ? centerY : .5) * photo.offsetHeight - viewport.clientHeight / 2,
      );
    }
    positioned = true;
  }

  function changeZoom(next) {
    level = Math.max(0, Math.min(next, levels.length - 1));
    zoomOut.disabled = level === 0;
    zoomIn.disabled = level === levels.length - 1;
    fit.textContent = level ? `${levels[level] * 100}% · 맞춤` : fitLabel;
    resize();
  }

  const observer = new ResizeObserver(resize);
  dialog.addEventListener("close", () => {
    observer.disconnect();
    dialog.remove();
  }, { once: true });
  viewer.append(dialog);
  dialog.showModal();
  changeZoom(0);
  observer.observe(viewport);
}

function canEdit(e, me) {
  if (me.role === "staff") return EDITABLE_STATUS.has(e.status);
  if (me.role === "finance" || me.role === "admin") return e.status === "finance_review"; // 최종 검토 중 정정
  return false; // 보도BIZ팀·보도국장은 고치지 않고 반려한다
}

function detailForm(e, me, readOnly = false) {
  const editable = !readOnly && canEdit(e, me);
  const cur = e.currency || "USD";
  const conf = e.fieldConfidence || {};
  // 서버 규칙(lowconf-amount·lowconf-date)과 같은 기준
  const CONF = { amount: [e.handwrittenTotal != null && conf.handwritten_total != null ? "handwritten_total" : "printed_total", 0.9],
    txnDate: [e.docType === "ONLINE_ORDER_INVOICE" && conf.ordered_on != null ? "ordered_on" : "transacted_on", 0.85],
    merchant: ["merchant_name", 0.8] };
  const confOf = (k) => conf[CONF[k]?.[0]];
  const lowConf = (k) => CONF[k] && typeof confOf(k) === "number" && confOf(k) < CONF[k][1];

  const inputs = {
    account: accountSelect(e.account, { disabled: !editable }, { blank: "계정 선택", branch: e.branchId }),
    txnDate: h("input", { class: "input", type: "date", value: e.txnDate || "", disabled: !editable }),
    amount: h("input", { class: "input num", type: "number", step: "0.01", min: "0", value: e.amount != null ? Number(e.amount).toFixed(2) : "",
      disabled: !editable || Boolean(e.splitFrom || e.splitChildren?.length) }),
    merchant: h("input", { class: "input", type: "text", value: e.merchant || "", disabled: !editable }),
    merchantKo: h("input", { class: "input", type: "text", value: e.merchantKo || "", disabled: !editable }),
    memo: h("textarea", { class: "input", rows: "2", disabled: !editable, placeholder: "취재 건명·동석자 등" }, e.memo || ""),
    // 정산 기간 — 정산 방식에 따라 월('2026-10') 또는 분기('2026Q4'). 서버에는 month 또는 quarter 로 보낸다
    quarter: select(
      [...new Set([...periodOptions(), periodOfEntry(e)].filter(Boolean))].sort().reverse().map((q) => [q, quarterLabel(q)]),
      periodOfEntry(e),
      { disabled: !editable },
    ),
  };
  const isMonth = getMode() === "month";
  const periodOfDate = (d) => (isMonth ? (/^\d{4}-\d{2}/.test(d || "") ? d.slice(0, 7) : null) : quarterOf(d));
  // 기간을 직접 고르지 않았으면 사용일을 따라간다(서버도 같은 규칙). 고르면 고정
  let quarterTouched = false;
  const quarterHint = h("span", { class: "field-hint" });
  const syncQuarterHint = () => {
    const off = inputs.txnDate.value && periodOfDate(inputs.txnDate.value) !== inputs.quarter.value;
    quarterHint.textContent = quarterTouched || e.quarterSource === "manual" ? "직접 지정" : "사용일 기준";
    if (off) quarterHint.textContent += ` · 사용일과 다른 ${unitName()}`;
    quarterHint.classList.toggle("text-warn", !!off);
  };
  inputs.txnDate.addEventListener("input", () => {
    if (!quarterTouched && e.quarterSource !== "manual") inputs.quarter.value = periodOfDate(inputs.txnDate.value) || inputs.quarter.value;
    syncQuarterHint();
  });
  inputs.quarter.addEventListener("change", () => ((quarterTouched = true), syncQuarterHint()));
  syncQuarterHint();
  const original = Object.fromEntries(Object.entries(inputs).map(([k, el]) => [k, el.value]));
  const reportMeta = e.settlementEvidence || {};
  const showReport = e.branchId === "newyork" && e.account && !isCoreAccount(e.account);
  const reportInput = (k, maxlength) => h("input", { class: "input", type: "text", maxlength, value: reportMeta[k] || "", disabled: !editable });
  const reportFields = showReport ? {
    payee: reportInput("payee", 200), service_period: reportInput("service_period", 120), basis: reportInput("basis", 500),
    site: e.account === "통신비" ? select([["", "미확인"], ["office", "사무실"], ["housing", "사택"]], reportMeta.site || "", { disabled: !editable }) : null,
  } : null;
  const payrollAccount = "현지채용인 급여.시간외수당.상여";
  const confirmedPay = new Map((reportMeta.payroll_components || []).map((x) => [x.kind, x.net_amount]));
  const payrollInputs = showReport && e.account === payrollAccount ? [["salary", "급여"], ["overtime", "시간외수당"], ["bonus", "상여"]].map(([kind, label]) => {
    const input = h("input", { class: "input num", type: "number", min: "0", step: "0.01", value: confirmedPay.get(kind) ?? "", disabled: !editable });
    return { kind, label, input };
  }) : [];
  const paymentConfirmed = showReport && e.paymentPending ? h("input", { type: "checkbox", class: "check", disabled: !editable }) : null;
  const memoHint = h("span", { class: "field-hint" });
  const syncMemoHint = () => {
    const need = inputs.account.value === "취재비";
    memoHint.textContent = need ? "취재비는 적요가 필수입니다" : "";
    memoHint.classList.toggle("text-warn", need && !inputs.memo.value.trim());
  };
  inputs.account.addEventListener("change", syncMemoHint);
  inputs.memo.addEventListener("input", syncMemoHint);
  syncMemoHint();
  // 적요 초안은 AI 가 영수증만 보고 쓴 것이라 업무 맥락(누구와·왜)이 없다 — 눈에 띄게 고쳐 쓰도록 안내한다.
  // 수정 가능한 증빙에서만, 사용자가 문구를 고치기 시작하면 사라진다.
  const memoTip = h("span", { class: "memo-tip", role: "note" }, icon("info"), h("span", {}, "AI가 작성한 문구를 구체적으로 바꿔주세요"));
  const syncMemoTip = () => memoTip.classList.toggle("hide", !editable || inputs.memo.value !== original.memo);
  inputs.memo.addEventListener("input", syncMemoTip);
  syncMemoTip();

  const mark = (k, el) => (lowConf(k) ? h("div", { class: "lowconf" }, el, h("span", { class: "lowconf-tag", title: `AI 신뢰도 ${Math.round(confOf(k) * 100)}%` }, "확인")) : el);

  const banners = [];
  if (e.ineligibleAmount > 0)
    banners.push(banner("bad", "alert", "한도 초과 — 비적격", `분기 한도를 넘어 ${money(e.ineligibleAmount, cur)} 가 비적격 처리되었습니다(적격 ${money(e.eligibleAmount, cur)}). 제출은 가능합니다.`));
  for (const f of (e.flags || []).filter((x) => x.ruleId !== "ai-policy")) banners.push(banner(f.severity === "error" ? "bad" : "warn", "alert", f.severity === "error" ? "검증 오류" : "검토 필요", f.message));
  for (const n of e.notices || []) {
    const p = noticeParts(n);
    banners.push(banner(p.tone === "bad" ? "bad" : p.tone === "warn" ? "warn" : "info", "info", p.label, p.text));
  }
  if (e.status === "returned")
    banners.unshift(banner("bad", "alert", "반려됨 — 고쳐서 다시 제출하세요", e.returnedReason || "사유 없음"));
  if (IN_REVIEW.has(e.status) && !e.stage?.canAct)
    banners.push(banner("info", "info", STATUS[e.status].label, me.role === "staff" ? (e.status === "submitted" ? "보도BIZ팀이 아직 분류하기 전입니다. 아래 [제출 취소]로 되돌려 다시 고칠 수 있습니다." : "결재 진행 중입니다. 반려되면 다시 고칠 수 있습니다.") : "다른 단계의 결재를 기다리는 증빙입니다."));
  if (e.status === "approved") banners.push(banner("ok", "check", "결재 완료", "재무팀 결재까지 끝난 증빙이라 수정할 수 없습니다."));
  if (e.status === "rejected") banners.push(banner("bad", "x", "불승인", "비적격 증빙으로 지급하지 않기로 결재되었습니다(한도에서도 빠짐)."));

  const items = e.lineItems || [];
  const node = h(
    "div",
    { class: "detail-form" },
    flowDiagram(e),
    aiGatePanel(e.aiGate, me.role === "staff" ? "staff" : "reviewer"),
    banners.length ? h("div", { class: "banners" }, banners) : null,
    h("div", { class: "section-label" }, "증빙 정보"),
    h(
      "div",
      { class: "form-grid" },
      field("계정", inputs.account),
      field("사용일", mark("txnDate", inputs.txnDate)),
      field(`금액 (${cur})`, mark("amount", inputs.amount)),
      h("label", { class: "field" }, h("span", { class: "field-label" }, `정산 ${unitName()}`), inputs.quarter, quarterHint),
      field("가맹점 (원문)", mark("merchant", inputs.merchant)),
      field("가맹점 (한글)", inputs.merchantKo),
      h("label", { class: "field span-2" }, h("span", { class: "field-label field-label-memo" }, "적요", memoTip), inputs.memo, memoHint),
    ),
    reportFields ? h("details", { class: "entry-report-fields" },
      h("summary", { class: "section-label" }, "정산내역서 항목"),
      h("div", { class: "form-grid" },
        field("지급대상", reportFields.payee), field("사용기간", reportFields.service_period),
        field("관련근거", reportFields.basis), reportFields.site ? field("통신비 사용처", reportFields.site) : null,
        paymentConfirmed ? h("label", { class: "inline-check" }, paymentConfirmed, "결제 확정을 원본과 대조했습니다") : null,
        payrollInputs.map(({ label, input }) => field(`${label} 실지급액`, input)),
        payrollInputs.length ? h("p", { class: "field-hint span-2" }, "항목별 실지급액을 확인한 경우에만 입력하세요. 합계는 증빙 금액과 같아야 합니다.") : null)) : null,
    h("div", { class: "section-label" }, "AI 인식 정보"),
    h(
      "dl",
      { class: "kv kv-compact" },
      h("dt", {}, "증빙 유형"), h("dd", {}, DOC_TYPE[e.docType] || e.docType || "—"),
      h("dt", {}, "주문번호"), h("dd", { class: "mono" }, e.orderNumber || "—"),
      e.discountAmount ? [h("dt", {}, "할인"), h("dd", {}, `− ${money(e.discountAmount, cur)}`)] : null,
      h("dt", {}, "인쇄 합계"), h("dd", {}, money(e.printedTotal, cur)),
      h("dt", {}, "수기 합계"), h("dd", {}, e.handwrittenTotal != null ? money(e.handwrittenTotal, cur) : "—"),
      h("dt", {}, "팁"), h("dd", {}, e.tipAmount != null ? money(e.tipAmount, cur) : "—"),
      e.itemsSummaryKo ? [h("dt", {}, "품목 요약"), h("dd", {}, e.itemsSummaryKo)] : null,
      h("dt", {}, "등록"), h("dd", {}, `${dateTime(e.createdAt)} · ${e.via === "intake" ? "관리웹 업로드" : "촬영앱"}`),
      e.updatedAt ? [h("dt", {}, "최종 수정"), h("dd", {}, dateTime(e.updatedAt))] : null,
    ),
    approvalTimeline(e),
    items.length
      ? [
          h("div", { class: "section-label" }, `품목 ${items.length}개`),
          h(
            "table",
            { class: "table table-compact" },
            h("thead", {}, h("tr", {}, h("th", {}, "품목"), h("th", { class: "num" }, "수량"), h("th", { class: "num" }, "금액"))),
            h(
              "tbody",
              {},
              items.map((it) =>
                h("tr", {}, h("td", {}, h("div", { class: "cell-main" }, it.name_ko || it.name), it.name_ko && it.name_ko !== it.name ? h("div", { class: "cell-sub" }, it.name) : null), h("td", { class: "num" }, it.qty ?? "—"), h("td", { class: "num" }, money(it.total_price, cur))),
              ),
            ),
          ),
        ]
      : null,
  );

  function diff() {
    const out = {};
    for (const [k, el] of Object.entries(inputs)) {
      if (el.value === original[k]) continue;
      if (k === "quarter" && !quarterTouched) continue; // 사용일 따라 바뀐 기간은 서버가 다시 정한다
      if (k === "quarter") {
        out[isMonth ? "month" : "quarter"] = el.value;
        continue;
      }
      if (k === "amount") {
        if (el.value === "") continue;
        out.amount = Math.round(Number(el.value) * 100) / 100;
      } else if (el.value.trim() !== "" || k === "memo") out[k] = el.value.trim();
    }
    if (reportFields && !isCoreAccount(inputs.account.value)) {
      const meta = Object.fromEntries(Object.entries(reportFields)
        .filter(([key, input]) => input && input.value.trim() !== (reportMeta[key] || ""))
        .map(([key, input]) => [key, input.value.trim() || null]));
      if (inputs.account.value === payrollAccount && payrollInputs.some(({ kind, input }) => input.value !== String(confirmedPay.get(kind) ?? ""))) {
        meta.payroll_components = payrollInputs.filter(({ input }) => input.value !== "")
          .map(({ kind, input }) => ({ kind, net_amount: Number(input.value) }));
      }
      if (Object.keys(meta).length) out.settlementEvidence = meta;
      if (paymentConfirmed?.checked) out.paymentPending = false;
    }
    return out;
  }
  return { node, editable, diff, inputs, dirty: () => editable && Object.keys(diff()).length > 0 };
}

// ── 결재 ─────────────────────────────────────────────────
function approvalTimeline(e) {
  const list = e.approvals || [];
  if (!list.length) return null;
  return [
    h("div", { class: "section-label" }, "결재 이력"),
    h(
      "ol",
      { class: "timeline" },
      list.map((a) =>
        h(
          "li",
          { class: `tl-${a.action}` },
          h("span", { class: "tl-dot", "aria-hidden": "true" }),
          h(
            "div",
            {},
            h("div", { class: "tl-head" }, h("b", {}, displayTeamName(a.step)), " · ", ACTION_LABEL[a.action] || a.action,
              a.eligibility && a.action === "approve" ? [" · ", ELIGIBILITY[a.eligibility]?.[0] || a.eligibility] : null),
            h("div", { class: "tl-meta" }, `${displayTeamName(a.roleLabel || ROLE[a.role] || a.role)} ${a.email || ""} · ${dateTime(a.at)}`),
            a.comment ? h("div", { class: "tl-comment" }, a.comment) : null,
          ),
        ),
      ),
    ),
  ];
}

function reviewFooter(e, form, { close, onChanged }) {
  const buttons = [];
  const reasons = new Map();
  let pending = false;
  const send = async (action, confirmText, outcome, { eligibility, reason } = {}) => {
    if (pending) return;
    const message = h("div", {},
      h("p", {}, h("b", {}, e.merchantKo || e.merchant || "증빙"), ` · ${money(e.amount, e.currency)}`),
      h("p", {}, outcome));
    const dialog = { title: confirmText, message, confirm: confirmText, danger: action !== "approve" };
    pending = true;
    try {
      let comment;
      if (reason) {
        comment = await promptDialog({ ...dialog, label: reason, value: reasons.get(reason) });
        if (comment === null) return;
        reasons.set(reason, comment);
      } else if (!(await confirmDialog(dialog))) return;
      buttons.forEach((b) => (b.disabled = true));
      const changes = form.editable ? form.diff() : {};
      if (Object.keys(changes).length) await api.patch(`/entries/${e.id}`, changes);
      const r = await api.post(`/entries/${e.id}/review`, { action, eligibility, comment, expectedStatus: e.status });
      toast(`${eligibility ? confirmText : ACTION_LABEL[action]} — ${STATUS[r.status]?.label || r.status}`, action === "approve" ? "ok" : "warn");
      onChanged();
      close(true);
    } catch (ex) {
      toast(errorText(ex), "bad", 6000);
    } finally {
      pending = false;
      buttons.forEach((b) => (b.disabled = false));
    }
  };
  const btn = (cls, ic, label, fn, disabled = false) => {
    const b = h("button", { class: `btn ${cls}`, type: "button", onclick: fn, disabled,
      title: disabled ? "한도 초과 금액이 있어 적격으로 분류할 수 없습니다" : null }, icon(ic), h("span", {}, label));
    if (!disabled) buttons.push(b);
    return b;
  };
  const returnBtn = btn("btn-danger", "x", "반려", () =>
    send("return", "지국으로 반려", "작성한 사유와 함께 지국 담당자에게 돌려보냅니다.", { reason: "반려 사유" }));
  const right = [];
  if (e.status === "submitted") {
    right.push(
      btn("btn-ghost", "alert", "비적격 분류", () =>
        send("approve", "비적격 분류", "보도국장 전결로 보냅니다.", { eligibility: "ineligible", reason: "비적격 사유" })),
      btn("btn-primary", "check", "적격 분류", () =>
        send("approve", "적격 분류", "재무팀 최종 검토로 보냅니다.", { eligibility: "eligible" }), e.ineligibleAmount > 0),
    );
  } else if (e.status === "chief_review") {
    right.push(btn("btn-ghost", "x", "불승인", () =>
      send("reject", "불승인", "이 증빙을 지급 대상에서 제외합니다.", { reason: "불승인 사유" })));
    right.push(btn("btn-primary", "check", "승인", () => send("approve", "비적격 증빙 승인", "재무팀 최종 검토로 보냅니다.")));
  } else {
    right.push(btn("btn-primary", "check", "최종 결재", () => send("approve", "증빙 최종 결재", "이 증빙의 결재를 완료합니다.")));
  }
  return [returnBtn, h("div", { class: "foot-right" }, right)];
}

function banner(tone, ic, title, text) {
  return h("div", { class: `banner banner-${tone}` }, icon(ic), h("div", {}, h("b", {}, title), h("div", {}, text)));
}

function withdrawFooter(e, { close, onChanged }) {
  const btn = h("button", { class: "btn btn-ghost", type: "button" }, icon("refresh"), h("span", {}, "제출 취소"));
  btn.addEventListener("click", async () => {
    const ok = await confirmDialog({
      title: "제출 취소",
      message: h("div", {}, h("p", {}, "제출을 취소하면 '지국 작성중'으로 돌아가 다시 수정할 수 있습니다. 고친 뒤 다시 제출하세요."), h("p", { class: "muted small" }, "보도BIZ팀이 이미 분류했다면 취소되지 않습니다.")),
      confirm: "제출 취소",
    });
    if (!ok) return;
    btn.disabled = true;
    try {
      await api.post(`/entries/${e.id}/withdraw`);
      toast("제출을 취소했습니다 — 지국 작성중으로 돌아갔습니다", "ok");
      onChanged();
      close(true);
    } catch (ex) {
      toast(errorText(ex), "bad");
      btn.disabled = false;
    }
  });
  return [h("span", { class: "muted small" }, "보도BIZ팀 결재 대기 중 — 취소하면 다시 수정할 수 있습니다"), h("div", { class: "foot-right" }, h("button", { class: "btn btn-ghost", type: "button", onclick: () => close() }, "닫기"), btn)];
}

const CANCEL_LABEL = { submitted: "보도BIZ팀 분류", chief_review: "보도국장 전결", finance_review: "재무팀 최종 결재" };
function cancelReviewFooter(e, { close, onChanged }) {
  const from = e.approvals[e.approvals.length - 1].from;
  const btn = h("button", { class: "btn btn-ghost btn-cancel-review", type: "button" }, icon("refresh"), h("span", {}, "내 결재 취소"));
  btn.addEventListener("click", async () => {
    const comment = await promptDialog({
      title: "결재 취소",
      message: h("div", {}, h("p", {}, `${CANCEL_LABEL[from]} 결재를 취소하고 '${STATUS[from]?.label || from}' 상태로 되돌립니다.`),
        h("p", { class: "muted small" }, "다음 단계 담당자가 이미 처리했다면 취소되지 않습니다. 취소 내역은 결재 이력에 남습니다.")),
      placeholder: "취소 사유 (선택)",
      confirm: "결재 취소",
      required: false,
    });
    if (comment === null) return;
    btn.disabled = true;
    try {
      const r = await api.post(`/entries/${e.id}/cancel-review`, { comment: comment || undefined });
      toast(`결재를 취소했습니다 — ${STATUS[r.status]?.label || r.status}`, "ok");
      onChanged();
      close(true);
    } catch (ex) {
      toast(errorText(ex), "bad", 6000);
      btn.disabled = false;
    }
  });
  return [h("span", { class: "muted small" }, "내 팀이 마지막으로 결재했습니다 — 다음 단계가 처리하기 전에는 취소할 수 있습니다"), h("div", { class: "foot-right" }, h("button", { class: "btn btn-ghost", type: "button", onclick: () => close() }, "닫기"), btn)];
}

function footer(e, form, { me, close, onChanged, reopen }) {
  if (!form.editable) {
    if (e.canCancel) return cancelReviewFooter(e, { close, onChanged });
    // 보도BIZ팀이 아직 분류하지 않은 증빙은 지국 담당자가 제출을 취소하고 다시 고칠 수 있다
    if ((e.status === "submitted" || e.status === "filed") && me.role === "staff") return withdrawFooter(e, { close, onChanged });
    const canSplit = ["imc", "finance", "admin"].includes(me.role) && EDITABLE_STATUS.has(e.status) && !e.splitFrom && e.amount > 0.01;
    return [canSplit ? h("button", { class: "btn btn-ghost", type: "button",
      onclick: () => splitEvidence(e, close, onChanged) }, "다른 계정으로 분할") : h("span", { class: "muted small" }, "읽기 전용"),
      h("button", { class: "btn btn-ghost", type: "button", onclick: () => close() }, "닫기")];
  }

  const saveBtn = h("button", { class: "btn btn-ghost", type: "button" }, icon("check"), h("span", {}, "저장"));
  const core = () => isCoreAccount(form.inputs.account.value);
  const submitLabel = h("span", {}, core() ? "보도BIZ팀에 제출" : "제출(보관)");
  const submitBtn = h("button", { class: "btn btn-primary", type: "button", title: "기타 계정은 결재 없이 보관됩니다" }, icon("send"), submitLabel);
  form.inputs.account.addEventListener("change", () => (submitLabel.textContent = core() ? "보도BIZ팀에 제출" : "제출(보관)"));
  const delBtn = h("button", { class: "btn btn-danger-ghost", type: "button" }, icon("trash"), h("span", {}, "삭제"));
  const lock = (v) => [saveBtn, submitBtn, delBtn].forEach((b) => (b.disabled = v));

  async function save() {
    const patch = form.diff();
    if (patch.amount !== undefined && !(patch.amount >= 0)) throw new Error("금액을 확인하세요");
    if (!Object.keys(patch).length) return false;
    if ((patch.month || patch.quarter) && form.inputs.txnDate.value) {
      const date = form.inputs.txnDate.value;
      if ((patch.month && patch.month !== date.slice(0, 7)) || (patch.quarter && patch.quarter !== quarterOf(date))) {
        const ok = await confirmDialog({ title: "정산 기간 변경",
          message: `사용일이 ${date}인 증빙을 ${periodCaption(patch.month || patch.quarter)}에 넣습니다.`, confirm: "변경" });
        if (!ok) throw new Error("정산 기간 변경을 취소했습니다.");
      }
    }
    await api.patch(`/entries/${e.id}`, patch);
    Object.assign(e, patch);
    return true;
  }

  saveBtn.addEventListener("click", async () => {
    lock(true);
    try {
      const changed = await save();
      toast(changed ? "저장했습니다" : "바뀐 내용이 없습니다", changed ? "ok" : "info");
      if (changed) {
        onChanged();
        await close(true);
        reopen(); // 저장하면 상태·검증 결과가 다시 계산되므로 새로 읽는다
      }
    } catch (ex) {
      toast(errorText(ex), "bad");
    } finally {
      lock(false);
    }
  });

  submitBtn.addEventListener("click", async () => {
    if (form.inputs.account.value === "취재비" && !form.inputs.memo.value.trim()) {
      toast("취재비는 적요를 입력해야 제출할 수 있습니다", "warn");
      form.inputs.memo.focus();
      return;
    }
    const ok = await confirmDialog({
      title: core() ? "보도BIZ팀에 제출" : "제출(보관)",
      message: h("div", {},
        submitCheck([{ amount: money(form.inputs.amount.value === "" ? null : Number(form.inputs.amount.value), e.currency), merchant: form.inputs.merchantKo.value || form.inputs.merchant.value, date: form.inputs.txnDate.value, account: form.inputs.account.value }]),
        e.status === "flagged" ? h("p", { class: "text-warn" }, "검토 필요 항목이 남아 있습니다.") : null),
      confirm: core() ? "보도BIZ팀에 제출" : "제출",
    });
    if (!ok) return;
    // AI 가 이미 정책 위반으로 판정했고 판정에 쓰인 내용을 고치지 않았다면, 소명 없이는 자동 반려된다 → 미리 소명을 받는다
    const GATE_INPUTS = ["account", "merchant", "merchantKo", "memo", "amount", "txnDate"];
    const touched = Object.keys(form.diff()).some((k) => GATE_INPUTS.includes(k));
    let justification = null;
    if (core() && e.aiGate?.verdict === "fail" && !e.aiGate.stale && !touched) { // 반려 후 다시 낼 때도 새 소명이 필요하다
      justification = await promptDialog({
        title: "AI 1차 검증 — 소명 후 제출",
        message: h("div", {}, h("p", {}, "AI 가 이 증빙을 정책 위반으로 판단했습니다. 소명 없이 제출하면 자동 반려됩니다."),
          h("ul", { class: "ai-viol" }, (e.aiGate.violations || []).map((x) => h("li", {}, h("span", { class: "ai-viol-rule" }, x.rule), h("span", { class: "ai-viol-why" }, x.reason)))),
          h("p", { class: "small" }, "업무상 필요한 지출이라면 사유를 적어 주세요. 소명과 함께 보도BIZ팀으로 넘어가 사람이 판단합니다.")),
        placeholder: "예) 지국 사무실 청소용품 — 업무용 비품으로 구매",
        confirm: "소명하고 제출",
      });
      if (justification === null) return;
    }
    lock(true);
    try {
      await save();
      const r = await api.post(`/entries/${e.id}/submit`, justification ? { justification } : {});
      if (r.status === "returned") {
        toast(r.message || "AI 1차 검증에서 정책 위반으로 자동 반려되었습니다.", "warn", 8000);
        onChanged();
        await close(true);
        reopen(); // 반려 사유와 AI 판정을 바로 보여 준다
        return;
      }
      toast(r.status === "filed" ? "보관으로 제출했습니다" : justification ? "소명과 함께 보도BIZ팀에 제출했습니다" : "보도BIZ팀에 제출했습니다", "ok");
      onChanged();
      close(true);
    } catch (ex) {
      toast(errorText(ex), "bad");
      lock(false);
    }
  });

  delBtn.addEventListener("click", async () => {
    const ok = await confirmDialog({ title: "증빙 삭제", message: "이 증빙을 삭제할까요? 한도 계산에서도 빠집니다.", confirm: "삭제", danger: true });
    if (!ok) return;
    lock(true);
    try {
      await api.del(`/entries/${e.id}`);
      toast("삭제했습니다", "ok");
      onChanged();
      close(true);
    } catch (ex) {
      toast(errorText(ex), "bad");
      lock(false);
    }
  });

  return [delBtn, h("div", { class: "foot-right" }, saveBtn, submitBtn)];
}

async function splitEvidence(entry, close, onChanged) {
  const account = accountSelect("", {}, { blank: "계정 선택", branch: entry.branchId });
  account.querySelectorAll("option").forEach((option) => { if (option.value === entry.account) option.disabled = true; });
  const amount = h("input", { class: "input num", type: "number", min: "0.01", max: (entry.amount - 0.01).toFixed(2), step: "0.01", required: true });
  const memo = h("textarea", { class: "input", rows: "2" });
  if (!(await confirmDialog({
    title: "다른 계정으로 증빙 분할",
    message: h("div", { class: "stack" },
      h("p", {}, `원본 ${money(entry.amount, entry.currency)} 중 입력한 금액을 새 증빙으로 옮깁니다. 원본 파일은 함께 사용합니다.`),
      field("새 계정", account), field("옮길 금액", amount), field("적요", memo)),
    confirm: "증빙 분할",
  }))) return;
  if (!account.value || !amount.checkValidity() || (account.value === "취재비" && !memo.value.trim())) {
    toast("새 계정, 분할 금액, 취재비 적요를 확인해 주세요", "warn");
    return;
  }
  try {
    await api.post(`/entries/${entry.id}/split`, { requestId: crypto.randomUUID().replaceAll("-", ""), account: account.value,
      amount: Number(amount.value), memo: memo.value.trim() });
    toast("원본 금액을 나누고 새 증빙을 만들었습니다", "ok");
    close(true);
    onChanged();
  } catch (err) { toast(errorText(err), "bad"); }
}
