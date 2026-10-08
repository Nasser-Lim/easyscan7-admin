// AI 적격 정책 — 보도IMC팀·재무팀이 계정별로 '이런 경우 비적격' 문장을 적는다(공용 설정).
// 이 정책으로 AI 가 지국 증빙의 1차 적격 검증(gate)을 한다: 업로드 직후 사전 판정, 제출할 때 위반이면 자동 반려.
import { api } from "../api.js";
import { aiGatePanel } from "../aigate.js";
import { ACCOUNTS, BRANCH, clear, confirmDialog, dateTime, errorText, h, icon, money, select, spinner, toast } from "../ui.js";
import { pageHeader } from "./shell.js";

const EXAMPLE = {
  취재비: "- 주류만 단독으로 구매한 영수증은 비적격(식사와 함께면 가능)\n- 취재와 무관한 개인 식사(1인 식사)는 비적격\n- 적요에 만난 사람·취재 건명이 없으면 비적격",
  경상비: "- 마트·대형할인점(Costco, Walmart 등)에서 산 개인 생활용품·식료품은 비적격\n- 기프트카드·상품권 구매는 비적격\n- 사무실·업무와 무관한 개인 물품은 비적격",
  차량유지비: "- 업무용 차량이 아닌 차량의 주유·정비는 비적격\n- 주유소에서 산 음료·간식 등 연료 외 품목은 비적격",
};

export function renderPolicy(el) {
  const body = h("div", { class: "stack" }, h("div", { class: "card-loading" }, spinner()));
  el.append(
    pageHeader({
      crumbs: ["본사", "설정"],
      title: "AI 적격 정책",
      desc: "지국이 올린 증빙을 AI 가 먼저 검증하는 기준입니다. 보도IMC팀과 재무팀이 함께 관리합니다.",
    }),
    body,
  );
  load();

  async function load() {
    try {
      const p = await api.get("/policies");
      draw(p);
    } catch (e) {
      clear(body).append(h("p", { class: "card-error" }, errorText(e)));
    }
  }

  function draw(p) {
    clear(body);
    const master = h("input", { type: "checkbox", class: "check" });
    master.checked = p.enabled;
    const forms = {};
    for (const acc of ACCOUNTS) {
      const on = h("input", { type: "checkbox", class: "check" });
      on.checked = p.accounts[acc]?.enabled !== false;
      const area = h("textarea", { class: "input policy-text", rows: "7", maxlength: String(p.maxChars), placeholder: `한 줄에 하나씩 적습니다. 예)\n${EXAMPLE[acc]}` }, p.accounts[acc]?.rules || "");
      area.addEventListener("input", () => syncDirty());
      on.addEventListener("change", syncDirty);
      forms[acc] = { on, area };
    }
    master.addEventListener("change", syncDirty);
    const snapshot = () => JSON.stringify({ e: master.checked, a: ACCOUNTS.map((a) => [forms[a].on.checked, forms[a].area.value.trim()]) });
    const initial = snapshot();
    const saveBtn = h("button", { class: "btn btn-primary", type: "button", disabled: true }, icon("check"), h("span", {}, "정책 저장"));
    const dirtyNote = h("span", { class: "muted small" });
    function syncDirty() {
      const dirty = snapshot() !== initial;
      saveBtn.disabled = !dirty;
      dirtyNote.textContent = dirty ? "저장하지 않은 변경이 있습니다" : p.version ? `v${p.version} · ${p.updatedBy || "-"} · ${dateTime(p.updatedAt)} 저장` : "아직 저장한 정책이 없습니다";
    }
    syncDirty();

    saveBtn.addEventListener("click", async () => {
      const changed = ACCOUNTS.filter((a) => forms[a].area.value.trim() !== (p.accounts[a]?.rules || "").trim() || forms[a].on.checked !== (p.accounts[a]?.enabled !== false));
      const ok = await confirmDialog({
        title: "AI 적격 정책 저장",
        message: h("div", {}, h("p", {}, "저장하면 바로 적용됩니다. 이후 올리거나 제출하는 증빙부터 새 정책으로 검증합니다."),
          changed.length ? h("p", { class: "small" }, `바뀐 계정: ${changed.join(", ")}`) : null,
          !master.checked ? h("p", { class: "small text-warn" }, "AI 1차 검증이 꺼진 상태로 저장됩니다 — 모든 증빙이 검증 없이 보도IMC팀으로 갑니다.") : null),
        confirm: "저장",
      });
      if (!ok) return;
      saveBtn.disabled = true;
      try {
        const saved = await api.put("/policies", { enabled: master.checked, accounts: Object.fromEntries(ACCOUNTS.map((a) => [a, { enabled: forms[a].on.checked, rules: forms[a].area.value.trim() }])) });
        toast(`AI 적격 정책을 저장했습니다 (v${saved.version})`, "ok");
        draw(saved);
      } catch (e) {
        toast(errorText(e), "bad");
        syncDirty();
      }
    });

    body.append(
      howCard(),
      h(
        "section",
        { class: "card policy-master" },
        h("label", { class: "policy-switch" }, master, h("span", {}, h("b", {}, "AI 1차 적격 검증 사용"), h("span", { class: "muted small" }, "끄면 모든 증빙이 AI 검증 없이 보도IMC팀으로 갑니다"))),
        h("div", { class: "policy-save" }, dirtyNote, saveBtn),
      ),
      h("div", { class: "policy-grid" }, ACCOUNTS.map((acc) =>
        h(
          "section",
          { class: "card" },
          h("div", { class: "card-head" }, h("div", { class: "card-title" }, acc), h("label", { class: "policy-acc-on" }, forms[acc].on, h("span", {}, "적용"))),
          forms[acc].area,
          h("div", { class: "policy-foot" }, h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => { if (!forms[acc].area.value.trim()) { forms[acc].area.value = EXAMPLE[acc]; forms[acc].area.dispatchEvent(new Event("input")); } else toast("내용이 있어 예시를 넣지 않았습니다 — 비운 뒤 다시 누르세요", "info"); } }, "예시 넣기")),
        ),
      )),
      testCard(forms),
      historyCard(),
    );
    // 글자 수 표시는 area 바로 아래
    for (const acc of ACCOUNTS) {
      const card = forms[acc].area.closest(".card");
      const foot = card.querySelector(".policy-foot");
      const cnt = h("span", { class: "muted small mono" });
      const sync = () => (cnt.textContent = `${forms[acc].area.value.split("\n").filter((l) => l.trim()).length}개 기준 · ${forms[acc].area.value.length.toLocaleString()}/${p.maxChars.toLocaleString()}자`);
      forms[acc].area.addEventListener("input", sync);
      sync();
      foot.prepend(cnt);
    }
  }
}

function howCard() {
  const step = (n, t, d) => h("li", {}, h("span", { class: "step-no" }, n), h("div", {}, h("div", { class: "step-title" }, t), h("div", { class: "step-desc" }, d)));
  return h(
    "section",
    { class: "card policy-how" },
    h("div", { class: "card-head" }, h("div", { class: "card-title" }, "작동 방식"), h("span", { class: "muted small" }, "AI 는 여기 적힌 기준만 적용합니다")),
    h(
      "ol",
      { class: "steps steps-row" },
      step("1", "업로드 직후 사전 판정", "촬영앱·관리웹으로 올리면 AI 가 계정별 정책으로 판정합니다. 위반이면 '검토 필요'로 표시해 지국이 제출 전에 압니다."),
      step("2", "제출할 때 최종 판정", "정책 위반이면 결재선에 올리지 않고 자동 반려합니다. 반려 사유와 위반 기준이 증빙과 결재 이력에 남습니다."),
      step("3", "소명하면 사람이 판단", "업무상 필요한 지출이면 지국이 소명을 적어 제출합니다. 보도IMC팀이 AI 판정과 소명을 함께 보고 분류합니다."),
    ),
    h("p", { class: "muted small" }, "판단할 정보가 부족하면 '판단 보류'로 통과시키고 결재자에게 표시합니다. 정책이 없는 계정은 검증하지 않습니다. 증빙 이미지가 아니라 AI 가 읽은 가맹점·품목·금액·적요로 판정합니다."),
  );
}

// 저장 전 문장으로 기존 증빙을 판정해 본다(결과는 저장하지 않음)
function testCard(forms) {
  const acc = select(ACCOUNTS.map((a) => [a, a]), ACCOUNTS[0], { class: "input input-sm" });
  const entrySel = h("select", { class: "input input-sm" });
  const run = h("button", { class: "btn btn-primary btn-sm", type: "button" }, icon("shield"), h("span", {}, "이 정책으로 판정"));
  const out = h("div", { class: "policy-test-out" }, h("p", { class: "muted small" }, "계정과 증빙을 고르고 판정해 보세요. 위 입력란의 (저장 전) 문장으로 판정하며 증빙에는 반영하지 않습니다."));
  async function loadEntries() {
    entrySel.replaceChildren(h("option", { value: "" }, "불러오는 중…"));
    try {
      const { entries } = await api.get(`/entries?account=${encodeURIComponent(acc.value)}`);
      const rows = entries.filter((e) => e.status !== "deleted").sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))).slice(0, 40);
      entrySel.replaceChildren(...(rows.length ? rows.map((e) => h("option", { value: e.id }, `${e.txnDate || "—"} · ${BRANCH[e.branchId] || e.branchId} · ${e.merchantKo || e.merchant || "—"} · ${money(e.amount, e.currency)}`)) : [h("option", { value: "" }, "이 계정의 증빙이 없습니다")]));
    } catch (e) {
      entrySel.replaceChildren(h("option", { value: "" }, errorText(e)));
    }
  }
  acc.addEventListener("change", loadEntries);
  loadEntries();
  run.addEventListener("click", async () => {
    if (!entrySel.value) return toast("판정할 증빙을 고르세요", "info");
    const rules = forms[acc.value].area.value;
    if (!rules.trim()) return toast(`${acc.value} 정책이 비어 있습니다`, "info");
    run.disabled = true;
    clear(out).append(h("div", { class: "card-loading" }, spinner(true)));
    try {
      const r = await api.post("/policies/test", { entryId: entrySel.value, rules });
      clear(out).append(
        h("dl", { class: "kv kv-compact policy-test-entry" },
          h("dt", {}, "증빙"), h("dd", {}, `${r.entry.merchant || "—"} · ${money(r.entry.amount, r.entry.currency)}`),
          h("dt", {}, "품목"), h("dd", {}, r.entry.itemsSummaryKo || "—"),
          h("dt", {}, "적요"), h("dd", {}, r.entry.memo || "—")),
        aiGatePanel(r.gate, "reviewer"),
      );
    } catch (e) {
      clear(out).append(h("p", { class: "card-error" }, errorText(e)));
    } finally {
      run.disabled = false;
    }
  });
  return h(
    "section",
    { class: "card" },
    h("div", { class: "card-head" }, h("div", { class: "card-title" }, "시험해 보기"), h("span", { class: "muted small" }, "저장 전 문장으로 기존 증빙 판정")),
    h("div", { class: "policy-test-bar" }, acc, entrySel, run),
    out,
  );
}

function historyCard() {
  const box = h("div", { class: "card-body-flush" }, h("div", { class: "card-loading" }, spinner(true)));
  api
    .get("/policies/history")
    .then(({ history }) => {
      clear(box).append(
        history.length
          ? h("table", { class: "table" },
              h("thead", {}, h("tr", {}, h("th", {}, "버전"), h("th", {}, "저장"), h("th", {}, "변경자"), h("th", {}, "바뀐 내용"))),
              h("tbody", {}, history.map((x) => {
                const b = x.before?.accounts || {};
                const a = x.after?.accounts || {};
                const changed = ACCOUNTS.filter((k) => JSON.stringify(b[k] || null) !== JSON.stringify(a[k] || null));
                const parts = [];
                if (x.before?.enabled !== x.after?.enabled) parts.push(x.after?.enabled ? "AI 검증 켬" : "AI 검증 끔");
                if (changed.length) parts.push(`${changed.join(", ")} 정책`);
                return h("tr", {}, h("td", { class: "mono" }, `v${x.version}`), h("td", { class: "mono cell-sub" }, dateTime(x.at)), h("td", {}, x.email || x.uid || "—"), h("td", { class: "cell-sub" }, parts.join(" · ") || "—"));
              })))
          : h("p", { class: "card-pad muted small" }, "아직 변경 이력이 없습니다."),
      );
    })
    .catch((e) => clear(box).append(h("p", { class: "card-error" }, errorText(e))));
  return h("section", { class: "card" }, h("div", { class: "card-head" }, h("div", { class: "card-title" }, "변경 이력")), box);
}
