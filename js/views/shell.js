// 앱 셸 — 상단 헤더(SBS EASY SCAN 로고), 왼쪽 메뉴, 본문.
import { logout } from "../api.js?v=49218f7";
import { ACCT, BRANCH, ROLE, h, icon, tip } from "../ui.js?v=49218f7";
import { BUILD, VERSION } from "../version.js?v=49218f7";

let navLinks = [];
let activeIcon = "home";
let mobileMore;

export function renderShell(root, me, nav) {
  const branch = me.branchId ? `${BRANCH[me.branchId] || me.branchId}지국` : "본사";
  const accountType = me.acct === "personal" ? null : ACCT[me.acct] || me.acct;
  const userRole = [me.master === true ? "통합관리 마스터" : ROLE[me.role] || me.role, accountType].filter(Boolean).join(" · ");
  const header = h(
    "header",
    { class: "topbar" },
    h(
      "a",
      { class: "brand", href: "#/" },
      h("img", { class: "brand-logo", src: "assets/sbs-easyscan.png", alt: "SBS EASY SCAN", width: 735, height: 110 }),
      h("img", { class: "brand-logo-print", src: "assets/sbs-easyscan-b.png", alt: "SBS EASY SCAN", width: 735, height: 110 }),
      h("span", { class: "brand-divider", "aria-hidden": "true" }),
      h("span", { class: "brand-name" }, "해외지국 AI 정산관리"),
    ),
    h(
      "div",
      { class: "topbar-right" },
      h("span", { class: "branch-badge" }, icon("pin"), branch),
      h(
        "a",
        { class: "user-box", href: "#/account", title: "내 계정" },
        h("span", { class: "user-avatar", "aria-hidden": "true" }, (me.email || "?").slice(0, 1).toUpperCase()),
        h("span", { class: "user-meta" }, h("span", { class: "user-email" }, me.email || "-"), h("span", { class: "user-role" }, userRole)),
      ),
      h("button", { class: "btn btn-ghost btn-sm topbar-logout", type: "button", onclick: logout, title: "로그아웃", "aria-label": "로그아웃" }, icon("logout")),
    ),
  );

  const workLinks = nav.map((n) => h("a", { class: "nav-link", href: `#/${n.route}`, dataset: { route: n.route, icon: n.icon } }, icon(n.icon), h("span", {}, n.label)));
  const accountLink = h("a", { class: "nav-link", href: "#/account", dataset: { route: "account", icon: "user" } }, icon("user"), h("span", {}, "내 계정"));
  const helpLink = h("a", { class: "nav-link", href: "#/help", dataset: { route: "help", icon: "info" } }, icon("info"), h("span", {}, "도움말"));
  const shortLabels = { upload: "업로드", entries: "증빙", settle: "정산", policy: "AI 정책" };
  const mobileLink = (item, short = false) => h("a", { class: "mobile-nav-link", href: `#/${item.route}`, dataset: { route: item.route }, "aria-label": item.label },
    icon(item.icon), h("span", {}, (short && shortLabels[item.route]) || item.label));
  const primary = nav.slice(0, 4).map((item) => mobileLink(item, true));
  const secondary = [...nav.slice(4), { route: "account", label: "내 계정", icon: "user" }, { route: "help", label: "도움말", icon: "info" }].map((item) => mobileLink(item));
  mobileMore = h("details", { class: "mobile-more" },
    h("summary", { class: "mobile-nav-link" }, icon("more"), h("span", {}, "더보기")),
    h("div", { class: "mobile-more-panel" }, secondary));
  secondary.forEach((link) => link.addEventListener("click", () => { mobileMore.open = false; }));
  mobileMore.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && mobileMore.open) {
      mobileMore.open = false;
      mobileMore.firstElementChild.focus();
    }
  });
  navLinks = [...workLinks, accountLink, helpLink, ...primary, ...secondary];

  const side = h(
    "nav",
    { class: "sidebar", "aria-label": "메뉴" },
    nav.length ? h("div", { class: "nav-group" }, "업무") : null,
    workLinks,
    !nav.length ? h("div", { class: "nav-note" }, "이 계정의 업무 메뉴는 준비 중입니다.") : null,
    h("div", { class: "nav-group" }, "설정"),
    accountLink,
    helpLink,
    h("div", { class: "sidebar-foot" }, icon("receipt"), h("span", { class: "muted", title: BUILD === "dev" ? "로컬 개발 빌드" : `빌드 ${BUILD}` }, `v${VERSION} · ${BUILD}`)),
  );

  const content = h("main", { class: "content", id: "content" });
  root.append(h("div", { class: "shell" }, header, side, content,
    h("nav", { class: "mobile-nav", "aria-label": "모바일 메뉴" }, primary, mobileMore)));
  return content;
}

export function setNavBadge(route, n) {
  for (const a of navLinks.filter((x) => x.dataset.route === route)) {
    a.querySelector(".nav-badge")?.remove();
    if (n > 0) a.append(h("span", { class: "nav-badge" }, n > 99 ? "99+" : String(n)));
  }
}

export function setActiveNav(route) {
  activeIcon = navLinks.find((a) => a.dataset.route === route)?.dataset.icon || "receipt";
  navLinks.forEach((a) => {
    const active = a.dataset.route === route;
    a.classList.toggle("active", active);
    if (active) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  mobileMore.open = false;
  mobileMore.classList.toggle("active", Boolean(mobileMore.querySelector("[aria-current='page']")));
}

export function pageHeader({ crumbs = [], title, desc, actions, help }) {
  return h(
    "div",
    { class: "page-head" },
    h(
      "div",
      { class: "page-identity" },
      h("span", { class: "page-symbol" }, icon(activeIcon)),
      h("div", {},
        crumbs.length ? h("div", { class: "crumbs" }, crumbs.flatMap((c, i) => (i ? [h("span", { class: "crumb-sep" }, "/"), c] : [c]))) : null,
        h("h1", { class: "page-title" }, title, help ? tip(help) : null),
        desc ? h("p", { class: "page-desc" }, desc) : null),
    ),
    actions ? h("div", { class: "page-actions" }, actions) : null,
  );
}
