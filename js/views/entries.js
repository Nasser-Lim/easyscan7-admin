// 증빙 조회 — 필터·정렬 목록, 일괄 제출, 상세 서랍(원본 증빙 대조 + 수정·제출·삭제 / 결재).
// 지국 담당자: 자기 지국 · 본사 결재자: 전 지국(지국 필터), 결재는 결재함 또는 이 화면의 상세 서랍에서.
import { api } from "../api.js";
import {
  ACCOUNTS, ACTION_LABEL, BRANCH, DOC_TYPE, ELIGIBILITY, FINAL, IN_REVIEW, ROLE, STAFF_EDITABLE, STATUS, chip, clear,
  confirmDialog, promptDialog, dateText, dateTime, empty, errorText, field, h, icon, money, noticeParts,
  QUARTER_SOURCE, quarterBadge, quarterLabel, quarterOf, quarterOptions, select, spinner, statusChip, toast,
} from "../ui.js";
import { aiGateMark, aiGatePanel } from "../aigate.js";
import { fxStrip, loadFx, sumIn } from "../fx.js";
import { refreshInboxBadge } from "./inbox.js";
import { pageHeader } from "./shell.js";

const EDITABLE_STATUS = STAFF_EDITABLE; // 지국 담당자가 고치고 제출할 수 있는 상태
// 화면을 옮겨 다녀도 필터는 유지(세션 동안)
// 분기는 영수증 날짜로 자동 지정되므로 방금 올린 증빙이 이번 분기가 아닐 수 있다 — 기본은 전체 분기("")
// 분기 선택지: 오늘이 속한 분기부터 과거로 4개. (이미 그 밖의 분기에 있는 증빙은 '전체'로 조회하고, 상세에서는 자기 분기가 함께 보인다)
const QUARTER_CHOICES = 4;
const state = { quarter: "", account: "", status: "", q: "", sort: "txnDate", dir: -1, branch: "all" };

export function renderEntries(el, { me, params }) {
  const isStaff = me.role === "staff";
  const branch = isStaff ? `${BRANCH[me.branchId] || me.branchId}지국` : "본사";
  let rows = [];
  const selected = new Set();

  const quarter = select([["", "전체"], ...quarterOptions(QUARTER_CHOICES).map((q) => [q, quarterLabel(q)])], state.quarter, { class: "input input-sm" });
  const account = select([["", "전체 계정"], ...ACCOUNTS.map((a) => [a, a])], state.account, { class: "input input-sm" });
  const status = select([["", "전체 상태"], ...Object.keys(STATUS).filter((s) => s !== "deleted").map((s) => [s, STATUS[s].label])], state.status, { class: "input input-sm" });
  const branchSel = isStaff ? null : select([["all", "전체 지국"], ...Object.entries(BRANCH).map(([id, n]) => [id, `${n}지국`])], state.branch, { class: "input input-sm" });
  branchSel?.addEventListener("change", () => ((state.branch = branchSel.value), load()));
  const search = h("input", { class: "input input-sm", type: "search", placeholder: "가맹점·주문번호·적요 검색", value: state.q });
  const kpiBar = h("div", { class: "kpis kpis-sm" });
  const fxBar = fxStrip();
  let fx = null;
  const bulk = h("div", { class: "bulkbar" });
  const tableWrap = h("div", { class: "table-wrap" }, h("div", { class: "card-loading" }, spinner()));
  const refreshBtn = h("button", { class: "btn btn-ghost", type: "button", onclick: () => load() }, icon("refresh"), h("span", {}, "새로고침"));

  quarter.addEventListener("change", () => ((state.quarter = quarter.value), load()));
  account.addEventListener("change", () => ((state.account = account.value), paint()));
  status.addEventListener("change", () => ((state.status = status.value), paint()));
  search.addEventListener("input", () => ((state.q = search.value), paint()));

  el.append(
    pageHeader({
      crumbs: [branch, "업무"],
      title: isStaff ? "증빙 조회" : "전체 증빙",
      desc: isStaff ? "AI 가 읽은 증빙 정보를 원본과 대조해 수정하고 제출합니다." : "전 지국 증빙과 결재 진행 상황입니다. 결재할 증빙은 결재함에 모입니다.",
      actions: isStaff ? [refreshBtn, h("a", { class: "btn btn-primary", href: "#/upload" }, icon("upload"), h("span", {}, "증빙 업로드"))] : [refreshBtn],
    }),
    fxBar.node,
    kpiBar,
    h(
      "section",
      { class: "card card-flush" },
      h("div", { class: "toolbar" }, h("div", { class: "toolbar-filters" }, branchSel, quarter, account, status), h("div", { class: "toolbar-search" }, icon("search"), search)),
      bulk,
      tableWrap,
    ),
  );

  async function load() {
    clear(tableWrap).append(h("div", { class: "card-loading" }, spinner()));
    selected.clear();
    try {
      const params = new URLSearchParams();
      if (state.quarter) params.set("quarter", state.quarter);
      if (!isStaff) params.set("branch", state.branch);
      [rows, fx] = await Promise.all([api.get(`/entries${params.size ? `?${params}` : ""}`).then((r) => r.entries), loadFx()]);
      paint();
    } catch (e) {
      clear(tableWrap).append(h("p", { class: "card-error" }, errorText(e)));
    }
  }

  function visible() {
    const q = state.q.trim().toLowerCase();
    const out = rows.filter(
      (e) =>
        (!state.account || e.account === state.account) &&
        (!state.status || e.status === state.status) &&
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
    const writing = by(new Set(["draft", "flagged"]));
    const returned = by(new Set(["returned"]));
    clear(kpiBar).append(
      mini("전체", rows.length, money(sum(rows), cur)),
      mini("작성중", writing.length, money(sum(writing), cur), writing.length ? "warn" : null),
      mini("반려됨", returned.length, money(sum(returned), cur), returned.length ? "bad" : null),
      mini("결재 진행", by(IN_REVIEW).length, money(sum(by(IN_REVIEW)), cur), "info"),
      mini("결재 완료", by(new Set(["approved"])).length, money(sum(by(new Set(["approved"]))), cur), "ok"),
      mini("비적격", money(sum(rows, "ineligibleAmount"), cur), "한도 초과분", sum(rows, "ineligibleAmount") > 0 ? "bad" : null),
    );

    const list = visible();
    for (const id of [...selected]) if (!list.some((e) => e.id === id && EDITABLE_STATUS.has(e.status))) selected.delete(id);
    paintBulk();
    if (!list.length) {
      clear(tableWrap).append(rows.length ? empty("조건에 맞는 증빙이 없습니다", "필터를 바꿔 보세요.") : empty(`${state.quarter ? quarterLabel(state.quarter) : "등록된"} 증빙이 없습니다`, "증빙을 업로드하면 AI 가 읽어 여기에 등록합니다."));
      return;
    }
    const selectable = isStaff ? list.filter((e) => EDITABLE_STATUS.has(e.status)) : [];
    const all = h("input", { type: "checkbox", class: "check", "aria-label": "전체 선택", disabled: !selectable.length });
    all.checked = selectable.length > 0 && selectable.every((e) => selected.has(e.id));
    all.addEventListener("change", () => {
      selectable.forEach((e) => (all.checked ? selected.add(e.id) : selected.delete(e.id)));
      paint();
    });
    const th = (label, key, cls) =>
      h(
        "th",
        { class: `${cls || ""} sortable${state.sort === key ? " sorted" : ""}`, onclick: () => ((state.dir = state.sort === key ? -state.dir : -1), (state.sort = key), paint()) },
        label,
        state.sort === key ? h("span", { class: "sort-ind" }, state.dir > 0 ? "▲" : "▼") : null,
      );
    clear(tableWrap).append(
      h(
        "table",
        { class: "table table-entries" },
        h(
          "thead",
          {},
          h(
            "tr",
            {},
            isStaff ? h("th", { class: "cell-check" }, all) : th("지국", "branchId"),
            th("사용일", "txnDate"),
            th("가맹점", "merchant"),
            th("계정", "account"),
            th("증빙", "docType"),
            th("금액", "amount", "num"),
            th("비적격", "ineligibleAmount", "num"),
            th("상태", "status"),
            th("등록", "createdAt"),
            isStaff ? h("th", { class: "cell-del" }) : null,
          ),
        ),
        h(
          "tbody",
          {},
          list.map((e) => {
            const cb = h("input", { type: "checkbox", class: "check", "aria-label": "선택", disabled: !isStaff || !EDITABLE_STATUS.has(e.status) });
            cb.checked = selected.has(e.id);
            cb.addEventListener("click", (ev) => ev.stopPropagation());
            cb.addEventListener("change", () => ((cb.checked ? selected.add(e.id) : selected.delete(e.id)), paint()));
            const notes = (e.notices || []).length;
            return h(
              "tr",
              { class: `row-link${selected.has(e.id) ? " selected" : ""}`, onclick: () => openDrawer(e.id, me, onChanged) },
              isStaff ? h("td", { class: "cell-check" }, cb) : h("td", {}, BRANCH[e.branchId] || e.branchId),
              h("td", { class: "mono" }, dateText(e.txnDate), h("div", { class: "q-line" }, quarterBadge(e.quarter))),
              h(
                "td",
                {},
                h("div", { class: "cell-main" }, e.merchantKo || e.merchant || "—", notes ? h("span", { class: "dot-note", title: `알림 ${notes}건` }) : null),
                h("div", { class: "cell-sub" }, [e.merchantKo ? e.merchant : null, e.orderNumber ? `#${e.orderNumber}` : null].filter(Boolean).join(" · ")),
              ),
              h("td", {}, e.account || "—"),
              h("td", { class: "cell-sub" }, DOC_TYPE[e.docType] || e.docType || "—"),
              h("td", { class: "num strong" }, money(e.amount, e.currency)),
              h("td", { class: `num ${e.ineligibleAmount > 0 ? "text-bad" : "muted"}` }, e.ineligibleAmount > 0 ? money(e.ineligibleAmount, e.currency) : "—"),
              h("td", {}, statusChip(e.status), e.eligibility ? h("div", { class: "cell-sub" }, ELIGIBILITY[e.eligibility][0]) : null, aiGateMark(e.aiGate)),
              h("td", { class: "cell-sub mono" }, dateTime(e.createdAt)),
              isStaff ? h("td", { class: "cell-del" }, EDITABLE_STATUS.has(e.status) ? rowDelete(e) : null) : null,
            );
          }),
        ),
      ),
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

  function paintBulk() {
    clear(bulk);
    bulk.classList.toggle("show", selected.size > 0);
    if (!selected.size) return;
    const picked = rows.filter((e) => selected.has(e.id));
    const cur = displayCurrency();
    bulk.append(
      h("span", {}, h("b", {}, `${selected.size}건`), ` 선택 · ${money(sumIn(picked, "amount", fx, cur).total, cur)}`),
      h("div", { class: "bulk-actions" }, h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => (selected.clear(), paint()) }, "선택 해제"), h("button", { class: "btn btn-ghost btn-sm btn-bulk-danger", type: "button", onclick: () => bulkDelete(picked) }, icon("trash"), h("span", {}, "선택 삭제")), h("button", { class: "btn btn-primary btn-sm", type: "button", onclick: () => bulkSubmit(picked) }, icon("send"), h("span", {}, "선택 제출"))),
    );
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
      message: h("div", {}, h("p", {}, "제출한 증빙은 보도IMC팀 분류부터 결재선으로 넘어가며, 반려되기 전에는 수정할 수 없습니다."), flagged ? h("p", { class: "text-warn" }, `검토 필요 증빙 ${flagged}건이 포함되어 있습니다. 원본과 대조했는지 확인하세요.`) : null),
      confirm: "제출",
    });
    if (!ok) return;
    let done = 0;
    let aiReturned = 0;
    const failed = [];
    for (const e of picked) {
      try {
        const r = await api.post(`/entries/${e.id}/submit`, {});
        if (r.status === "returned") aiReturned++;
        else done++;
      } catch (ex) {
        failed.push(`${e.merchant || e.id}: ${errorText(ex)}`);
      }
    }
    const parts = [`${done}건 제출`];
    if (aiReturned) parts.push(`${aiReturned}건은 AI 1차 검증에서 정책 위반으로 자동 반려(증빙을 열어 사유 확인 · 소명 후 재제출 가능)`);
    if (failed.length) parts.push(`${failed.length}건 실패 — ${failed[0]}`);
    toast(parts.join(" · "), failed.length ? "bad" : aiReturned ? "warn" : "ok", aiReturned || failed.length ? 7000 : undefined);
    load();
  }

  function onChanged() {
    load();
  }

  load();
  if (params[0]) {
    history.replaceState(null, "", "#/entries");
    openDrawer(params[0], me, onChanged);
  }
}

function mini(label, value, sub, tone) {
  return h("div", { class: `kpi kpi-mini${tone ? " kpi-" + tone : ""}` }, h("div", { class: "kpi-label" }, label), h("div", { class: "kpi-value" }, String(value)), h("div", { class: "kpi-sub" }, sub));
}

// ── 상세 서랍 ─────────────────────────────────────────────
let openBack = null;

export function openDrawer(id, me, onChanged) {
  if (openBack) openBack.close();
  const urls = [];
  const body = h("div", { class: "drawer-body" }, h("div", { class: "card-loading" }, spinner()));
  const titleEl = h("div", { class: "drawer-title" }, "증빙 상세");
  const subEl = h("div", { class: "drawer-sub" });
  const foot = h("div", { class: "drawer-foot" });
  let dirty = () => false;

  const close = async (force = false) => {
    if (!force && dirty() && !(await confirmDialog({ title: "저장하지 않은 수정", message: "수정한 내용을 버리고 닫을까요?", confirm: "버리고 닫기", danger: true }))) return;
    urls.forEach((u) => URL.revokeObjectURL(u));
    document.removeEventListener("keydown", onKey);
    back.remove();
    document.body.classList.remove("no-scroll");
    openBack = null;
  };
  const onKey = (e) => e.key === "Escape" && !document.querySelector(".modal-back") && close();
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

  api
    .get(`/entries/${id}`)
    .then((e) => {
      clear(titleEl).append(e.merchantKo || e.merchant || "증빙 상세", " ", statusChip(e.status));
      subEl.textContent = [e.account, quarterLabel(e.quarter), e.orderNumber ? `주문 #${e.orderNumber}` : null, `ID ${e.id}`].filter(Boolean).join(" · ");
      const form = detailForm(e, me);
      const review = e.stage?.canAct ? reviewPanel(e, me) : null;
      if (review) form.node.prepend(review.node);
      dirty = form.dirty;
      clear(body).append(h("div", { class: "detail" }, evidenceViewer(e, urls), h("div", { class: "detail-side" }, form.node)));
      const ctx = { me, close, onChanged: () => (onChanged(), refreshInboxBadge(me)), reopen: () => openDrawer(id, me, onChanged) };
      clear(foot).append(...(review ? reviewFooter(e, me, form, review, ctx) : footer(e, form, ctx)));
    })
    .catch((ex) => clear(body).append(h("p", { class: "card-error" }, errorText(ex))));
}

function evidenceViewer(e, urls) {
  const ids = e.uploadIds || [];
  const stage = h("div", { class: "viewer-stage" });
  const tabs = h("div", { class: "viewer-tabs", role: "tablist" });
  const nameOf = (uid, i) => (e.sources || []).find((s) => s.uploadId === uid)?.fileName || `증빙 ${i + 1}`;
  const pagesOf = (uid) => [...new Set((e.sources || []).filter((s) => s.uploadId === uid).map((s) => s.page))].sort((a, b) => a - b);
  const cache = {};

  async function show(uid, i) {
    [...tabs.children].forEach((t, j) => t.classList.toggle("active", j === i));
    clear(stage).append(h("div", { class: "card-loading" }, spinner()));
    try {
      if (!cache[uid]) {
        const blob = await api.blob(`/uploads/${uid}/file`);
        const url = URL.createObjectURL(blob);
        urls.push(url);
        cache[uid] = { url, type: blob.type };
      }
      const { url, type } = cache[uid];
      const pages = pagesOf(uid);
      clear(stage);
      if (type === "application/pdf") {
        stage.append(h("iframe", { class: "viewer-pdf", src: pages.length ? `${url}#page=${pages[0]}` : url, title: nameOf(uid, i) }));
      } else if (type === "image/heic") {
        stage.append(h("div", { class: "viewer-empty" }, icon("image", "ic empty-ic"), h("div", {}, "HEIC 이미지는 브라우저에서 미리 볼 수 없습니다."), h("a", { class: "btn btn-ghost btn-sm", href: url, download: nameOf(uid, i) }, "내려받기")));
      } else {
        const img = h("img", { class: "viewer-img", src: url, alt: nameOf(uid, i) });
        img.addEventListener("click", () => img.classList.toggle("zoom"));
        stage.append(img);
      }
    } catch (ex) {
      clear(stage).append(h("div", { class: "viewer-empty" }, icon("alert", "ic empty-ic"), h("div", {}, `원본을 불러오지 못했습니다 — ${errorText(ex)}`)));
    }
  }

  ids.forEach((uid, i) => {
    const pages = pagesOf(uid);
    tabs.append(
      h(
        "button",
        { class: "viewer-tab", type: "button", role: "tab", onclick: () => show(uid, i), title: nameOf(uid, i) },
        icon(/\.pdf$/i.test(nameOf(uid, i)) ? "pdf" : "image"),
        h("span", { class: "viewer-tab-name" }, nameOf(uid, i)),
        pages.length ? h("span", { class: "viewer-tab-page" }, `${pages.join(",")}쪽`) : null,
      ),
    );
  });
  if (ids.length) show(ids[0], 0);
  else stage.append(h("div", { class: "viewer-empty" }, icon("file", "ic empty-ic"), h("div", {}, "연결된 원본 증빙이 없습니다.")));

  return h("section", { class: "viewer" }, h("div", { class: "viewer-head" }, h("span", { class: "section-label" }, "원본 증빙"), ids.length > 1 ? h("span", { class: "muted small" }, `${ids.length}개 파일`) : null), tabs, stage);
}

function canEdit(e, me) {
  if (me.role === "staff") return EDITABLE_STATUS.has(e.status);
  if (me.role === "finance" || me.role === "admin") return e.status === "finance_review"; // 최종 검토 중 정정
  return false; // 보도IMC팀·보도국장은 고치지 않고 반려한다
}

function detailForm(e, me) {
  const editable = canEdit(e, me);
  const cur = e.currency || "USD";
  const conf = e.fieldConfidence || {};
  // 서버 규칙(lowconf-amount·lowconf-date)과 같은 기준
  const CONF = { amount: ["printed_total", 0.9], txnDate: ["transacted_on", 0.85] };
  const confOf = (k) => conf[CONF[k]?.[0]];
  const lowConf = (k) => CONF[k] && typeof confOf(k) === "number" && confOf(k) < CONF[k][1];

  const inputs = {
    account: select(ACCOUNTS.map((a) => [a, a]), e.account, { disabled: !editable }),
    txnDate: h("input", { class: "input", type: "date", value: e.txnDate || "", disabled: !editable }),
    amount: h("input", { class: "input num", type: "number", step: "0.01", min: "0", value: e.amount != null ? Number(e.amount).toFixed(2) : "", disabled: !editable }),
    merchant: h("input", { class: "input", type: "text", value: e.merchant || "", disabled: !editable }),
    merchantKo: h("input", { class: "input", type: "text", value: e.merchantKo || "", disabled: !editable }),
    memo: h("textarea", { class: "input", rows: "2", disabled: !editable, placeholder: "취재 건명·동석자 등" }, e.memo || ""),
    quarter: select(
      [...new Set([...quarterOptions(QUARTER_CHOICES), e.quarter].filter(Boolean))].sort().reverse().map((q) => [q, quarterLabel(q)]),
      e.quarter,
      { disabled: !editable },
    ),
  };
  // 분기를 직접 고르지 않았으면 사용일을 따라간다(서버도 같은 규칙). 고르면 고정
  let quarterTouched = false;
  const quarterHint = h("span", { class: "field-hint" }, QUARTER_SOURCE[e.quarterSource] || "");
  const syncQuarterHint = () => {
    const off = inputs.txnDate.value && quarterOf(inputs.txnDate.value) !== inputs.quarter.value;
    quarterHint.textContent = quarterTouched ? "직접 지정" : QUARTER_SOURCE[e.quarterSource === "manual" ? "manual" : "date"];
    if (off) quarterHint.textContent += " · 사용일과 다른 분기";
    quarterHint.classList.toggle("text-warn", !!off);
  };
  inputs.txnDate.addEventListener("input", () => {
    if (!quarterTouched && e.quarterSource !== "manual") inputs.quarter.value = quarterOf(inputs.txnDate.value) || inputs.quarter.value;
    syncQuarterHint();
  });
  inputs.quarter.addEventListener("change", () => ((quarterTouched = true), syncQuarterHint()));
  syncQuarterHint();
  const original = Object.fromEntries(Object.entries(inputs).map(([k, el]) => [k, el.value]));
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
    banners.push(banner("info", "info", STATUS[e.status].label, me.role === "staff" ? (e.status === "submitted" ? "보도IMC팀이 아직 분류하기 전입니다. 아래 [제출 취소]로 되돌려 다시 고칠 수 있습니다." : "결재 진행 중입니다. 반려되면 다시 고칠 수 있습니다.") : "다른 단계의 결재를 기다리는 증빙입니다."));
  if (e.status === "approved") banners.push(banner("ok", "check", "결재 완료", "재무팀 결재까지 끝난 증빙이라 수정할 수 없습니다."));
  if (e.status === "rejected") banners.push(banner("bad", "x", "불승인", "비적격 증빙으로 지급하지 않기로 결재되었습니다(한도에서도 빠짐)."));

  const items = e.lineItems || [];
  const node = h(
    "div",
    { class: "detail-form" },
    aiGatePanel(e.aiGate, me.role === "staff" ? "staff" : "reviewer"),
    banners.length ? h("div", { class: "banners" }, banners) : null,
    h("div", { class: "section-label" }, "증빙 정보"),
    h(
      "div",
      { class: "form-grid" },
      field("계정", inputs.account),
      field("사용일", mark("txnDate", inputs.txnDate)),
      field(`금액 (${cur})`, mark("amount", inputs.amount)),
      h("label", { class: "field" }, h("span", { class: "field-label" }, "정산 분기"), inputs.quarter, quarterHint),
      field("가맹점 (원문)", mark("merchant", inputs.merchant)),
      field("가맹점 (한글)", inputs.merchantKo),
      h("label", { class: "field span-2" }, h("span", { class: "field-label field-label-memo" }, "적요", memoTip), inputs.memo, memoHint),
    ),
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
      if (k === "quarter" && !quarterTouched) continue; // 사용일 따라 바뀐 분기는 서버가 다시 정한다
      if (k === "amount") {
        if (el.value === "") continue;
        out.amount = Math.round(Number(el.value) * 100) / 100;
      } else if (el.value.trim() !== "" || k === "memo") out[k] = el.value.trim();
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
            h("div", { class: "tl-head" }, h("b", {}, a.step || ""), " · ", ACTION_LABEL[a.action] || a.action,
              a.eligibility && a.action === "approve" ? [" · ", ELIGIBILITY[a.eligibility]?.[0] || a.eligibility] : null),
            h("div", { class: "tl-meta" }, `${a.roleLabel || ROLE[a.role] || a.role} ${a.email || ""} · ${dateTime(a.at)}`),
            a.comment ? h("div", { class: "tl-comment" }, a.comment) : null,
          ),
        ),
      ),
    ),
  ];
}

function reviewPanel(e, me) {
  const atImc = e.status === "submitted";
  const overLimit = e.ineligibleAmount > 0;
  const comment = h("textarea", { class: "input", rows: "2", placeholder: "의견 (반려·불승인·비적격일 때 필수)" });
  let eligibility = e.eligibility || (overLimit ? "ineligible" : null);
  const radios = atImc
    ? h(
        "div",
        { class: "seg", role: "radiogroup", "aria-label": "적격 분류" },
        ["eligible", "ineligible"].map((v) => {
          const b = h("button", { type: "button", class: `seg-btn seg-${v}`, role: "radio", disabled: v === "eligible" && overLimit,
            title: v === "eligible" && overLimit ? "한도 초과 금액이 있어 적격으로 분류할 수 없습니다" : "" }, ELIGIBILITY[v][0]);
          b.addEventListener("click", () => {
            eligibility = v;
            radios.querySelectorAll(".seg-btn").forEach((x) => x.classList.toggle("on", x === b));
            panel.dispatchEvent(new Event("eligibility"));
          });
          if (eligibility === v) b.classList.add("on");
          return b;
        }),
      )
    : null;
  const guide = {
    submitted: "적격이면 재무팀 최종 검토로, 비적격이면 보도국장 전결로 올립니다.",
    chief_review: "보도IMC팀이 비적격으로 분류한 증빙입니다. 승인하면 재무팀 최종 검토로, 불승인하면 지급하지 않습니다.",
    finance_review: "결재선을 거친 증빙입니다. 원본과 대조해 최종 검토하고 결재합니다.",
  }[e.status];
  const panel = h(
    "section",
    { class: "review-panel" },
    h("div", { class: "review-panel-head" }, icon("check"), h("b", {}, e.stage.label), h("span", { class: "muted small" }, "내 결재 차례")),
    h("p", { class: "small" }, guide),
    overLimit ? h("p", { class: "small text-bad" }, `분기 한도 초과로 ${money(e.ineligibleAmount, e.currency)} 가 비적격 — 보도국장 전결이 필요합니다.`) : null,
    radios ? h("div", { class: "field" }, h("span", { class: "field-label" }, "적격 분류"), radios) : e.eligibility ? h("p", { class: "small" }, "보도IMC팀 분류: ", chip(ELIGIBILITY[e.eligibility][0], ELIGIBILITY[e.eligibility][1])) : null,
    field("의견", comment),
  );
  return { node: panel, comment, eligibility: () => eligibility, atImc };
}

function reviewFooter(e, me, form, review, { close, onChanged }) {
  const buttons = [];
  const send = async (action, confirmText, danger = false) => {
    const c = review.comment.value.trim();
    const elig = review.eligibility();
    if (review.atImc && action === "approve" && !elig) return toast("적격 / 비적격을 선택하세요", "warn");
    // 의견 필수: 반려·불승인, 그리고 보도IMC팀이 비적격으로 분류할 때(사유). 보도국장·재무팀 승인은 선택
    if ((action !== "approve" || (review.atImc && elig === "ineligible")) && !c) {
      review.comment.focus();
      return toast(action === "return" ? "반려 사유를 입력하세요" : action === "reject" ? "불승인 사유를 입력하세요" : "비적격 사유를 입력하세요", "warn");
    }
    if (!(await confirmDialog({ title: confirmText, message: c ? `의견: ${c}` : "결재하면 다음 단계로 넘어갑니다.", confirm: confirmText, danger }))) return;
    buttons.forEach((b) => (b.disabled = true));
    try {
      if (form.editable && Object.keys(form.diff()).length) await api.patch(`/entries/${e.id}`, form.diff()); // 재무팀 정정분 먼저 저장
      const r = await api.post(`/entries/${e.id}/review`, { action, eligibility: review.atImc ? elig : undefined, comment: c || undefined, expectedStatus: e.status });
      toast(`${ACTION_LABEL[action]} — ${STATUS[r.status]?.label || r.status}`, action === "approve" ? "ok" : "warn");
      onChanged();
      close(true);
    } catch (ex) {
      toast(errorText(ex), "bad", 6000);
      buttons.forEach((b) => (b.disabled = false));
    }
  };
  const btn = (cls, ic, label, fn) => {
    const b = h("button", { class: `btn ${cls}`, type: "button", onclick: fn }, icon(ic), h("span", {}, label));
    buttons.push(b);
    return b;
  };
  const returnBtn = btn("btn-danger-ghost", "x", "반려", () => send("return", "지국으로 반려", true));
  const right = [];
  if (review.atImc) {
    const approve = btn("btn-primary", "check", "", () => send("approve", approve.textContent));
    const sync = () => {
      const elig = review.eligibility();
      approve.querySelector("span:last-child").textContent =
        elig === "ineligible" ? "비적격 — 보도국장 전결 요청" : elig === "eligible" ? "적격 — 재무팀으로" : "분류를 선택하세요";
      approve.disabled = !elig;
    };
    review.node.addEventListener("eligibility", sync);
    sync();
    right.push(approve);
  } else if (e.status === "chief_review") {
    right.push(btn("btn-ghost", "x", "불승인", () => send("reject", "불승인(지급하지 않음)", true)));
    right.push(btn("btn-primary", "check", "승인", () => send("approve", "비적격 증빙 승인")));
  } else {
    right.push(btn("btn-primary", "check", "최종 결재", () => send("approve", "증빙 최종 결재")));
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
      message: h("div", {}, h("p", {}, "제출을 취소하면 '지국 작성중'으로 돌아가 다시 수정할 수 있습니다. 고친 뒤 다시 제출하세요."), h("p", { class: "muted small" }, "보도IMC팀이 이미 분류했다면 취소되지 않습니다.")),
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
  return [h("span", { class: "muted small" }, "보도IMC팀 결재 대기 중 — 취소하면 다시 수정할 수 있습니다"), h("div", { class: "foot-right" }, h("button", { class: "btn btn-ghost", type: "button", onclick: () => close() }, "닫기"), btn)];
}

function footer(e, form, { me, close, onChanged, reopen }) {
  if (!form.editable) {
    // 보도IMC팀이 아직 분류하지 않은 증빙은 지국 담당자가 제출을 취소하고 다시 고칠 수 있다
    if (e.status === "submitted" && me.role === "staff") return withdrawFooter(e, { close, onChanged });
    return [h("span", { class: "muted small" }, "읽기 전용"), h("button", { class: "btn btn-ghost", type: "button", onclick: () => close() }, "닫기")];
  }

  const saveBtn = h("button", { class: "btn btn-ghost", type: "button" }, icon("check"), h("span", {}, "저장"));
  const submitBtn = h("button", { class: "btn btn-primary", type: "button" }, icon("send"), h("span", {}, "IMC팀에 제출"));
  const delBtn = h("button", { class: "btn btn-danger-ghost", type: "button" }, icon("trash"), h("span", {}, "삭제"));
  const lock = (v) => [saveBtn, submitBtn, delBtn].forEach((b) => (b.disabled = v));

  async function save() {
    const patch = form.diff();
    if (patch.amount !== undefined && !(patch.amount >= 0)) throw new Error("금액을 확인하세요");
    if (!Object.keys(patch).length) return false;
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
      title: "보도IMC팀에 제출",
      message: h("div", {}, h("p", {}, "원본 증빙과 대조를 마쳤나요? 수정한 내용을 저장하고 보도IMC팀에 제출합니다. 제출하면 결재선으로 넘어가며, 보도IMC팀이 분류하기 전에는 [제출 취소]로, 그 뒤에는 반려되어야 수정할 수 있습니다."), e.status === "flagged" ? h("p", { class: "text-warn" }, "검토 필요 항목이 남아 있습니다.") : null),
      confirm: "IMC팀에 제출",
    });
    if (!ok) return;
    // AI 가 이미 정책 위반으로 판정했고 판정에 쓰인 내용을 고치지 않았다면, 소명 없이는 자동 반려된다 → 미리 소명을 받는다
    const GATE_INPUTS = ["account", "merchant", "merchantKo", "memo", "amount", "txnDate"];
    const touched = Object.keys(form.diff()).some((k) => GATE_INPUTS.includes(k));
    let justification = null;
    if (e.aiGate?.verdict === "fail" && !e.aiGate.stale && !touched) { // 반려 후 다시 낼 때도 새 소명이 필요하다
      justification = await promptDialog({
        title: "AI 1차 검증 — 소명 후 제출",
        message: h("div", {}, h("p", {}, "AI 가 이 증빙을 정책 위반으로 판단했습니다. 소명 없이 제출하면 자동 반려됩니다."),
          h("ul", { class: "ai-viol" }, (e.aiGate.violations || []).map((x) => h("li", {}, h("span", { class: "ai-viol-rule" }, x.rule), h("span", { class: "ai-viol-why" }, x.reason)))),
          h("p", { class: "small" }, "업무상 필요한 지출이라면 사유를 적어 주세요. 소명과 함께 보도IMC팀으로 넘어가 사람이 판단합니다.")),
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
      toast(justification ? "소명과 함께 보도IMC팀에 제출했습니다" : "보도IMC팀에 제출했습니다", "ok");
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
