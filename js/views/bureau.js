import { api } from "../api.js?v=44821c9";
import { ACCOUNTS, BRANCH, clear, confirmDialog, errorText, field, h, select, spinner, toast, updateCatalog } from "../ui.js?v=44821c9";
import { pageHeader } from "./shell.js?v=44821c9";

const control = (attrs) => h("input", { class: "input", ...attrs });
const button = (label, action, primary = false) => h("button", {
  type: "button", class: `btn ${primary ? "btn-primary" : "btn-ghost"}`, onclick: action,
}, label);

export function renderBureau(el, { me }) {
  const catalog = h("section", { class: "card" }, spinner());
  const staff = h("section", { class: "card" }, spinner());
  const canManageStaff = me.role === "imc" || me.role === "admin";
  el.append(pageHeader({ crumbs: ["본사", "설정"], title: "지국 관리" }), h("div", { class: "stack" }, catalog, canManageStaff ? staff : null));
  loadCatalog();
  if (canManageStaff) loadStaff();

  async function loadCatalog() {
    try {
      const { accounts } = await api.get("/accounts/catalog");
      updateCatalog("newyork", accounts);
      clear(catalog).append(
        h("div", { class: "card-head" }, h("h2", { class: "card-title" }, "뉴욕 기타 계정"),
          button("계정 추가", () => editCatalog(), true)),
        h("div", { class: "table-wrap" }, h("table", { class: "table" },
          h("thead", {}, h("tr", {}, h("th", {}, "계정과목"), h("th", {}, "정산서 행"), h("th", {}, "상태"), h("th", { "aria-label": "편집" }))),
          h("tbody", {}, Object.entries(accounts).filter(([name]) => !ACCOUNTS.includes(name)).map(([name, config]) =>
            h("tr", {}, h("td", { class: "cell-main" }, name), h("td", {}, config.label),
              h("td", {}, config.enabled ? "사용 중" : "사용 중지"), h("td", {}, button("편집", () => editCatalog(name, config)))))))));
    } catch (err) { clear(catalog).append(h("p", { class: "card-error" }, errorText(err))); }
  }

  async function editCatalog(name, config) {
    const nameInput = control({ type: "text", value: name || "", disabled: !!name, maxlength: "60" });
    const label = control({ type: "text", value: config?.label || "", maxlength: "60" });
    const enabled = control({ type: "checkbox" });
    enabled.checked = config?.enabled ?? true;
    if (!(await confirmDialog({
      title: name ? "정산서 항목 설정" : "뉴욕 기타 계정 추가",
      message: h("div", { class: "stack" }, field("계정과목", nameInput), field("정산서 항목명", label),
        h("label", { class: "inline-check" }, enabled, "새 업로드에 사용")),
      confirm: "저장",
    }))) return;
    try {
      await api.put("/accounts/catalog", { name: nameInput.value.trim(), label: label.value.trim(), enabled: enabled.checked });
      toast("계정과목을 저장했습니다", "ok");
      loadCatalog();
    } catch (err) { toast(errorText(err), "bad"); }
  }

  async function loadStaff() {
    try {
      const { accounts } = await api.get("/accounts/staff");
      clear(staff).append(
        h("div", { class: "card-head" }, h("h2", { class: "card-title" }, "지국 담당자 계정"),
          button("담당자 추가", addStaff, true)),
        h("div", { class: "table-wrap" }, h("table", { class: "table" },
          h("thead", {}, h("tr", {}, h("th", {}, "지국"), h("th", {}, "담당자"), h("th", {}, "상태"), h("th", { "aria-label": "계정 관리" }))),
          h("tbody", {}, accounts.map((row) => h("tr", {},
            h("td", {}, BRANCH[row.branch]), h("td", {}, h("div", { class: "cell-main" }, row.displayName || row.email),
              row.displayName ? h("div", { class: "cell-sub" }, row.email) : null),
            h("td", {}, row.disabled ? "정지" : "활성"),
            h("td", {}, h("div", { class: "bulk-actions" },
              row.disabled ? null : button("비밀번호 설정 링크", () => resetLink(row)),
              button(row.disabled ? "재활성화" : "정지", () => toggleStaff(row))))))))));
    } catch (err) { clear(staff).append(h("p", { class: "card-error" }, errorText(err))); }
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
}
