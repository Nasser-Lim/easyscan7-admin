// 한도·정산 설정 — 정산 방식(월별/분기별)과 지국별·계정별 한도·통화. 보도BIZ팀·재무팀·관리자.
// 한도는 분기 값으로 저장하고, 월별 정산이면 산술 비례(분기 ÷ 3)로 쓴다 — 입력은 지금 정산 방식의 단위로 받는다.
// 저장하면 서버가 영향받는 그룹을 다시 계산한다. 결재선에 오른 증빙의 배분은 고정(services/limits.py).
import { api } from "../api.js?v=b8fd816";
import { getMode, setMode, unitName } from "../period.js?v=b8fd816";
import { ROLE, chip, clear, confirmDialog, dateTime, displayTeamName, errorText, h, icon, select, spinner, tip, toast } from "../ui.js?v=b8fd816";
import { pageHeader } from "./shell.js?v=b8fd816";

const SYMBOL = { USD: "$", KRW: "₩", JPY: "¥", EUR: "€", CNY: "¥" };
const ACCOUNT_ORDER = ["취재비", "경상비", "차량유지비"];
const SOURCE = { seed: ["초기값 — 저장 전", "warn"], none: ["한도 미설정", "neutral"], saved: null };
const r2 = (n) => Math.round(n * 100) / 100;
const fmt = (n, cur) => (n === undefined || n === null ? "한도 없음" : `${SYMBOL[cur] || ""}${Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 })}`);
// 저장값(분기) ↔ 화면값(지금 단위)
const toView = (q) => (q === undefined || q === null ? undefined : getMode() === "month" ? r2(q / 3) : q);
const toStore = (v) => (getMode() === "month" ? r2(v * 3) : v);

const HELP_LIMIT = "한도를 넘는 금액은 제출은 되지만 비적격입니다.\n· 작성 중·반려·보도BIZ팀 분류 전 증빙은 새 한도로 다시 계산\n· 보도국장·재무팀 단계와 결재 완료 증빙은 금액 고정(재무팀 정정 시 재계산)\n· 빈칸 = 한도 없음, 0 = 전액 비적격\n· 지국 통화와 다른 영수증은 한도 판정 제외(현황에는 참고용 환산)";
const HELP_MODE = "정산과 한도를 월 단위로 볼지, 분기 단위로 볼지 정합니다.\n· 한도는 분기 값으로 저장되고 월별이면 분기 ÷ 3\n· 바꾸면 모든 지국의 한도 배분을 새 단위로 다시 계산(결재선에 오른 증빙은 고정)\n· 기간은 영수증 사용일 기준(증빙에서 직접 바꿀 수 있음)";

export function renderLimitSettings(el, ctx) {
  draw(el, ctx);
}

function draw(el, { me }) {
  clear(el);
  const rowsBox = h("tbody", {});
  const histBox = h("div", { class: "hist-box" }, h("div", { class: "muted small" }, "지국을 고르면 최근 변경 이력이 표시됩니다."));
  const histBranch = h("select", { class: "input input-sm" });
  const unit = unitName();
  let cfg = null;
  let accounts = ACCOUNT_ORDER;

  el.append(
    pageHeader({
      crumbs: ["본사", ROLE[me.role] || me.role],
      title: "한도·정산 설정",
      help: "정산 방식(월별/분기별)과 지국·계정별 한도를 정합니다.",
      actions: [h("button", { class: "btn btn-ghost", type: "button", onclick: () => draw(el, { me }) }, icon("refresh"), h("span", {}, "새로고침"))],
    }),
    modeCard(() => draw(el, { me })),
    h(
      "section",
      { class: "card card-flush" },
      h("div", { class: "card-head card-head-pad" }, h("div", { class: "card-title" }, `${unit} 한도`, tip(HELP_LIMIT)), h("div", { class: "card-meta" }, unit === "월" ? "월 한도 = 분기 한도 ÷ 3" : "월 한도 = 분기 한도 ÷ 3로 함께 표시")),
      h("div", { class: "table-wrap" },
        h("table", { class: "table limit-table" },
          h("thead", {}, h("tr", {}, h("th", {}, "지국"), h("th", {}, "통화"), ...ACCOUNT_ORDER.map((a) => h("th", { class: "num" }, `${a} (${unit})`)), h("th", {}, "최근 변경"), h("th", {}))),
          rowsBox)),
    ),
    h("section", { class: "card" }, h("div", { class: "card-head" }, h("div", { class: "card-title" }, "변경 이력"), histBranch), histBox),
  );

  async function load() {
    clear(rowsBox).append(h("tr", {}, h("td", { colspan: "7" }, h("div", { class: "card-loading" }, spinner()))));
    try {
      cfg = await api.get("/limits/config");
      accounts = ACCOUNT_ORDER.filter((a) => cfg.accounts.includes(a));
      clear(rowsBox).append(...cfg.branches.map((b) => makeRow(b)));
      if (!histBranch.options.length) cfg.branches.forEach((b) => histBranch.append(h("option", { value: b.branchId }, `${b.name}지국`)));
      histBranch.onchange = () => loadHistory(histBranch.value);
      loadHistory(histBranch.value);
    } catch (e) {
      clear(rowsBox).append(h("tr", {}, h("td", { colspan: "7", class: "card-error" }, errorText(e))));
    }
  }

  function makeRow(b) {
    const cur = select(cfg.currencies.map((c) => [c, c]), b.currency, { class: "input input-sm" });
    const other = {};
    const inputs = Object.fromEntries(
      accounts.map((a) => {
        const inp = h("input", { class: "input input-sm num limit-input", type: "number", min: "0", step: "any", inputmode: "decimal",
          placeholder: "한도 없음", value: toView(b.limits[a]) ?? "", "aria-label": `${b.name}지국 ${a} ${unit} 한도` });
        other[a] = h("div", { class: "cell-sub limit-alt" });
        return [a, inp];
      }),
    );
    // 다른 단위 환산값(분기 ↔ 월)을 입력칸 아래에 작게
    const syncAlt = () => {
      for (const a of accounts) {
        const raw = inputs[a].value.trim();
        const n = Number(raw);
        other[a].textContent = raw === "" || !Number.isFinite(n) ? "" : unit === "월" ? `분기 ${fmt(r2(n * 3), cur.value)}` : `월 ${fmt(r2(n / 3), cur.value)}`;
      }
    };
    const save = h("button", { class: "btn btn-primary btn-sm", type: "button", disabled: true }, "저장");
    const readLimits = () => {
      const out = {};
      for (const a of accounts) {
        const raw = inputs[a].value.trim();
        if (raw === "") continue;
        const n = Number(raw);
        if (!Number.isFinite(n) || n < 0) throw new Error(`${a} 한도는 0 이상의 숫자여야 합니다`);
        out[a] = toStore(n);
      }
      return out;
    };
    const dirty = () => cur.value !== b.currency || accounts.some((a) => (inputs[a].value.trim() === "" ? undefined : Number(inputs[a].value)) !== toView(b.limits[a]));
    const sync = () => {
      const d = dirty();
      save.disabled = !d;
      tr.classList.toggle("dirty", d);
      syncAlt();
    };
    [cur, ...Object.values(inputs)].forEach((x) => x.addEventListener("input", sync));
    cur.addEventListener("change", sync);

    save.addEventListener("click", async () => {
      let limits;
      try {
        limits = readLimits();
      } catch (e) {
        return toast(e.message, "warn");
      }
      const lines = [];
      for (const a of accounts) {
        if (b.limits[a] !== limits[a]) lines.push(h("li", {}, h("b", {}, a), ` ${fmt(toView(b.limits[a]), b.currency)} → ${fmt(toView(limits[a]), cur.value)} (${unit})`));
      }
      if (cur.value !== b.currency) lines.unshift(h("li", {}, h("b", {}, "통화"), ` ${b.currency} → ${cur.value}`));
      const ok = await confirmDialog({
        title: `${b.name}지국 한도 변경`,
        message: h("div", {}, h("ul", { class: "diff-list" }, lines),
          cur.value !== b.currency ? h("p", { class: "text-warn" }, `${b.currency} 증빙은 한도 계산에서 빠집니다.`) : null,
          Object.keys(limits).length === 0 ? h("p", { class: "text-warn" }, "모든 한도를 비웠습니다 — 한도 없이 운영됩니다.") : null),
        confirm: "저장",
      });
      if (!ok) return;
      save.disabled = true;
      try {
        const r = await api.put(`/limits/config/${b.branchId}`, { currency: cur.value, limits });
        toast(`${b.name}지국 한도를 저장했습니다 · ${r.groupsRecomputed}개 그룹 다시 계산`, "ok");
        await load();
      } catch (e) {
        toast(errorText(e), "bad", 6000);
        sync();
      }
    });

    const src = SOURCE[b.source];
    const tr = h(
      "tr",
      { class: "limit-row-tr" },
      h("td", {}, h("div", { class: "cell-main" }, `${b.name}지국`), src ? h("div", { class: "cell-sub" }, chip(src[0], src[1])) : null),
      h("td", {}, cur),
      ...accounts.map((a) => h("td", { class: "num" }, inputs[a], other[a])),
      h("td", { class: "cell-sub" }, b.updatedAt ? [displayTeamName(b.updatedTeam), b.updatedTeam ? h("br", {}) : "", dateTime(b.updatedAt)] : "—"),
      h("td", { class: "cell-action" }, save),
    );
    syncAlt();
    return tr;
  }

  async function loadHistory(branchId) {
    clear(histBox).append(h("div", { class: "card-loading" }, spinner(true)));
    try {
      const { history } = await api.get(`/limits/config/${branchId}/history`);
      clear(histBox);
      if (!history.length) return histBox.append(h("div", { class: "muted small" }, "변경 이력이 없습니다."));
      histBox.append(
        h("table", { class: "table table-compact" },
          h("thead", {}, h("tr", {}, h("th", {}, "일시"), h("th", {}, "변경자"), h("th", {}, "변경 내용(분기 한도)"))),
          h("tbody", {}, history.map((r) => {
            const before = r.before?.limits || {};
            const after = r.after?.limits || {};
            const cb = r.before?.currency || "—";
            const ca = r.after?.currency;
            const diffs = accounts.filter((a) => before[a] !== after[a]).map((a) => `${a} ${fmt(before[a], ca)} → ${fmt(after[a], ca)}`);
            if (r.before?.currency && cb !== ca) diffs.unshift(`통화 ${cb} → ${ca}`);
            return h("tr", {}, h("td", { class: "mono" }, dateTime(r.at)), h("td", {}, ROLE[r.role] || r.role || "—"), h("td", {}, diffs.length ? diffs.join(" · ") : "변경 없음"));
          }))),
      );
    } catch (e) {
      clear(histBox).append(h("p", { class: "card-error" }, errorText(e)));
    }
  }

  load();
}

// 정산 방식 — [분기별 | 월별]. 바꾸면 전 지국 한도 배분을 다시 계산하고 화면 전체를 새 단위로 다시 그린다.
function modeCard(onChanged) {
  const cur = getMode();
  const seg = (m, label) =>
    h("button", { type: "button", class: `period-seg${m === cur ? " on" : ""}`, role: "radio", "aria-checked": m === cur ? "true" : "false", onclick: () => change(m) }, h("span", { class: "period-q" }, label));
  const meta = h("span", { class: "card-meta" });
  api.get("/settings/settlement").then((r) => (meta.textContent = r.updatedAt ? `${displayTeamName(r.updatedTeam)} · ${dateTime(r.updatedAt)}` : "기본값"), () => {});
  async function change(m) {
    if (m === cur) return;
    const label = m === "month" ? "월별" : "분기별";
    const ok = await confirmDialog({
      title: `정산 방식을 ${label}로 바꿀까요?`,
      message: h("div", {}, h("p", {}, `증빙 조회·한도·정산 출력이 ${m === "month" ? "월" : "분기"} 단위로 바뀌고, 모든 지국의 한도 배분을 다시 계산합니다.`),
        h("p", { class: "muted small" }, "결재선에 오른 증빙의 금액은 바뀌지 않습니다.")),
      confirm: `${label}로 변경`,
    });
    if (!ok) return;
    try {
      const r = await api.put("/settings/settlement", { mode: m });
      setMode(r.mode, r);
      try {
        sessionStorage.removeItem("es7.period");
      } catch {
        /* 무시 */
      }
      toast(`정산 방식을 ${label}로 바꿨습니다 · ${r.groupsRecomputed}개 그룹 다시 계산`, "ok");
      onChanged();
    } catch (e) {
      toast(errorText(e), "bad", 6000);
    }
  }
  return h(
    "section",
    { class: "card mode-card" },
    h("div", { class: "card-head" }, h("div", { class: "card-title" }, "정산 방식", tip(HELP_MODE)), meta),
    h("div", { class: "period-switch", role: "radiogroup", "aria-label": "정산 방식" }, h("div", { class: "period-segs" }, seg("quarter", "분기별"), seg("month", "월별"))),
  );
}
