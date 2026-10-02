// 관리웹 진입점 — 세션 확인 → 로그인 화면 또는 앱 셸 + 해시 라우터.
import { api, hasSession, logout, onSignedOut } from "./api.js";
import { clear, h, spinner, toast, errorText } from "./ui.js";
import { renderLogin } from "./views/login.js";
import { renderShell, setActiveNav } from "./views/shell.js";
import { renderHome } from "./views/home.js";
import { renderUpload } from "./views/upload.js";
import { renderEntries } from "./views/entries.js";
import { renderAccount } from "./views/account.js";
import { renderInbox, refreshInboxBadge } from "./views/inbox.js";
import { renderHelp } from "./views/help.js";
import { renderLimitSettings } from "./views/limitcfg.js";

const app = document.getElementById("app");
let me = null;
let content = null;

// 역할별 메뉴 — 실제 권한 검사는 서버(deps.py·workflow.py)가 한다. 메뉴는 편의.
const REVIEWER_NAV = [
  { route: "inbox", label: "결재함", icon: "check" },
  { route: "entries", label: "전체 증빙", icon: "list" },
];
// 분기 한도 설정 — 서버 권한(deps.require_limit_admin)과 같은 역할: 보도IMC팀·재무팀·관리자
const LIMIT_NAV = { route: "limits", label: "분기 한도 설정", icon: "sliders" };
export const NAV = {
  staff: [
    { route: "home", label: "홈", icon: "home" },
    { route: "upload", label: "증빙 업로드", icon: "upload" },
    { route: "entries", label: "증빙 조회", icon: "list" },
  ],
  imc: [...REVIEWER_NAV, LIMIT_NAV],
  bureau_chief: REVIEWER_NAV,
  division_head: REVIEWER_NAV,
  finance: [...REVIEWER_NAV, LIMIT_NAV],
  admin: [...REVIEWER_NAV, LIMIT_NAV],
};

const ROUTES = {
  home: (el, ctx) => renderHome(el, ctx),
  upload: (el, ctx) => renderUpload(el, ctx),
  entries: (el, ctx) => renderEntries(el, ctx),
  inbox: (el, ctx) => renderInbox(el, ctx),
  account: (el, ctx) => renderAccount(el, ctx),
  help: (el, ctx) => renderHelp(el, ctx),
  limits: (el, ctx) => renderLimitSettings(el, ctx),
};

function parseHash() {
  const [route, ...rest] = (location.hash.replace(/^#\/?/, "") || "").split("/");
  return { route: route || "", params: rest };
}

function allowed(route) {
  if (route === "account" || route === "help") return true;
  return (NAV[me.role] || []).some((n) => n.route === route);
}

function navigate() {
  if (!me || !content) return;
  let { route, params } = parseHash();
  if (!route || !allowed(route)) {
    const first = (NAV[me.role] || [])[0];
    location.replace(`#/${first ? first.route : "account"}`);
    return;
  }
  setActiveNav(route);
  clear(content);
  ROUTES[route](content, { me, params, go: (r) => (location.hash = `#/${r}`) });
  window.scrollTo(0, 0);
}

async function boot() {
  clear(app);
  if (!hasSession()) {
    renderLogin(app, boot);
    return;
  }
  app.append(h("div", { class: "boot" }, spinner(), h("span", {}, "불러오는 중…")));
  try {
    me = await api.get("/me");
  } catch (e) {
    if (e.status !== 401) toast(errorText(e), "bad");
    logout();
    return;
  }
  clear(app);
  content = renderShell(app, me, NAV[me.role] || []);
  navigate();
  refreshInboxBadge(me);
}

onSignedOut(() => {
  me = null;
  content = null;
  boot();
});
window.addEventListener("hashchange", navigate);
boot();
