import { api } from "../api.js?v=f130322";
import { branchFlag } from "../branchicons.js?v=f130322";
import { BRANCH, chip, clear, confirmDialog, empty, errorText, field, h, icon, select, spinner, toast, updateCatalog } from "../ui.js?v=f130322";
import { pageHeader } from "./shell.js?v=f130322";

const control = (attrs) => h("input", { class: "input", ...attrs });
const button = (label, action, primary = false) => h("button", {
  type: "button", class: `btn ${primary ? "btn-primary" : "btn-ghost"}`, onclick: action,
}, label);
const removeButton = (action) => h("button", { type: "button", class: "btn btn-danger-ghost", onclick: action }, "삭제");
const catalogUrl = (branch) => `/accounts/catalog/${encodeURIComponent(branch)}`;
const accountLabel = (name, config) => config.displayName || name;

export function renderBureau(el, { me }) {
  let selectedBranch = "newyork";
  let catalogRequest = 0;
  let staffRequest = 0;
  const editable = me.cloudData !== true;
  const sourceQuery = editable ? "" : "?source=cloud";
  const catalogBody = h("div", { class: "bureau-catalog-body" });
  const branchTabs = h("div", { class: "branch-tabs", role: "group", "aria-label": "기타 계정 지국 선택" },
    Object.entries(BRANCH).map(([id, name]) => h("button", {
      type: "button", class: "branch-tab branch-name", "aria-pressed": String(id === selectedBranch),
      onclick: (e) => {
        if (selectedBranch === id) return;
        selectedBranch = id;
        for (const tab of branchTabs.children) tab.setAttribute("aria-pressed", String(tab === e.currentTarget));
        loadCatalog();
      },
    }, branchFlag(id), name)));
  const catalog = h("section", { class: "card bureau-catalog" },
    h("div", { class: "card-head bureau-catalog-head" }, h("h2", { class: "card-title" }, "기타 계정 관리"), branchTabs),
    catalogBody);
  const staffBody = h("div", {}, spinner());
  const canManageStaff = me.role === "imc" || me.role === "admin";
  const staff = canManageStaff ? h("section", { class: "card bureau-staff" },
    h("div", { class: "card-head" }, h("h2", { class: "card-title" }, "지국 담당자 계정"),
      editable ? button("담당자 추가", addStaff, true) : h("span", { class: "muted small" }, "연결된 운영 계정")),
    captureLinks(), staffBody) : null;
  el.append(pageHeader({ crumbs: editable ? ["본사", "설정"] : ["운영 클라우드 · 읽기 전용"], title: "지국 관리" }),
    h("div", { class: "stack" }, catalog, staff));
  loadCatalog();
  if (canManageStaff) loadStaff();

  async function loadCatalog() {
    const request = ++catalogRequest;
    const branch = selectedBranch;
    clear(catalogBody).append(h("div", { class: "card-loading" }, spinner()));
    try {
      const { accounts } = await api.get(catalogUrl(branch) + sourceQuery);
      if (request !== catalogRequest) return;
      drawCatalog(branch, accounts);
    } catch (err) {
      if (request !== catalogRequest) return;
      const message = err.status === 404 ? "지국별 기타 계정 관리를 지원하는 API에 연결해 주세요." : errorText(err);
      clear(catalogBody).append(h("p", { class: "card-error" }, message));
    }
  }

  function drawCatalog(branch, accounts) {
    const rows = Object.entries(accounts);
    const accountRows = rows.map(([name, config]) => h("tr", {},
      h("td", {}, h("div", { class: "cell-main" }, accountLabel(name, config)),
        h("div", { class: "cell-sub bureau-template-mobile" }, config.label)),
      h("td", { class: "bureau-template-col" }, config.label),
      h("td", {}, chip(config.enabled ? "사용 중" : "사용 중지", config.enabled ? "ok" : "muted")),
      editable ? h("td", {}, h("div", { class: "bulk-actions" },
        button("편집", () => editCatalog(branch, accounts, name)),
        removeButton(() => deleteCatalog(branch, name, config)))) : null));
    clear(catalogBody).append(
      h("div", { class: "bureau-catalog-tools" }, h("span", { class: "muted small" }, `${rows.length}개 계정`),
        editable ? button("계정 추가", () => editCatalog(branch, accounts), true) : null),
      rows.length ? h("div", { class: "table-wrap" }, h("table", { class: "table bureau-table" },
        h("thead", {}, h("tr", {}, h("th", {}, "계정과목"), h("th", { class: "bureau-template-col" }, "정산서 항목"),
          h("th", {}, "상태"), editable ? h("th", { "aria-label": "계정 관리" }) : null)),
        h("tbody", {}, accountRows)))
        : empty("등록한 기타 계정이 없습니다"));
  }

  async function refreshCatalog(branch) {
    if (selectedBranch === branch && catalog.isConnected) await loadCatalog();
    if (branch === "newyork") {
      const latest = await api.get("/accounts/catalog?branch=newyork").catch(() => null);
      if (latest) updateCatalog(latest.branch, latest.accounts);
    }
  }

  async function editCatalog(branch, accounts, name) {
    const config = name ? accounts[name] : undefined;
    const nameInput = control({ type: "text", value: config ? accountLabel(name, config) : "", required: true, maxlength: "60" });
    const label = control({ type: "text", value: config?.label || "", required: true, maxlength: "60" });
    const enabled = control({ type: "checkbox" });
    enabled.checked = config?.enabled ?? true;
    if (!(await confirmDialog({
      title: `${BRANCH[branch]} 기타 계정 ${config ? "편집" : "추가"}`,
      message: h("div", { class: "stack" }, field("계정과목", nameInput), field("정산서 항목명", label),
        h("label", { class: "inline-check" }, enabled, branch === "newyork" ? "새 업로드에 사용" : "정산 출력에 표시")),
      confirm: "저장",
      validate: () => {
        for (const input of [nameInput, label]) {
          input.setCustomValidity(input.value.trim() ? "" : "내용을 입력해 주세요.");
          if (!input.reportValidity()) return false;
        }
        if (!config && Object.hasOwn(accounts, nameInput.value.trim())) {
          nameInput.setCustomValidity("이미 등록된 계정입니다.");
          return nameInput.reportValidity();
        }
        return true;
      },
    }))) return;
    try {
      const displayName = nameInput.value.trim();
      await api.put(catalogUrl(branch), { name: name || displayName, displayName, label: label.value.trim(), enabled: enabled.checked });
      await refreshCatalog(branch);
      toast("계정과목을 저장했습니다", "ok");
    } catch (err) { toast(errorText(err), "bad"); }
  }

  async function deleteCatalog(branch, name, config) {
    if (!(await confirmDialog({
      title: "기타 계정 삭제",
      message: h("div", {}, h("p", {}, `${BRANCH[branch]}의 ‘${accountLabel(name, config)}’ 계정을 목록에서 삭제할까요?`),
        h("p", { class: "muted small" }, "기존 증빙과 정산 기록은 유지됩니다.")),
      confirm: "삭제", danger: true,
    }))) return;
    try {
      await api.del(`${catalogUrl(branch)}?name=${encodeURIComponent(name)}`);
      await refreshCatalog(branch);
      toast("기타 계정을 삭제했습니다", "ok");
    } catch (err) { toast(errorText(err), "bad"); }
  }

  async function loadStaff() {
    const request = ++staffRequest;
    clear(staffBody).append(spinner());
    try {
      const { accounts } = await api.get("/accounts/staff" + sourceQuery);
      if (request !== staffRequest) return;
      clear(staffBody).append(
        accounts.length === 0 ? empty("표시할 담당자 계정이 없습니다") :
        h("div", { class: "table-wrap" }, h("table", { class: "table bureau-table" },
          h("thead", {}, h("tr", {}, h("th", {}, "지국"), h("th", {}, "담당자"), h("th", {}, "상태"),
            editable ? h("th", { "aria-label": "계정 관리" }) : null)),
          h("tbody", {}, accounts.map((row) => h("tr", {},
            h("td", {}, h("span", { class: "branch-name" }, branchFlag(row.branch), BRANCH[row.branch])),
            h("td", {}, h("div", { class: "cell-main" }, row.displayName || row.email),
              row.displayName ? h("div", { class: "cell-sub" }, row.email) : null),
            h("td", {}, row.disabled ? "정지" : "활성"),
            editable ? h("td", {}, h("div", { class: "bulk-actions" },
              row.disabled ? null : button("비밀번호 설정 링크", () => resetLink(row)),
              button(row.disabled ? "재활성화" : "정지", () => toggleStaff(row)), removeButton(() => deleteStaff(row)))) : null))))));
    } catch (err) {
      if (request === staffRequest) clear(staffBody).append(h("p", { class: "card-error" }, errorText(err)));
    }
  }

  async function addStaff() {
    const email = control({ type: "email", autocomplete: "off" });
    const displayName = control({ type: "text", maxlength: "100" });
    const branch = select(Object.entries(BRANCH), "newyork");
    if (!(await confirmDialog({
      title: "지국 담당자 추가",
      message: h("div", { class: "stack" }, field("지국", branch), field("업무 이메일", email), field("이름", displayName)),
      confirm: "계정 추가",
    }))) return;
    try {
      const created = await api.post("/accounts/staff", { email: email.value, displayName: displayName.value, branch: branch.value });
      loadStaff();
      await resetLink(created);
    } catch (err) { toast(errorText(err), "bad"); }
  }

  async function resetLink(row) {
    try {
      const { url } = await api.post(`/accounts/staff/${row.uid}/reset-link`, {});
      const input = control({ type: "text", value: url, readonly: true, "aria-label": "비밀번호 설정 링크" });
      if (await confirmDialog({
        title: "비밀번호 설정 링크",
        message: h("div", { class: "stack" }, h("p", {}, `${row.email} 담당자에게 이 링크를 전달하세요.`), input),
        confirm: "링크 복사",
      })) {
        await navigator.clipboard.writeText(url);
        toast("링크를 복사했습니다", "ok");
      }
    } catch (err) { toast(errorText(err), "bad"); }
  }

  async function toggleStaff(row) {
    const action = row.disabled ? "재활성화" : "정지";
    if (!(await confirmDialog({ title: `담당자 계정 ${action}`, message: `${row.email} 계정을 ${action}할까요?`, confirm: action }))) return;
    try {
      await api.patch(`/accounts/staff/${row.uid}`, { disabled: !row.disabled });
      toast(`계정을 ${action}했습니다`, "ok");
      loadStaff();
    } catch (err) { toast(errorText(err), "bad"); }
  }

  async function deleteStaff(row) {
    if (!(await confirmDialog({
      title: "담당자 계정 삭제",
      message: h("div", {}, h("p", {}, `${BRANCH[row.branch]} 담당자 ${row.email || row.displayName || row.uid} 계정을 삭제할까요?`),
        h("p", { class: "muted small" }, "이 계정으로 로그인할 수 없으며, 등록한 증빙은 유지됩니다.")),
      confirm: "삭제", danger: true,
    }))) return;
    try {
      await api.del(`/accounts/staff/${encodeURIComponent(row.uid)}`);
      toast("담당자 계정을 삭제했습니다", "ok");
      loadStaff();
    } catch (err) {
      toast(errorText(err), "bad");
      if (err.status === 404) loadStaff();
    }
  }
}

function captureLinks() {
  const links = Object.entries(BRANCH).map(([id, name]) => {
    const url = new URL("https://easyscan7.vercel.app/");
    url.searchParams.set("branch", id);
    const address = control({
      type: "text", value: url.href, readonly: true, "aria-label": `${name}지국 촬영앱 주소`,
      onfocus: (event) => event.currentTarget.select(),
    });
    const copy = h("button", { class: "btn btn-ghost btn-sm", type: "button", "aria-label": `${name}지국 촬영앱 링크 복사`,
      onclick: async () => {
        try {
          await navigator.clipboard.writeText(url.href);
          toast(`${name}지국 촬영앱 링크를 복사했습니다`, "ok");
        } catch {
          address.focus();
          address.select();
          toast("주소를 선택했습니다. 복사해 주세요.", "info");
        }
      },
    }, "복사");
    return h("div", { class: "bureau-capture-link" },
      h("span", { class: "branch-name" }, branchFlag(id), `${name}지국`),
      h("div", { class: "bureau-capture-address" }, address, copy));
  });
  return h("section", { class: "bureau-capture-links", "aria-labelledby": "bureau-capture-links-title" },
    h("h3", { id: "bureau-capture-links-title", class: "card-title" }, icon("receipt"), "촬영앱 링크"),
    h("div", { class: "bureau-capture-grid" }, links));
}
