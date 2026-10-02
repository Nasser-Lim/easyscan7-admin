// 앱 셸 — 상단 헤더(SBS 컬러 로고·인쇄 시 검정 로고), 왼쪽 메뉴, 본문.
import { logout } from "../api.js";
import { ACCT, BRANCH, ROLE, h, icon } from "../ui.js";

let navLinks = [];

export function renderShell(root, me, nav) {
  const branch = me.branchId ? `${BRANCH[me.branchId] || me.branchId}지국` : "본사";
  const header = h(
    "header",
    { class: "topbar" },
    h(
      "a",
      { class: "brand", href: "#/" },
      h("img", { class: "brand-logo", src: "assets/sbs-logo.png", alt: "SBS" }),
      h("img", { class: "brand-logo-print", src: "assets/sbs-logo-b.png", alt: "SBS" }),
      h("span", { class: "brand-divider", "aria-hidden": "true" }),
      h("span", { class: "brand-name" }, "EASYSCAN"),
      h("span", { class: "brand-sub" }, "해외지국 정산관리"),
    ),
    h(
      "div",
      { class: "topbar-right" },
      h("span", { class: "branch-badge" }, h("span", { class: "branch-dot", "aria-hidden": "true" }), branch),
      h(
        "a",
        { class: "user-box", href: "#/account", title: "내 계정" },
        h("span", { class: "user-avatar", "aria-hidden": "true" }, (me.email || "?").slice(0, 1).toUpperCase()),
        h("span", { class: "user-meta" }, h("span", { class: "user-email" }, me.email || "-"), h("span", { class: "user-role" }, `${ROLE[me.role] || me.role}${me.acct ? " · " + (ACCT[me.acct] || me.acct) : ""}`)),
      ),
      h("button", { class: "btn btn-ghost btn-sm", onclick: logout, title: "로그아웃" }, icon("logout"), h("span", {}, "로그아웃")),
    ),
  );

  navLinks = nav.map((n) => h("a", { class: "nav-link", href: `#/${n.route}`, dataset: { route: n.route } }, icon(n.icon), h("span", {}, n.label)));
  const accountLink = h("a", { class: "nav-link", href: "#/account", dataset: { route: "account" } }, icon("user"), h("span", {}, "내 계정"));
  navLinks.push(accountLink);

  const side = h(
    "nav",
    { class: "sidebar", "aria-label": "메뉴" },
    nav.length ? h("div", { class: "nav-group" }, "업무") : null,
    navLinks.slice(0, -1),
    !nav.length ? h("div", { class: "nav-note" }, "이 계정의 업무 메뉴는 준비 중입니다.") : null,
    h("div", { class: "nav-group" }, "설정"),
    accountLink,
    h("div", { class: "sidebar-foot" }, h("div", {}, "EASYSCAN 관리웹"), h("div", { class: "muted" }, "SBS 보도본부 · 재무팀")),
  );

  const content = h("main", { class: "content", id: "content" });
  root.append(h("div", { class: "shell" }, header, side, content));
  return content;
}

export function setActiveNav(route) {
  navLinks.forEach((a) => a.classList.toggle("active", a.dataset.route === route));
}

export function pageHeader({ crumbs = [], title, desc, actions }) {
  return h(
    "div",
    { class: "page-head" },
    h(
      "div",
      {},
      crumbs.length ? h("div", { class: "crumbs" }, crumbs.flatMap((c, i) => (i ? [h("span", { class: "crumb-sep" }, "/"), c] : [c]))) : null,
      h("h1", { class: "page-title" }, title),
      desc ? h("p", { class: "page-desc" }, desc) : null,
    ),
    actions ? h("div", { class: "page-actions" }, actions) : null,
  );
}
