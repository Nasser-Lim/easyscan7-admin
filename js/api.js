// 인증(Firebase Auth REST) + 백엔드 호출. SDK 없이 fetch 만 쓴다.
// 세션은 sessionStorage(탭을 닫으면 사라짐). ID 토큰은 1시간이라 만료 1분 전에 refresh 토큰으로 갱신한다.
const C = window.ES7_CONFIG;
const KEY = "es7.session";
const listeners = new Set();

let session = load();

function load() {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) || "null");
  } catch {
    return null;
  }
}
function save(s) {
  session = s;
  try {
    if (s) sessionStorage.setItem(KEY, JSON.stringify(s));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* 저장소를 못 쓰는 환경에서도 메모리 세션으로 동작 */
  }
}

export function hasSession() {
  return !!(session && session.refreshToken);
}
export function onSignedOut(fn) {
  listeners.add(fn);
}

export class ApiError extends Error {
  constructor(status, detail) {
    super(typeof detail === "string" ? detail : (detail && detail.message) || `요청 실패 (${status})`);
    this.status = status;
    this.detail = detail;
  }
}

const AUTH_ERR = {
  INVALID_LOGIN_CREDENTIALS: "아이디 또는 비밀번호가 올바르지 않습니다.",
  INVALID_PASSWORD: "아이디 또는 비밀번호가 올바르지 않습니다.",
  EMAIL_NOT_FOUND: "아이디 또는 비밀번호가 올바르지 않습니다.",
  USER_DISABLED: "사용이 정지된 계정입니다. 관리자에게 문의하세요.",
  TOO_MANY_ATTEMPTS_TRY_LATER: "로그인 시도가 너무 많습니다. 잠시 후 다시 시도하세요.",
};

export async function login(email, password) {
  const r = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(C.firebase.apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const code = (j.error && j.error.message) || "";
    throw new ApiError(r.status, AUTH_ERR[code.split(" ")[0]] || "로그인에 실패했습니다.");
  }
  save({
    idToken: j.idToken,
    refreshToken: j.refreshToken,
    email: j.email,
    expiresAt: Date.now() + Number(j.expiresIn || 3600) * 1000,
  });
}

export function logout() {
  save(null);
  listeners.forEach((fn) => fn());
}

async function refresh() {
  const r = await fetch(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(C.firebase.apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: session.refreshToken }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(401, "세션이 만료되었습니다. 다시 로그인하세요.");
  save({
    ...session,
    idToken: j.id_token,
    refreshToken: j.refresh_token,
    expiresAt: Date.now() + Number(j.expires_in || 3600) * 1000,
  });
}

async function token() {
  if (!session) throw new ApiError(401, "로그인이 필요합니다.");
  if (Date.now() > session.expiresAt - 60_000) await refresh();
  return session.idToken;
}

async function request(path, { method = "GET", json, form } = {}) {
  let t;
  try {
    t = await token();
  } catch (e) {
    logout();
    throw e;
  }
  const headers = { Authorization: `Bearer ${t}` };
  let body;
  if (json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  } else if (form) {
    body = form;
  }
  const r = await fetch(C.apiBase + path, { method, headers, body });
  if (r.status === 401) {
    logout();
    throw new ApiError(401, "세션이 만료되었습니다. 다시 로그인하세요.");
  }
  return r;
}

async function parse(r) {
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(r.status, j.detail ?? j);
  return j;
}

export const api = {
  get: (p) => request(p).then(parse),
  post: (p, json) => request(p, { method: "POST", json }).then(parse),
  put: (p, json) => request(p, { method: "PUT", json }).then(parse),
  patch: (p, json) => request(p, { method: "PATCH", json }).then(parse),
  del: (p) => request(p, { method: "DELETE" }).then(parse),
  postForm: (p, form) => request(p, { method: "POST", form }).then(parse),
  async blob(p) {
    const r = await request(p);
    if (!r.ok) throw new ApiError(r.status, "원본을 불러오지 못했습니다.");
    return r.blob();
  },
};

export async function health() {
  const r = await fetch(C.apiBase + "/health");
  if (!r.ok) throw new Error("health");
  return r.json();
}
