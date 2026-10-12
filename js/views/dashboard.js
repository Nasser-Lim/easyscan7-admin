// 본사 홈(대시보드) — 보도IMC팀·보도국장·재무팀이 전 지국의 지출과 한도를 한눈에 본다.
// 지국이 늘어나면 LIVE_BRANCHES 에 ID 만 추가하면 된다: 지국 선택 칩과 '지국별 비교'가 자동으로 생기고, 합계는 KRW 로 환산한다.
// 데이터는 기존 API 만 쓴다(GET /limits·/entries·/entries/queue·/fx) — 지국마다 병렬로 받아 화면에서 모은다.
import { api } from "../api.js?v=25c4b60";
import { compact, donut, gauge, limitBar, stackBar, toneOfPct, trendChart } from "../charts.js?v=25c4b60";
import { converter, fxStrip, loadFx } from "../fx.js?v=25c4b60";
import { getPeriod, periodSwitch } from "../period.js?v=25c4b60";
import { ACCOUNTS, BRANCH, clear, empty, errorText, h, icon, money, quarterLabel, spinner } from "../ui.js?v=25c4b60";
import { pageHeader } from "./shell.js?v=25c4b60";

// 지금 대시보드에 보이는 지국. 백엔드는 5개 지국(newyork·washington·paris·beijing·tokyo)을 이미 지원한다.
export const LIVE_BRANCHES = ["newyork"];

const ACC_CLS = { 취재비: "seg-a", 경상비: "seg-b", 차량유지비: "seg-c" };
const accCls = (a) => ACC_CLS[a] || "seg-d";
const STAGES = [
  { key: "draft", label: "작성중", sts: ["draft", "flagged"], cls: "stg-draft" },
  { key: "returned", label: "반려", sts: ["returned"], cls: "stg-returned" },
  { key: "imc", label: "보도IMC팀 분류", sts: ["submitted"], cls: "stg-imc" },
  { key: "chief", label: "보도국장 전결", sts: ["chief_review"], cls: "stg-chief" },
  { key: "fin", label: "재무팀 검토", sts: ["finance_review"], cls: "stg-fin" },
  { key: "done", label: "결재 완료", sts: ["approved"], cls: "stg-done" },
];
const DAY = 86400000;

let scope = "all";

export function renderDashboard(el, ctx, branches = LIVE_BRANCHES) {
  draw(el, ctx, branches);
}

function draw(el, ctx, branches) {
  clear(el);
  const quarter = getPeriod();
  const body = h("div", { class: "dash" }, h("div", { class: "card-loading" }, spinner()));
  const again = () => draw(el, ctx, branches);
  if (scope !== "all" && !branches.includes(scope)) scope = "all";

  el.append(
    pageHeader({
      crumbs: ["본사"],
      title: "홈",
      desc: `${quarterLabel(quarter)} 지출과 한도 현황 · ${branches.length === 1 ? `${BRANCH[branches[0]] || branches[0]}지국` : `${branches.length}개 지국`}`,
      actions: [periodSwitch(again), h("button", { class: "btn btn-ghost", type: "button", onclick: again }, icon("refresh"), h("span", {}, "새로고침"))],
    }),
    body,
  );
  load(quarter, branches).then(
    (data) => paint(body, data, ctx, again),
    (e) => clear(body).append(h("p", { class: "card-error" }, errorText(e))),
  );
}

async function load(quarter, branches) {
  const q = encodeURIComponent(quarter);
  const [fx, queue, ...per] = await Promise.all([
    loadFx(),
    api.get("/entries/queue").catch(() => ({ entries: [] })),
    ...branches.map(async (id) => {
      try {
        const [u, e] = await Promise.all([api.get(`/limits?quarter=${q}&branch=${id}`), api.get(`/entries?quarter=${q}&branch=${id}`)]);
        return { id, name: BRANCH[id] || id, currency: u.currency, usage: u, entries: e.entries || [] };
      } catch (err) {
        return { id, name: BRANCH[id] || id, error: errorText(err) };
      }
    }),
  ]);
  return { quarter, fx, queue: queue.entries || [], branches: per };
}

// ── 집계 ─────────────────────────────────────────────
function aggregate(data, sel) {
  const cur = sel.length === 1 ? sel[0].currency : "KRW";
  const conv = converter(data.fx, cur);
  let skipped = 0;
  let converted = sel.some((b) => b.currency !== cur);
  const cv = (amt, from) => {
    const v = conv(amt, from || "USD");
    if (v === null) {
      skipped++;
      return 0;
    }
    if ((from || "USD") !== cur) converted = true;
    return v;
  };
  const accounts = {};
  let count = 0;
  for (const b of sel) {
    for (const [acc, st] of Object.entries(b.usage.accounts || {})) {
      const a = (accounts[acc] ||= { used: 0, limit: 0, inel: 0, count: 0 });
      a.used += cv(st.used, b.currency);
      a.limit += cv(st.limit, b.currency);
      a.inel += cv(st.ineligible, b.currency);
      a.count += st.count || 0;
      count += st.count || 0;
    }
  }
  const sum = (k) => Object.values(accounts).reduce((x, a) => x + a[k], 0);
  const entries = sel.flatMap((b) => b.entries.map((e) => ({ ...e, branchName: b.name })));
  const live = entries.filter((e) => !["rejected", "deleted"].includes(e.status));
  return { cur, cv, skipped: () => skipped, converted: () => converted, accounts, count, used: sum("used"), limit: sum("limit"), inel: sum("inel"), entries, live };
}

const lastAt = (e) => {
  const t = Date.parse((e.approvals || []).at(-1)?.at || e.updatedAt || e.createdAt || "");
  return Number.isNaN(t) ? null : t;
};

function quarterRange(q) {
  const [y, n] = q.split("Q").map(Number);
  const start = Date.UTC(y, (n - 1) * 3, 1);
  const end = Date.UTC(y, n * 3, 1);
  return { start, days: Math.round((end - start) / DAY), months: [0, 1, 2].map((i) => ({ day: Math.round((Date.UTC(y, (n - 1) * 3 + i, 1) - start) / DAY), label: `${(n - 1) * 3 + i + 1}월` })) };
}

// ── 그리기 ────────────────────────────────────────────
function paint(root, data, ctx, again) {
  clear(root);
  const ok = data.branches.filter((b) => !b.error);
  const bad = data.branches.filter((b) => b.error);
  if (!ok.length) {
    root.append(h("p", { class: "card-error" }, bad[0]?.error || "데이터를 불러오지 못했습니다."));
    return;
  }
  const many = data.branches.length > 1;
  const view = () => {
    const sel = ok.filter((b) => scope === "all" || b.id === scope);
    return aggregate(data, sel.length ? sel : ok);
  };

  const chips = many ? scopeChips(data.branches, () => repaint()) : null;
  const holder = h("div", { class: "dash-body" });
  root.append(...[chips, bad.length ? h("p", { class: "card-error dash-warn" }, `${bad.map((b) => b.name).join(", ")} 지국 데이터를 불러오지 못했습니다 — ${bad[0].error}`) : null, holder].filter(Boolean));

  function repaint() {
    chips?.sync();
    const a = view();
    clear(holder).append(...sections(data, a, ok, ctx, many).filter(Boolean));
  }
  repaint();
}

function scopeChips(branches, onChange) {
  const defs = [["all", "전체 지국"], ...branches.map((b) => [b.id, b.name])];
  const btns = defs.map(([id, label]) => {
    const b = h("button", { type: "button", class: "scope-chip", dataset: { id } }, label);
    b.addEventListener("click", () => {
      scope = id;
      onChange();
    });
    return b;
  });
  const node = h("div", { class: "scope-chips", role: "group", "aria-label": "지국 선택" }, btns);
  node.sync = () => btns.forEach((b) => b.classList.toggle("on", b.dataset.id === scope));
  node.sync();
  return node;
}

function sections(data, a, ok, ctx, many) {
  const { cur } = a;
  const pct = a.limit > 0 ? (a.used / a.limit) * 100 : 0;
  const note = a.converted() ? "환산 포함 · 참고용" : "";
  const queue = data.queue;
  const oldest = queue.map(lastAt).filter(Boolean).sort((x, y) => x - y)[0];
  const waitDays = oldest ? Math.floor((Date.now() - oldest) / DAY) : 0;
  const inReview = a.live.filter((e) => ["submitted", "chief_review", "finance_review"].includes(e.status));
  const sumOf = (rows) => rows.reduce((x, e) => x + a.cv(e.amount, e.currency), 0);

  // 1) 핵심 지표
  const fxBar = fxStrip();
  fxBar.node.classList.add("fx-strip-card");
  fxBar.paint(data.fx, [...new Set([cur, ...ok.map((b) => b.currency)])], a.skipped() ? `환율 미확인 ${a.skipped()}건 제외` : "");
  const kpis = h(
    "div",
    { class: "kpis" },
    kpi("총 지출", money(a.used, cur), `${a.count}건${note ? ` · ${note}` : ""}`, "neutral"),
    kpi("결재 진행", `${inReview.length}건`, `${money(sumOf(inReview), cur)} · 보도IMC→국장→재무`, "info"),
    kpi("한도 초과 비적격", money(a.inel, cur), a.inel > 0 ? "초과분은 비적격 처리" : "초과 없음", a.inel > 0 ? "bad" : "ok"),
    kpi("내 결재 대기", `${queue.length}건`, queue.length ? (waitDays >= 1 ? `가장 오래된 건 ${waitDays}일째` : "오늘 올라온 건 포함") : "처리할 결재가 없습니다", queue.length ? "warn" : "ok", () => ctx.go("inbox")),
  );

  // 2) 한도 소진: 게이지 + 계정별 막대
  const accRows = Object.entries(a.accounts).filter(([, v]) => v.limit > 0).sort((x, y) => ACCOUNTS.indexOf(x[0]) - ACCOUNTS.indexOf(y[0]));
  const limitCard = card(
    "분기 한도 소진",
    h("span", { class: "card-meta" }, a.limit > 0 ? `한도 ${money(a.limit, cur)}` : "한도 없음"),
    h(
      "div",
      { class: "dash-limit" },
      a.limit > 0 ? gauge(pct) : h("p", { class: "muted small" }, "설정된 분기 한도가 없습니다."),
      h(
        "ul",
        { class: "lb-list" },
        accRows.map(([acc, v]) => {
          const p = (v.used / v.limit) * 100;
          return h(
            "li",
            {},
            h("div", { class: "lb-head" }, h("span", { class: "lb-name" }, h("i", { class: `dot ${accCls(acc)}` }), acc), h("span", { class: `lb-pct tone-text-${toneOfPct(p)}` }, `${p.toFixed(0)}%`)),
            limitBar(p),
            h("div", { class: "lb-foot" }, h("span", {}, `${compact(v.used, cur)} / ${compact(v.limit, cur)}`), v.inel > 0 ? h("span", { class: "text-bad" }, `비적격 ${compact(v.inel, cur)}`) : h("span", { class: "muted" }, `${v.count}건`)),
          );
        }),
      ),
    ),
    "dash-c5",
  );

  // 3) 누적 추이
  const rg = quarterRange(data.quarter);
  const today = Math.floor((Date.now() - rg.start) / DAY);
  const inQuarter = today >= 0 && today < rg.days;
  const lastDay = Math.min(inQuarter ? today : rg.days - 1, rg.days - 1);
  const perDay = new Array(rg.days).fill(0);
  for (const e of a.live) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(e.txnDate || "");
    if (!m) continue;
    const d = Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - rg.start) / DAY);
    if (d >= 0 && d < rg.days) perDay[d] += a.cv(e.amount, e.currency);
  }
  const points = [];
  let run = 0;
  for (let d = 0; d <= lastDay; d++) points.push((run += perDay[d]));
  const trendCard = card(
    "누적 지출 추이",
    h("span", { class: "card-meta trend-legend" }, h("span", { class: "lg-line" }, "누적 지출"), h("span", { class: "lg-pace" }, "균등 소진"), h("span", { class: "lg-limit" }, "한도")),
    run > 0 || a.limit > 0 ? trendChart({ days: rg.days, points, limit: a.limit, today: inQuarter ? today : null, months: rg.months, cur }) : empty("지출이 없습니다", "증빙이 올라오면 날짜별 누적이 그려집니다."),
    "dash-c7",
  );

  // 4) 결재 현황
  const stageRows = STAGES.map((s) => ({ ...s, rows: a.live.filter((e) => s.sts.includes(e.status)) }));
  const pipeline = card(
    "결재 단계별 현황",
    h("span", { class: "card-meta" }, `${a.live.length}건`),
    h(
      "div",
      {},
      stackBar(stageRows.map((s) => ({ label: s.label, n: s.rows.length, cls: s.cls }))),
      h(
        "ul",
        { class: "stage-list" },
        stageRows.map((s) => h("li", {}, h("i", { class: `dot ${s.cls}` }), h("span", { class: "stage-name" }, s.label), h("span", { class: "stage-n" }, `${s.rows.length}건`), h("span", { class: "stage-amt" }, s.rows.length ? compact(sumOf(s.rows), cur) : "—"))),
      ),
    ),
    "dash-c4",
  );

  // 5) 계정별 구성
  const bySpend = Object.entries(a.accounts).map(([acc, v]) => ({ label: acc, value: v.used, cls: accCls(acc) })).sort((x, y) => y.value - x.value);
  const mix = card(
    "계정별 구성",
    h("span", { class: "card-meta" }, "사용액 기준"),
    bySpend.some((x) => x.value > 0)
      ? h(
          "div",
          { class: "mix" },
          donut(bySpend, { center: compact(a.used, cur), sub: "총 지출" }),
          h("ul", { class: "mix-list" }, bySpend.map((x) => h("li", {}, h("i", { class: `dot ${x.cls}` }), h("span", {}, x.label), h("b", {}, a.used > 0 ? `${((x.value / a.used) * 100).toFixed(0)}%` : "—")))),
        )
      : empty("지출이 없습니다"),
    "dash-c4",
  );

  // 6) 확인 필요
  const items = [];
  for (const [acc, v] of accRows) {
    const p = (v.used / v.limit) * 100;
    if (p > 100) items.push({ tone: "bad", text: `${acc} 한도 초과 — 비적격 ${money(v.inel, cur)}`, go: "entries" });
    else if (p >= 80) items.push({ tone: "warn", text: `${acc} 한도 ${p.toFixed(0)}% 소진`, go: "entries" });
  }
  const returned = a.live.filter((e) => e.status === "returned").length;
  if (returned) items.push({ tone: "warn", text: `반려 ${returned}건 — 지국 수정 대기`, go: "entries" });
  const override = a.live.filter((e) => e.status === "submitted" && e.aiGate?.override).length;
  if (override) items.push({ tone: "warn", text: `AI 위반 소명 ${override}건 — 사람 판단 필요`, go: "inbox" });
  const stale = inReview.filter((e) => lastAt(e) && Date.now() - lastAt(e) > 3 * DAY).length;
  if (stale) items.push({ tone: "warn", text: `결재 3일 넘게 대기 ${stale}건`, go: "inbox" });
  const attention = card(
    "확인 필요",
    h("span", { class: `card-meta ${items.length ? "text-warn" : "text-ok"}` }, items.length ? `${items.length}건` : "이상 없음"),
    items.length
      ? h("ul", { class: "attn" }, items.map((i) => h("li", { class: `attn-${i.tone}`, onclick: () => ctx.go(i.go) }, icon("alert"), h("span", {}, i.text), icon("chevron"))))
      : h("div", { class: "attn-ok" }, icon("check"), h("span", {}, "한도·결재 모두 정상입니다.")),
    "dash-c4",
  );

  // 7) 지국별 비교 — 지국이 둘 이상일 때만
  const compare = many ? branchCompare(data, ok, a) : null;

  return [fxBar.node, kpis, h("div", { class: "dash-grid" }, [compare, limitCard, trendCard, pipeline, mix, attention])];
}

function branchCompare(data, ok, a) {
  const rows = ok.map((b) => {
    let used = 0;
    let limit = 0;
    for (const st of Object.values(b.usage.accounts || {})) {
      used += st.used || 0;
      limit += st.limit || 0;
    }
    return { b, used, limit, p: limit > 0 ? (used / limit) * 100 : 0, krw: a.cv ? converter(data.fx, "KRW")(used, b.currency) : null };
  });
  return card(
    "지국별 비교",
    h("span", { class: "card-meta" }, "한도 사용률"),
    h(
      "ul",
      { class: "cmp" },
      rows.sort((x, y) => y.p - x.p).map((r) =>
        h("li", {}, h("span", { class: "cmp-name" }, r.b.name), limitBar(r.p), h("span", { class: `cmp-pct tone-text-${toneOfPct(r.p)}` }, r.limit > 0 ? `${r.p.toFixed(0)}%` : "—"), h("span", { class: "cmp-amt" }, `${compact(r.used, r.b.currency)}${r.limit > 0 ? ` / ${compact(r.limit, r.b.currency)}` : ""}`)),
      ),
    ),
    "dash-c12",
  );
}

function card(title, meta, content, cls = "") {
  return h("section", { class: `card dash-card ${cls}` }, h("div", { class: "card-head" }, h("div", { class: "card-title" }, title), meta), content);
}

function kpi(label, value, sub, tone, onclick) {
  return h(
    onclick ? "button" : "div",
    { class: `kpi kpi-${tone}${onclick ? " kpi-link" : ""}`, onclick, type: onclick ? "button" : null },
    h("div", { class: "kpi-label" }, label),
    h("div", { class: "kpi-value" }, value),
    h("div", { class: "kpi-sub" }, sub),
  );
}
