// 분기 한도 설정 — 지국별·계정별 분기 한도와 통화. 보도IMC팀(실무·팀장)·재무팀·관리자.
// 저장하면 서버가 영향받는 (지국·분기·계정) 그룹을 다시 계산한다. 결재선에 오른 증빙의 배분은 고정(services/limits.py).
import { api } from "../api.js";
import { ROLE, chip, clear, confirmDialog, dateTime, errorText, h, icon, select, spinner, toast } from "../ui.js";
import { pageHeader } from "./shell.js";

const SYMBOL = { USD: "$", KRW: "₩", JPY: "¥", EUR: "€", CNY: "¥" };
// 화면 표시 순서 — 머리글과 입력칸이 같은 배열에서 만들어져 어긋나지 않게 한다(서버 목록 순서와 무관)
const ACCOUNT_ORDER = ["취재비", "경상비", "차량유지비"];
const SOURCE = { seed: ["초기값 — 저장 전", "warn"], none: ["한도 미설정", "neutral"], saved: null };
const fmt = (n, cur) => (n === undefined || n === null ? "한도 없음" : `${SYMBOL[cur] || ""}${Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 })}`);

export function renderLimitSettings(el, { me }) {
  const rowsBox = h("tbody", {});
  const histBox = h("div", { class: "hist-box" }, h("div", { class: "muted small" }, "지국을 고르면 최근 변경 이력이 표시됩니다."));
  const histBranch = h("select", { class: "input input-sm" });
  let cfg = null;
  let rows = [];
  let accounts = ACCOUNT_ORDER; // 서버가 알려 주는 계정 중 표시 순서대로

  el.append(
    pageHeader({
      crumbs: ["본사", ROLE[me.role] || me.role],
      title: "분기 한도 설정",
      desc: "취재비·경상비·차량유지비의 분기 한도를 지국별로 정합니다. 한도를 넘는 금액은 제출은 되지만 비적격으로 처리됩니다.",
      actions: [h("button", { class: "btn btn-ghost", type: "button", onclick: () => load() }, icon("refresh"), h("span", {}, "새로고침"))],
    }),
    h(
      "div",
      { class: "banner banner-info limit-note" },
      icon("info"),
      h("div", {}, h("b", {}, "한도를 바꾸면 이렇게 반영됩니다"),
        h("ul", {}, h("li", {}, "작성 중·분류 전·반려된 증빙은 새 한도로 다시 계산됩니다."),
          h("li", {}, "보도IMC팀 분류 이후(결재 진행 중·완료) 증빙은 결재자가 본 금액 그대로 고정됩니다."),
          h("li", {}, "한도를 비워 두면 그 계정은 한도 없이 운영됩니다. 통화를 바꾸면 다른 통화 증빙은 한도 계산에서 빠집니다."))),
    ),
    h(
      "section",
      { class: "card card-flush" },
      h("div", { class: "table-wrap" },
        h("table", { class: "table limit-table" },
          h("thead", {}, h("tr", {}, h("th", {}, "지국"), h("th", {}, "통화"), ...ACCOUNT_ORDER.map((a) => h("th", { class: "num" }, a)), h("th", {}, "최근 변경"), h("th", {}))),
          rowsBox)),
    ),
    h("section", { class: "card" }, h("div", { class: "card-head" }, h("div", { class: "card-title" }, "변경 이력"), histBranch), histBox),
  );

  async function load() {
    clear(rowsBox).append(h("tr", {}, h("td", { colspan: "7" }, h("div", { class: "card-loading" }, spinner()))));
    try {
      cfg = await api.get("/limits/config");
      accounts = ACCOUNT_ORDER.filter((a) => cfg.accounts.includes(a));
      paint();
      if (!histBranch.options.length)
        cfg.branches.forEach((b) => histBranch.append(h("option", { value: b.branchId }, `${b.name}지국`)));
      histBranch.onchange = () => loadHistory(histBranch.value);
      loadHistory(histBranch.value);
    } catch (e) {
      clear(rowsBox).append(h("tr", {}, h("td", { colspan: "7", class: "card-error" }, errorText(e))));
    }
  }

  function paint() {
    rows = cfg.branches.map((b) => makeRow(b));
    clear(rowsBox).append(...rows.map((r) => r.tr));
  }

  function makeRow(b) {
    const cur = select(cfg.currencies.map((c) => [c, c]), b.currency, { class: "input input-sm" });
    const inputs = Object.fromEntries(
      accounts.map((a) => [a, h("input", { class: "input input-sm num limit-input", type: "number", min: "0", step: "any", inputmode: "decimal",
        placeholder: "한도 없음", value: b.limits[a] ?? "", "aria-label": `${b.name}지국 ${a} 분기 한도` })]),
    );
    const save = h("button", { class: "btn btn-primary btn-sm", type: "button", disabled: true }, "저장");
    const readLimits = () => {
      const out = {};
      for (const a of accounts) {
        const raw = inputs[a].value.trim();
        if (raw === "") continue;
        const n = Number(raw);
        if (!Number.isFinite(n) || n < 0) throw new Error(`${a} 한도는 0 이상의 숫자여야 합니다`);
        out[a] = n;
      }
      return out;
    };
    const dirty = () => {
      if (cur.value !== b.currency) return true;
      return accounts.some((a) => (inputs[a].value.trim() === "" ? undefined : Number(inputs[a].value)) !== b.limits[a]);
    };
    const sync = () => {
      const d = dirty();
      save.disabled = !d;
      tr.classList.toggle("dirty", d);
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
        const before = b.limits[a];
        const after = limits[a];
        if (before !== after) lines.push(h("li", {}, h("b", {}, a), ` ${fmt(before, b.currency)} → ${fmt(after, cur.value)}`));
      }
      if (cur.value !== b.currency) lines.unshift(h("li", {}, h("b", {}, "통화"), ` ${b.currency} → ${cur.value}`));
      const noneLeft = Object.keys(limits).length === 0;
      const ok = await confirmDialog({
        title: `${b.name}지국 분기 한도 변경`,
        message: h("div", {}, h("ul", { class: "diff-list" }, lines),
          cur.value !== b.currency ? h("p", { class: "text-warn" }, `통화를 ${cur.value} 로 바꾸면 ${b.currency} 증빙은 한도 계산에서 빠집니다.`) : null,
          noneLeft ? h("p", { class: "text-warn" }, "모든 한도를 비웠습니다. 이 지국은 한도 없이 운영되어 초과 금액이 비적격으로 처리되지 않습니다.") : null,
          h("p", { class: "muted small" }, "결재선에 오른 증빙의 금액은 바뀌지 않고, 나머지 증빙은 새 한도로 다시 계산됩니다.")),
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
      ...accounts.map((a) => h("td", { class: "num" }, inputs[a])),
      h("td", { class: "cell-sub" }, b.updatedBy ? [b.updatedBy, h("br", {}), dateTime(b.updatedAt)] : "—"),
      h("td", { class: "cell-action" }, save),
    );
    return { tr };
  }

  async function loadHistory(branchId) {
    clear(histBox).append(h("div", { class: "card-loading" }, spinner(true)));
    try {
      const { history } = await api.get(`/limits/config/${branchId}/history`);
      clear(histBox);
      if (!history.length) return histBox.append(h("div", { class: "muted small" }, "변경 이력이 없습니다. (저장하면 여기에 남습니다)"));
      const b = cfg.branches.find((x) => x.branchId === branchId);
      histBox.append(
        h("table", { class: "table table-compact" },
          h("thead", {}, h("tr", {}, h("th", {}, "일시"), h("th", {}, "변경자"), h("th", {}, "변경 내용"))),
          h("tbody", {}, history.map((r) => {
            const before = r.before?.limits || {};
            const after = r.after?.limits || {};
            const cb = r.before?.currency || "—";
            const ca = r.after?.currency;
            const diffs = accounts.filter((a) => before[a] !== after[a]).map((a) => `${a} ${fmt(before[a], ca)} → ${fmt(after[a], ca)}`);
            if (r.before?.currency && cb !== ca) diffs.unshift(`통화 ${cb} → ${ca}`); // 처음 저장(이전 값 없음)이면 통화 변경으로 보지 않는다
            return h("tr", {}, h("td", { class: "mono" }, dateTime(r.at)), h("td", {}, r.email || "—", h("div", { class: "cell-sub" }, ROLE[r.role] || r.role || "")), h("td", {}, diffs.length ? diffs.join(" · ") : "변경 없음"));
          }))),
      );
    } catch (e) {
      clear(histBox).append(h("p", { class: "card-error" }, errorText(e)));
    }
  }

  load();
}
