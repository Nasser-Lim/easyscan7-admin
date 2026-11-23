// 관리웹 진입점 — 세션 확인 → 로그인 화면 또는 앱 셸 + 해시 라우터.
import { api, hasSession, logout, onSignedOut } from "./api.js?v=f130322";
import { clear, h, spinner, toast, errorText, updateCatalog, workSummaryDialog } from "./ui.js?v=f130322";
import { renderLogin } from "./views/login.js?v=f130322";
import { renderShell, setActiveNav } from "./views/shell.js?v=f130322";
import { renderHome } from "./views/home.js?v=f130322";
import { renderUpload } from "./views/upload.js?v=f130322";
import { renderEntries } from "./views/entries.js?v=f130322";
import { renderAccount } from "./views/account.js?v=f130322";
import { renderInbox, refreshInboxBadge } from "./views/inbox.js?v=f130322";
import { renderHelp } from "./views/help.js?v=f130322";
import { renderLimitSettings } from "./views/limitcfg.js?v=f130322";
import { renderPolicy } from "./views/policy.js?v=f130322";
import { renderSettle } from "./views/settle.js?v=f130322";
import { renderBureau } from "./views/bureau.js?v=f130322";
import { renderMaster } from "./views/master.js?v=f130322";
import { initUploadQueue, resetUploadQueue } from "./uploadjob.js?v=f130322";
import { loadMode } from "./period.js?v=f130322";

const app = document.getElementById("app");
let me = null;
let content = null;

// 역할별 메뉴 — 실제 권한 검사는 서버(deps.py·workflow.py)가 한다. 메뉴는 편의.
const HOME_NAV = { route: "home", label: "홈", icon: "home" };
const ENTRIES_NAV = { route: "entries", label: "전체 증빙", icon: "list" };
const REVIEWER_NAV = [
  HOME_NAV,
  { route: "inbox", label: "결재함", icon: "check" },
  ENTRIES_NAV,
];
// 분기 한도 설정 — 서버 권한(deps.require_limit_admin)과 같은 역할: 보도BIZ팀·재무팀·관리자
// 정산 출력 — 서버 권한(settlements.require_export)과 같은 역할: 지국 담당자·보도BIZ팀·재무팀·관리자
const SETTLE_NAV = { route: "settle", label: "정산 출력", icon: "file" };
const LIMIT_NAV = { route: "limits", label: "한도·정산 설정", icon: "sliders" };
// AI 적격 정책 — 서버 권한(deps.require_policy_admin)과 같은 역할: 보도BIZ팀·재무팀·관리자 공용
const POLICY_NAV = { route: "policy", label: "AI 적격 정책", icon: "shield" };
const BUREAU_NAV = { route: "bureau", label: "지국 관리", icon: "user" };
const MASTER_NAV = { route: "master", label: "통합관리", icon: "sliders" };
export const NAV = {
  staff: [
    { route: "home", label: "홈", icon: "home" },
    { route: "upload", label: "증빙 업로드", icon: "upload" },
    { route: "entries", label: "증빙 조회", icon: "list" },
    SETTLE_NAV,
  ],
  imc: [...REVIEWER_NAV, SETTLE_NAV, LIMIT_NAV, POLICY_NAV, BUREAU_NAV],
  bureau_chief: REVIEWER_NAV,
  division_head: REVIEWER_NAV,
  finance: [...REVIEWER_NAV, SETTLE_NAV, LIMIT_NAV, POLICY_NAV],
  admin: [...REVIEWER_NAV, SETTLE_NAV, LIMIT_NAV, POLICY_NAV, BUREAU_NAV],
};

const ROUTES = {
  home: (el, ctx) => renderHome(el, ctx),
  upload: (el, ctx) => renderUpload(el, ctx),
  entries: (el, ctx) => renderEntries(el, ctx),
  inbox: (el, ctx) => renderInbox(el, ctx),
  account: (el, ctx) => renderAccount(el, ctx),
  help: (el, ctx) => renderHelp(el, ctx),
  limits: (el, ctx) => renderLimitSettings(el, ctx),
  policy: (el, ctx) => renderPolicy(el, ctx),
  settle: (el, ctx) => renderSettle(el, ctx),
  bureau: (el, ctx) => renderBureau(el, ctx),
  master: (el, ctx) => renderMaster(el, ctx),
};

function accountNav() {
  const navigation = NAV[me.role] || [];
  if (me.role !== "admin" || me.master !== true) return navigation;
  return [MASTER_NAV, HOME_NAV, ENTRIES_NAV, POLICY_NAV, SETTLE_NAV, LIMIT_NAV, BUREAU_NAV];
}

function parseHash() {
  const [path, search] = location.hash.replace(/^#\/?/, "").split("?", 2);
  const [route, ...params] = path.split("/");
  return { route, params, query: new URLSearchParams(search) };
}

function allowed(route) {
  if (route === "account" || route === "help") return true;
  return accountNav().some((n) => n.route === route);
}

function navigate() {
  if (!me || !content) return;
  const { route, params, query } = parseHash();
  if (!route || !allowed(route)) {
    const first = accountNav()[0];
    location.replace(`#/${first ? first.route : "account"}`);
    return;
  }
  setActiveNav(route);
  clear(content);
  ROUTES[route](content, { me, params, query, go: (r) => (location.hash = `#/${r}`) });
  window.scrollTo(0, 0);
}

async function boot() {
  clear(app);
  if (!hasSession() || (window.ES7_CONFIG.firebase.emulator && location.hash.startsWith("#/setup?"))) {
    renderLogin(app, boot);
    return;
  }
  app.append(h("div", { class: "boot" }, spinner(), h("span", {}, "불러오는 중…")));
  try {
    const [identity, , catalog] = await Promise.all([api.get("/me"), loadMode(), api.get("/accounts/catalog").catch(() => null)]);
    me = identity;
    updateCatalog(catalog?.branch, catalog?.accounts);
  } catch (e) {
    if (e.status !== 401) toast(errorText(e), "bad");
    logout();
    return;
  }
  clear(app);
  const nav = accountNav();
  content = renderShell(app, me, nav);
  initUploadQueue(me);
  navigate();
  const hasInbox = nav.some((item) => item.route === "inbox");
  if (hasInbox) refreshInboxBadge(me);
  if (hasInbox || me.role === "staff") dailyWorkSummary(me);
}

async function dailyWorkSummary(user) {
  const day = new Date().toLocaleDateString("sv-SE");
  const key = `es7.daily.${user.uid}`;
  try {
    if (localStorage.getItem(key) === day) return;
    const staff = user.role === "staff";
    const { entries } = await api.get(staff
      ? `/entries?status=returned${user.cloudData ? "&source=cloud" : ""}`
      : "/entries/queue");
    if (user !== me) return;
    localStorage.setItem(key, day);
    if (!entries.length) return;
    const oldest = staff ? Infinity : entries.reduce((time, entry) => Math.min(time, Date.parse(entry.updatedAt) || Infinity), Infinity);
    const days = Math.max(0, Math.floor((Date.now() - oldest) / 86400000));
    const open = await workSummaryDialog({ title: staff ? "반려된 증빙" : "결재 대기 증빙", count: entries.length, days });
    if (open && user === me) location.hash = staff ? "#/entries/returned" : "#/inbox";
  } catch { /* 요약을 읽을 수 없어도 기본 업무 화면은 사용할 수 있다. */ }
}

onSignedOut(() => {
  resetUploadQueue();
  me = null;
  content = null;
  boot();
});
window.addEventListener("hashchange", navigate);
boot();
