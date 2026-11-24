import { api, passwordSetupUrl } from "../api.js?v=b8fd816";
import { branchFlag } from "../branchicons.js?v=b8fd816";
import { estimateTokenCost, GEMINI_PRICING_URL } from "../usage-cost.js?v=b8fd816";
import { BRANCH, ROLE, chip, clear, confirmDialog, dateTime, empty, errorText, field, h, icon, select, spinner, toast } from "../ui.js?v=b8fd816";
import { pageHeader } from "./shell.js?v=b8fd816";

const kindLabel = { recognition: "증빙 판독", policy: "적격 판정", policy_test: "정책 테스트" };
const kindIcon = { recognition: "receipt", policy: "shield", policy_test: "search" };
const number = new Intl.NumberFormat("ko-KR");
const asNumber = (n) => number.format(n || 0);
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 4 });
const formatCost = (value) => value === null ? "—" : value > 0 && value < .0001 ? "<$0.0001" : usd.format(value);
const button = (label, action, tone = "ghost") => h("button", {
  type: "button", class: `btn btn-${tone} btn-sm`, onclick: action,
}, label);
const roleLabel = (record) => record.master ? "통합관리 마스터" : ROLE[record.role] || record.role;
const input = (attrs) => h("input", { class: "input", ...attrs });
const currentMonth = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit" }).format(new Date());
const loading = () => h("div", { class: "card-loading" }, spinner());

export function renderMaster(el, { me, query }) {
  const panel = h("div", { class: "stack master-panel" });
  const tabs = h("div", { class: "branch-tabs master-tabs", role: "group", "aria-label": "통합관리 메뉴" });
  const selected = query.get("tab") === "accounts" ? "accounts" : "usage";
  for (const [id, label] of [["usage", "AI 사용량"], ["accounts", "계정·권한"]]) {
    tabs.append(h("a", { class: "branch-tab master-tab", href: `#/master?tab=${id}`,
      "aria-current": id === selected ? "page" : null }, label));
  }
  el.append(pageHeader({ title: "통합관리", crumbs: ["본사"], actions: [tabs] }), panel);
  if (selected === "accounts") renderUsers(panel, me);
  else renderUsage(panel, me);
}

function renderUsers(panel, me) {
  const card = h("section", { class: "card master-users" }, loading());
  panel.append(card);
  if (me.cloudData) panel.append(linkedCloudUsers());
  let request = 0;
  let current;
  let roleFilter = "";
  let query = "";
  load();

  async function load() {
    const revision = ++request;
    clear(card).append(loading());
    try {
      const result = await api.get("/master/users");
      if (revision !== request) return;
      current = result;
      draw();
    } catch (err) {
      if (revision === request) clear(card).append(h("p", { class: "card-error" }, errorText(err)));
    }
  }

  function draw() {
    const { roles, branches, users } = current;
    const filter = select([["", "전체 역할"], ...roles.map((r) => [r, ROLE[r]]), ["admin", "관리자"]], roleFilter,
      { class: "input input-sm", "aria-label": "계정 역할" });
    const search = input({ type: "search", class: "input input-sm", value: query, placeholder: "이름 또는 이메일", "aria-label": "계정 검색" });
    const body = h("div", { class: "master-user-list" });
    filter.addEventListener("change", () => { roleFilter = filter.value; list(); });
    search.addEventListener("input", () => { query = search.value; list(); });

    function list() {
      const term = query.trim().toLowerCase();
      const visible = users.filter((u) => (!roleFilter || u.role === roleFilter) &&
        (!term || `${u.displayName || ""} ${u.email || ""} ${branches[u.branchId] || ""}`.toLowerCase().includes(term)));
      clear(body).append(userList(visible, branches, (u) => u.editable ? [
        u.email && !u.disabled ? button("설정 링크", () => resetLink(u)) : null,
        button("편집", () => edit(u)),
        button("계정 삭제", (event) => removeUser(u, event.currentTarget), "danger"),
      ] : h("span", { class: "muted small" }, "보호됨")));
    }
    clear(card).append(
      h("div", { class: "card-head" }, h("h2", { class: "card-title" }, "계정·권한"),
        button("계정 추가", () => edit(), "primary")),
      h("div", { class: "master-controls" }, filter, search,
        me.cloudData ? chip("테스트 환경", "muted") : null,
        h("span", { class: "muted small" }, `전체 ${users.length}개 · 활성 ${users.filter((u) => !u.disabled).length}개`)),
      body);
    list();
  }

  async function edit(user) {
    const { roles, branches } = current;
    const email = input({ type: "email", required: true, maxlength: 254, autocomplete: "off" });
    const name = input({ type: "text", value: user?.displayName || "", maxlength: 100 });
    const role = select(roles.map((r) => [r, ROLE[r]]), user?.role || "staff", { "aria-label": "역할" });
    const branch = select(Object.entries(branches), user?.branchId || Object.keys(branches)[0], { "aria-label": "담당 지국" });
    const branchField = field("담당 지국", branch);
    branchField.classList.add("master-branch-field");
    const disabled = h("input", { type: "checkbox", checked: user?.disabled });
    const refreshBranch = () => { branchField.hidden = role.value !== "staff"; };
    role.addEventListener("change", refreshBranch);
    refreshBranch();
    if (!(await confirmDialog({
      title: user ? "계정 설정" : "계정 발급",
      message: h("div", { class: "stack" },
        user ? h("div", {}, h("strong", {}, user.email || user.uid),
          user.lastSignIn ? h("div", { class: "muted small" }, `최근 로그인 ${dateTime(user.lastSignIn)}`) : null)
          : field("업무 이메일", email),
        field("이름", name), field("역할", role), branchField,
        h("label", { class: "inline-check" }, disabled, "로그인 정지")),
      confirm: "저장",
      validate: () => user || email.reportValidity(),
    }))) return;
    const data = { role: role.value, branchId: role.value === "staff" ? branch.value : null,
      displayName: name.value.trim(), disabled: disabled.checked };
    if (user && (user.role !== data.role || (user.branchId || null) !== data.branchId || user.disabled !== data.disabled) &&
        !(await confirmDialog({
          title: "권한 및 상태 변경",
          message: `${user.email || user.displayName} · ${ROLE[data.role]}${data.branchId ? ` · ${branches[data.branchId]}` : ""} · ${data.disabled ? "정지" : "활성"}`,
          confirm: "변경",
        }))) return;
    try {
      if (user) await api.patch(`/master/users/${encodeURIComponent(user.uid)}`, data);
      else await api.post("/master/users", { ...data, email: email.value.trim() });
      await load();
      toast("계정 설정을 저장했습니다", "ok");
    } catch (err) {
      toast(errorText(err), "bad");
      await load();
    }
  }

  async function removeUser(user, trigger) {
    trigger.disabled = true;
    try {
      if (!(await confirmDialog({
        title: "계정 삭제",
        message: h("div", {},
          h("p", {}, h("strong", {}, user.email || user.displayName || user.uid), ` · ${roleLabel(user)}`),
          h("p", {}, me.cloudData ? "테스트 환경의 로그인 계정을 영구 삭제합니다." : "로그인 계정을 영구 삭제합니다."),
          h("p", { class: "muted small" }, "등록한 증빙과 결재 이력은 보존됩니다.")),
        confirm: "삭제", danger: true,
      }))) return;
      await api.del(`/master/users/${encodeURIComponent(user.uid)}`);
      await load();
      toast("계정을 삭제했습니다", "ok");
    } catch (err) {
      toast(errorText(err), "bad");
      if (err.status === 404) await load();
    } finally {
      trigger.disabled = false;
    }
  }

  async function resetLink(user) {
    try {
      const { url } = await api.post(`/master/users/${encodeURIComponent(user.uid)}/reset-link`, {});
      const setup = passwordSetupUrl(url);
      const link = input({ type: "text", value: setup, readonly: true, "aria-label": "비밀번호 설정 링크" });
      if (await confirmDialog({ title: "비밀번호 설정 링크", message: h("div", { class: "stack" },
        h("p", {}, `${user.email} 담당자에게 전달할 링크입니다.`), link), confirm: "복사" })) {
        await navigator.clipboard.writeText(setup);
        toast("링크를 복사했습니다", "ok");
      }
    } catch (err) { toast(errorText(err), "bad"); }
  }
}

function userList(users, branches, actions) {
  return users.length ? h("ul", { class: "master-list" }, users.map((u) =>
    h("li", { class: "master-user" },
      h("div", { class: "master-identity" }, h("strong", {}, u.displayName || u.email || "이름 없음"),
        u.displayName && u.email ? h("span", { class: "muted small" }, u.email) : null),
      h("div", { class: "master-user-role" }, h("strong", {}, roleLabel(u)),
        u.branchId ? h("span", { class: "muted small" }, branches[u.branchId] || u.branchId) : null),
      chip(u.disabled ? "정지" : "활성", u.disabled ? "muted" : "ok"),
      actions ? h("div", { class: "bulk-actions" }, actions(u)) : null,
    ))) : empty("표시할 계정이 없습니다");
}

function linkedCloudUsers() {
  const body = h("div", { class: "master-user-list" });
  const details = h("details", { class: "card master-users" },
    h("summary", { class: "card-title" }, "연결된 운영 계정", " · ", h("span", { class: "muted small" }, "읽기 전용")),
    body);
  let started = false;
  details.addEventListener("toggle", async () => {
    if (!details.open || started) return;
    started = true;
    clear(body).append(loading());
    try {
      const { users, branches } = await api.get("/master/users?source=cloud");
      clear(body).append(userList(users, branches));
    } catch (err) {
      started = false;
      clear(body).append(h("p", { class: "card-error" }, errorText(err)));
    }
  });
  return details;
}

function renderUsage(panel, me) {
  const month = input({ type: "month", value: currentMonth(), required: true, "aria-label": "사용량 집계 월" });
  const cloud = me.cloudData === true;
  const content = h("div", { class: "stack" });
  const card = h("section", { class: "card master-usage" },
    h("div", { class: "card-head master-usage-head" }, h("h2", { class: "card-title" }, "AI 토큰 사용량"),
      h("div", { class: "master-usage-controls" }, month)), content);
  month.title = "한국시간 기준";
  panel.append(card);
  let request = 0;
  month.addEventListener("change", () => { if (month.value) load(); });
  load();

  async function load() {
    clear(content).append(loading());
    const id = ++request;
    try {
      const data = await api.get(`/master/ai-usage/${encodeURIComponent(month.value)}${cloud ? "?source=cloud" : ""}`);
      if (id === request) draw(data);
    } catch (err) {
      if (id === request) clear(content).append(h("p", { class: "card-error" }, errorText(err)));
    }
  }

  function draw(data) {
    const { totals, targetTokens, rows } = data;
    const cost = estimateTokenCost(rows, data.month);
    const unpriced = Math.max(0, totals.runs - cost.covered);
    const total = totals.totalTokens;
    const measured = totals.measured > 0;
    const quota = measured && targetTokens ? Math.floor(total / targetTokens * 100) : null;
    const breakdown = [
      ["입력", totals.inputTokens, "input"], ["출력", totals.outputTokens, "output"], ["추론", totals.thinkingTokens, "thinking"],
    ];
    const otherTokens = total - totals.inputTokens - totals.outputTokens - totals.thinkingTokens;
    if (otherTokens > 0) breakdown.push(["기타", otherTokens, "other"]);
    const hero = h("section", { class: "master-usage-hero", "aria-label": "AI 토큰 현황" },
      h("div", { class: "master-usage-total" }, h("span", {}, "전체 토큰"),
        h("strong", { class: "mono" }, measured ? asNumber(total) : "—"),
        h("small", {}, `처리 ${asNumber(totals.runs)}건 · 토큰 기록 ${asNumber(totals.measured)}건`,
          totals.errors ? ` · 오류 ${asNumber(totals.errors)}건` : ""),
        h("div", { class: "master-cost", "aria-label": "추정 토큰 비용" },
          h("span", {}, "추정 토큰 비용"), h("strong", { class: "mono" }, formatCost(cost.amount))),
        unpriced || cost.remainder ? h("small", {}, [
          unpriced ? `${asNumber(unpriced)}건 비용 미산정` : null,
          cost.remainder ? `${asNumber(cost.remainder)} 토큰 유형 미기록` : null,
        ].filter(Boolean).join(" · ")) : null),
      h("div", { class: "master-target" },
        h("div", { class: "master-target-head" }, h("strong", {}, "월간 모니터링 목표"),
          button("목표 설정", () => editTarget(data))),
        targetTokens ? h("div", { class: "master-target-body" },
          h("div", { class: "master-target-meta" }, h("span", {}, `${asNumber(targetTokens)} 토큰`),
            h("strong", { class: quota >= 100 ? "master-over-target" : "" }, quota === null ? "—" : `${asNumber(quota)}%`)),
          usageProgress("월간 모니터링 목표", total, targetTokens, quota >= 100 ? "over" : "target",
            quota === null ? "토큰 기록 없음" : `${asNumber(quota)}% 사용`),
          quota >= 100 ? chip("목표 도달", "warn") : null) : h("div", { class: "master-target-meta" }, "목표 미설정")),
      h("dl", { class: "master-usage-summary" }, breakdown.map(([label, value, tone]) =>
        h("div", { class: "master-meter" }, h("dt", {}, label),
          h("dd", { class: "mono" }, measured ? asNumber(value) : "—"),
          usageProgress(label, value, Math.max(total, value), tone)))));
    const charts = h("div", { class: "master-usage-charts" },
      usageChart("지국별 사용량", usageBreakdown(rows, "branchId", BRANCH, "지국 미기록"), total, measured, branchFlag),
      usageChart("작업별 사용량", usageBreakdown(rows, "kind", kindLabel, "기타 작업"), total, measured, (id) => icon(kindIcon[id] || "file")));
    const pricing = h("details", { class: "master-usage-details master-cost-rates" },
      h("summary", {}, icon("info"), "비용 산정 기준", icon("chevron", "ic master-usage-arrow")),
      h("div", { class: "master-cost-rates-body" },
        h("p", {}, "기록된 토큰에 표준 유료 단가를 적용했습니다. 출력 단가에는 기록된 추론 토큰도 포함되며, 무료 사용량·크레딧·캐시 할인·세금은 반영하지 않습니다."),
        cost.models.size ? h("ul", {}, [...cost.models].map(([model, rates]) =>
          h("li", {}, h("b", {}, model), ` · 입력 ${usd.format(rates.input)} / 출력 ${usd.format(rates.output)}`))) : null,
        cost.models.size ? h("p", {}, "토큰 100만 개당 USD") : null,
        h("a", { href: GEMINI_PRICING_URL, target: "_blank", rel: "noopener noreferrer" }, "Google 공식 요금표")));
    const details = rows.length ? h("details", { class: "master-usage-details" },
      h("summary", {}, icon("list"), "지국·모델별 상세 내역", icon("chevron", "ic master-usage-arrow")),
      h("div", { class: "table-wrap" }, h("table", { class: "table master-usage-table" },
        h("thead", {}, h("tr", {}, h("th", {}, "지국 · 모델"), h("th", {}, "작업"), h("th", { class: "num" }, "처리"),
          h("th", { class: "num" }, "전체 토큰"), h("th", { class: "num" }, "추정 비용"))),
        h("tbody", {}, rows.map((row, index) => h("tr", {},
          h("td", {}, h("div", { class: "cell-main" }, BRANCH[row.branchId] || "지국 미기록"), h("div", { class: "cell-sub" }, row.model)),
          h("td", {}, kindLabel[row.kind] || row.kind), h("td", { class: "num" }, asNumber(row.runs)),
          h("td", { class: "num strong" }, row.measured ? asNumber(row.totalTokens) : "—"),
          h("td", { class: "num" }, formatCost(cost.rowCosts[index])))))))) : null;
    const sections = [
      hero,
      measured ? null : h("p", { class: "muted small master-usage-note" }, "이 달의 토큰 기록이 없습니다."),
      charts,
      details,
      pricing,
    ];
    clear(content).append(...sections.filter(Boolean));
  }

  async function editTarget(data) {
    const target = input({ type: "number", min: 0, max: 10 ** 12, step: 1, value: data.targetTokens,
      required: true, "aria-label": "월간 모니터링 목표" });
    if (!(await confirmDialog({
      title: `${data.month} AI 토큰 목표`,
      message: field("월간 모니터링 목표", target, "0은 목표 없음입니다. 목표를 넘겨도 AI 작업은 계속됩니다."),
      confirm: "저장",
      validate: () => target.reportValidity(),
    }))) return;
    try {
      await api.put(`/master/ai-usage/${encodeURIComponent(data.month)}/target`, { tokens: target.valueAsNumber });
      if (data.month === month.value) await load();
      toast("토큰 목표를 저장했습니다", "ok");
    } catch (err) { toast(errorText(err), "bad"); }
  }
}

function usageBreakdown(rows, key, labels, fallback) {
  const buckets = new Map(Object.entries(labels).map(([id, label]) => [id, { id, label, value: 0 }]));
  for (const row of rows) {
    const bucket = buckets.get(row[key]) || buckets.get(null) || { id: null, label: fallback, value: 0 };
    bucket.value += row.totalTokens;
    buckets.set(bucket.id, bucket);
  }
  return [...buckets.values()].sort((a, b) => b.value - a.value);
}

function usageProgress(label, value, total, tone, description = `${asNumber(value)} 토큰`) {
  return h("progress", { class: `master-usage-bar master-bar-${tone}`, value: Math.min(value, total), max: total || 1,
    "aria-label": label, "aria-valuetext": description });
}

function usageChart(title, values, total, measured, marker) {
  return h("section", { class: "master-usage-chart" },
    h("h3", {}, title),
    h("ul", {}, values.map(({ id, label, value }) => h("li", {},
      h("div", { class: "master-chart-label" }, h("span", { class: "master-chart-name" }, marker(id), label),
        h("strong", { class: "mono" }, measured ? asNumber(value) : "—")),
      usageProgress(label, value, total, "rank", measured ? `${asNumber(value)} 토큰` : "토큰 기록 없음")))));
}
