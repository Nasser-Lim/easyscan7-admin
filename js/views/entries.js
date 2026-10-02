// 전표 조회 — 필터·정렬 목록, 일괄 제출, 상세 서랍(원본 증빙 대조 + 수정·제출·삭제).
import { api } from "../api.js";
import {
  ACCOUNTS, BRANCH, DOC_TYPE, STATUS, chip, clear, confirmDialog, currentQuarter, dateText, dateTime, empty, errorText,
  field, h, icon, money, noticeParts, QUARTER_SOURCE, quarterLabel, quarterOf, quarterOptions, select, spinner, statusChip, toast,
} from "../ui.js";
import { pageHeader } from "./shell.js";

const EDITABLE_STATUS = new Set(["draft", "flagged"]);
// 화면을 옮겨 다녀도 필터는 유지(세션 동안)
const state = { quarter: currentQuarter(), account: "", status: "", q: "", sort: "txnDate", dir: -1 };

export function renderEntries(el, { me, params }) {
  const branch = `${BRANCH[me.branchId] || me.branchId}지국`;
  let rows = [];
  const selected = new Set();

  const quarter = select(quarterOptions(6).map((q) => [q, quarterLabel(q)]), state.quarter, { class: "input input-sm" });
  const account = select([["", "전체 계정"], ...ACCOUNTS.map((a) => [a, a])], state.account, { class: "input input-sm" });
  const status = select([["", "전체 상태"], ...["draft", "flagged", "submitted", "approved"].map((s) => [s, STATUS[s].label])], state.status, { class: "input input-sm" });
  const search = h("input", { class: "input input-sm", type: "search", placeholder: "가맹점·주문번호·적요 검색", value: state.q });
  const kpiBar = h("div", { class: "kpis kpis-sm" });
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
      title: "전표 조회",
      desc: "AI 가 만든 전표를 원본 증빙과 대조해 수정하고 제출합니다.",
      actions: [refreshBtn, h("a", { class: "btn btn-primary", href: "#/upload" }, icon("upload"), h("span", {}, "증빙 업로드"))],
    }),
    kpiBar,
    h(
      "section",
      { class: "card card-flush" },
      h("div", { class: "toolbar" }, h("div", { class: "toolbar-filters" }, quarter, account, status), h("div", { class: "toolbar-search" }, icon("search"), search)),
      bulk,
      tableWrap,
    ),
  );

  async function load() {
    clear(tableWrap).append(h("div", { class: "card-loading" }, spinner()));
    selected.clear();
    try {
      rows = (await api.get(`/entries?quarter=${encodeURIComponent(state.quarter)}`)).entries;
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
    const cur = rows.find((e) => e.currency)?.currency || "USD";
    const by = (s) => rows.filter((e) => e.status === s);
    const sum = (arr, f = "amount") => arr.reduce((a, e) => a + (Number(e[f]) || 0), 0);
    clear(kpiBar).append(
      mini("전체", rows.length, money(sum(rows), cur)),
      mini("작성중", by("draft").length, money(sum(by("draft")), cur)),
      mini("검토 필요", by("flagged").length, money(sum(by("flagged")), cur), "warn"),
      mini("제출됨", by("submitted").length, money(sum(by("submitted")), cur), "info"),
      mini("승인됨", by("approved").length, money(sum(by("approved")), cur), "ok"),
      mini("비적격", money(sum(rows, "ineligibleAmount"), cur), "한도 초과분", sum(rows, "ineligibleAmount") > 0 ? "bad" : null),
    );

    const list = visible();
    for (const id of [...selected]) if (!list.some((e) => e.id === id && EDITABLE_STATUS.has(e.status))) selected.delete(id);
    paintBulk();
    if (!list.length) {
      clear(tableWrap).append(rows.length ? empty("조건에 맞는 전표가 없습니다", "필터를 바꿔 보세요.") : empty(`${quarterLabel(state.quarter)} 전표가 없습니다`, "증빙을 업로드하면 전표가 만들어집니다."));
      return;
    }
    const selectable = list.filter((e) => EDITABLE_STATUS.has(e.status));
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
            h("th", { class: "cell-check" }, all),
            th("사용일", "txnDate"),
            th("가맹점", "merchant"),
            th("계정", "account"),
            th("증빙", "docType"),
            th("금액", "amount", "num"),
            th("비적격", "ineligibleAmount", "num"),
            th("상태", "status"),
            th("등록", "createdAt"),
          ),
        ),
        h(
          "tbody",
          {},
          list.map((e) => {
            const cb = h("input", { type: "checkbox", class: "check", "aria-label": "선택", disabled: !EDITABLE_STATUS.has(e.status) });
            cb.checked = selected.has(e.id);
            cb.addEventListener("click", (ev) => ev.stopPropagation());
            cb.addEventListener("change", () => ((cb.checked ? selected.add(e.id) : selected.delete(e.id)), paint()));
            const notes = (e.notices || []).length;
            return h(
              "tr",
              { class: `row-link${selected.has(e.id) ? " selected" : ""}`, onclick: () => openDrawer(e.id, me, onChanged) },
              h("td", { class: "cell-check" }, cb),
              h("td", { class: "mono" }, dateText(e.txnDate)),
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
              h("td", {}, statusChip(e.status)),
              h("td", { class: "cell-sub mono" }, dateTime(e.createdAt)),
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
    bulk.append(
      h("span", {}, h("b", {}, `${selected.size}건`), ` 선택 · ${money(picked.reduce((a, e) => a + (Number(e.amount) || 0), 0), cur)}`),
      h("div", { class: "bulk-actions" }, h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => (selected.clear(), paint()) }, "선택 해제"), h("button", { class: "btn btn-primary btn-sm", type: "button", onclick: () => bulkSubmit(picked) }, icon("send"), h("span", {}, "선택 제출"))),
    );
  }

  async function bulkSubmit(picked) {
    const missing = picked.filter((e) => e.account === "취재비" && !(e.memo || "").trim());
    if (missing.length) {
      toast(`취재비 전표 ${missing.length}건에 적요가 없습니다. 적요를 입력한 뒤 제출하세요.`, "warn", 5000);
      return;
    }
    const flagged = picked.filter((e) => e.status === "flagged").length;
    const ok = await confirmDialog({
      title: `전표 ${picked.length}건 제출`,
      message: h("div", {}, h("p", {}, "제출한 전표는 결재선으로 넘어가며, 이후 수정은 재무팀에 요청해야 합니다."), flagged ? h("p", { class: "text-warn" }, `검토 필요 전표 ${flagged}건이 포함되어 있습니다. 원본과 대조했는지 확인하세요.`) : null),
      confirm: "제출",
    });
    if (!ok) return;
    let done = 0;
    const failed = [];
    for (const e of picked) {
      try {
        await api.post(`/entries/${e.id}/submit`);
        done++;
      } catch (ex) {
        failed.push(`${e.merchant || e.id}: ${errorText(ex)}`);
      }
    }
    toast(failed.length ? `${done}건 제출, ${failed.length}건 실패` : `${done}건을 제출했습니다`, failed.length ? "bad" : "ok");
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

function openDrawer(id, me, onChanged) {
  if (openBack) openBack.close();
  const urls = [];
  const body = h("div", { class: "drawer-body" }, h("div", { class: "card-loading" }, spinner()));
  const titleEl = h("div", { class: "drawer-title" }, "전표 상세");
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
      { class: "drawer", role: "dialog", "aria-modal": "true", "aria-label": "전표 상세" },
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
      clear(titleEl).append(e.merchantKo || e.merchant || "전표 상세", " ", statusChip(e.status));
      subEl.textContent = [e.account, quarterLabel(e.quarter), e.orderNumber ? `주문 #${e.orderNumber}` : null, `ID ${e.id}`].filter(Boolean).join(" · ");
      const form = detailForm(e, me);
      dirty = form.dirty;
      clear(body).append(h("div", { class: "detail" }, evidenceViewer(e, urls), h("div", { class: "detail-side" }, form.node)));
      clear(foot).append(...footer(e, form, { close, onChanged, reopen: () => openDrawer(id, me, onChanged) }));
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

function detailForm(e, me) {
  const editable = EDITABLE_STATUS.has(e.status);
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
      [...new Set([...quarterOptions(6), e.quarter].filter(Boolean))].sort().reverse().map((q) => [q, quarterLabel(q)]),
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

  const mark = (k, el) => (lowConf(k) ? h("div", { class: "lowconf" }, el, h("span", { class: "lowconf-tag", title: `AI 신뢰도 ${Math.round(confOf(k) * 100)}%` }, "확인")) : el);

  const banners = [];
  if (e.limitBasis?.status === "excluded_currency")
    banners.push(banner("info", "info", "한도 계산 제외", `${cur} 영수증은 지국 한도(${e.limitBasis.currency || "USD"}) 계산에서 빠집니다. 환산은 재무팀이 확인합니다.`));
  if (e.ineligibleAmount > 0)
    banners.push(banner("bad", "alert", "한도 초과 — 비적격", `분기 한도를 넘어 ${money(e.ineligibleAmount, cur)} 가 비적격 처리되었습니다(적격 ${money(e.eligibleAmount, cur)}). 제출은 가능합니다.`));
  for (const f of e.flags || []) banners.push(banner(f.severity === "error" ? "bad" : "warn", "alert", f.severity === "error" ? "검증 오류" : "검토 필요", f.message));
  for (const n of e.notices || []) {
    const p = noticeParts(n);
    banners.push(banner(p.tone === "bad" ? "bad" : p.tone === "warn" ? "warn" : "info", "info", p.label, p.text));
  }
  if (e.status === "submitted") banners.push(banner("info", "info", "제출됨", "결재 진행 중인 전표입니다. 수정이 필요하면 재무팀에 요청하세요."));
  if (e.status === "approved") banners.push(banner("ok", "check", "승인됨", "승인이 끝난 전표라 수정할 수 없습니다."));

  const items = e.lineItems || [];
  const node = h(
    "div",
    { class: "detail-form" },
    banners.length ? h("div", { class: "banners" }, banners) : null,
    h("div", { class: "section-label" }, "전표 정보"),
    h(
      "div",
      { class: "form-grid" },
      field("계정", inputs.account),
      field("사용일", mark("txnDate", inputs.txnDate)),
      field(`금액 (${cur})`, mark("amount", inputs.amount)),
      h("label", { class: "field" }, h("span", { class: "field-label" }, "정산 분기"), inputs.quarter, quarterHint),
      field("가맹점 (원문)", mark("merchant", inputs.merchant)),
      field("가맹점 (한글)", inputs.merchantKo),
      h("label", { class: "field span-2" }, h("span", { class: "field-label" }, "적요"), inputs.memo, memoHint),
    ),
    h("div", { class: "section-label" }, "AI 인식 정보"),
    h(
      "dl",
      { class: "kv kv-compact" },
      h("dt", {}, "증빙 유형"), h("dd", {}, DOC_TYPE[e.docType] || e.docType || "—"),
      h("dt", {}, "주문번호"), h("dd", { class: "mono" }, e.orderNumber || "—"),
      h("dt", {}, "인쇄 합계"), h("dd", {}, money(e.printedTotal, cur)),
      h("dt", {}, "수기 합계"), h("dd", {}, e.handwrittenTotal != null ? money(e.handwrittenTotal, cur) : "—"),
      h("dt", {}, "팁"), h("dd", {}, e.tipAmount != null ? money(e.tipAmount, cur) : "—"),
      e.itemsSummaryKo ? [h("dt", {}, "품목 요약"), h("dd", {}, e.itemsSummaryKo)] : null,
      h("dt", {}, "등록"), h("dd", {}, `${dateTime(e.createdAt)} · ${e.via === "intake" ? "관리웹 업로드" : "촬영앱"}`),
      e.updatedAt ? [h("dt", {}, "최종 수정"), h("dd", {}, dateTime(e.updatedAt))] : null,
    ),
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

function banner(tone, ic, title, text) {
  return h("div", { class: `banner banner-${tone}` }, icon(ic), h("div", {}, h("b", {}, title), h("div", {}, text)));
}

function footer(e, form, { close, onChanged, reopen }) {
  if (!form.editable) return [h("span", { class: "muted small" }, "읽기 전용"), h("button", { class: "btn btn-ghost", type: "button", onclick: () => close() }, "닫기")];

  const saveBtn = h("button", { class: "btn btn-ghost", type: "button" }, icon("check"), h("span", {}, "저장"));
  const submitBtn = h("button", { class: "btn btn-primary", type: "button" }, icon("send"), h("span", {}, "저장 후 제출"));
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
      title: "전표 제출",
      message: h("div", {}, h("p", {}, "원본 증빙과 대조를 마쳤나요? 제출하면 결재선으로 넘어가고 이후 수정은 재무팀에 요청해야 합니다."), e.status === "flagged" ? h("p", { class: "text-warn" }, "검토 필요 항목이 남아 있습니다.") : null),
      confirm: "제출",
    });
    if (!ok) return;
    lock(true);
    try {
      await save();
      await api.post(`/entries/${e.id}/submit`);
      toast("제출했습니다", "ok");
      onChanged();
      close(true);
    } catch (ex) {
      toast(errorText(ex), "bad");
      lock(false);
    }
  });

  delBtn.addEventListener("click", async () => {
    const ok = await confirmDialog({ title: "전표 삭제", message: "이 전표를 삭제할까요? 한도 계산에서도 빠집니다.", confirm: "삭제", danger: true });
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
