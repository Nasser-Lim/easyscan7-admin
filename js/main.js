// 관리웹 진입점 — 세션 확인 → 로그인 화면 또는 앱 셸 + 해시 라우터.
import { api, hasSession, logout, onSignedOut } from "./api.js";
import { clear, h, spinner, toast, errorText } from "./ui.js";
import { renderLogin } from "./views/login.js";
import { renderShell, setActiveNav } from "./views/shell.js";
import { renderHome } from "./views/home.js";
import { renderUpload } from "./views/upload.js";
import { renderEntries } from "./views/entries.js";
import { renderAccount } from "./views/account.js";

const app = document.getElementById("app");
let me = null;
let content = null;

// 역할별 메뉴. 지국 담당자(staff)만 업무 메뉴가 있다 — 다른 역할 화면은 준비 중.
export const NAV = {
  staff: [
    { route: "home", label: "홈", icon: "home" },
    { route: "upload", label: "증빙 업로드", icon: "upload" },
    { route: "entries", label: "전표 조회", icon: "list" },
  ],
};

const ROUTES = {
  home: (el, ctx) => renderHome(el, ctx),
  upload: (el, ctx) => renderUpload(el, ctx),
  entries: (el, ctx) => renderEntries(el, ctx),
  account: (el, ctx) => renderAccount(el, ctx),
};

function parseHash() {
  const [route, ...rest] = (location.hash.replace(/^#\/?/, "") || "").split("/");
  return { route: route || "", params: rest };
}

function allowed(route) {
  if (route === "account") return true;
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
}

onSignedOut(() => {
  me = null;
  content = null;
  boot();
});
window.addEventListener("hashchange", navigate);
boot();
