// 관리웹 — 현재는 계정 접속 확인만. Firebase Auth REST 로 로그인하고 백엔드 /me 로 역할·지국을 보여준다.
// 토큰은 메모리에만 둔다(새로고침하면 다시 로그인). SDK 없이 fetch 만 쓴다.
(function () {
  "use strict";
  var C = window.ES7_CONFIG;
  var $ = function (id) { return document.getElementById(id); };
  var idToken = null;

  var ROLE = {
    staff:   { label: "지국 담당자",   perms: ["자기 지국 증빙 업로드", "자기 지국 전표 조회·수정·제출"] },
    imc:     { label: "보도IMC팀",     perms: ["전체 지국 전표 조회", "적격/비적격 분류 (준비 중)"] },
    imc_head:     { label: "보도IMC팀장", perms: ["전체 지국 전표 조회", "적격/비적격 분류 (준비 중)", "적격 증빙 전결 (준비 중)"] },
    bureau_chief: { label: "보도국장",    perms: ["전체 지국 전표 조회", "비적격 증빙 전결 (준비 중)"] },
    division_head:{ label: "보도본부장",  perms: ["전체 지국 전표 조회", "비적격 증빙 전결 (준비 중)"] },
    finance: { label: "재무팀",        perms: ["전체 지국 전표 조회", "전표 승인", "검증 규칙·분기 한도 편집", "정산서 생성·다운로드"] },
    admin:   { label: "관리자",        perms: ["재무팀 권한 전체", "계정·시스템 관리"] },
  };
  var BRANCH = { newyork: "뉴욕", washington: "워싱턴", paris: "파리", beijing: "베이징", tokyo: "도쿄" };
  var ACCT = { shared: "지국 공용 계정 (임시 운영)", personal: "개인 계정", anon: "익명" };
  var ALL = ["자기 지국 증빙 업로드", "자기 지국 전표 조회·수정·제출", "전체 지국 전표 조회", "적격/비적격 분류 (준비 중)",
             "적격 증빙 전결 (준비 중)", "비적격 증빙 전결 (준비 중)",
             "전표 승인", "검증 규칙·분기 한도 편집", "정산서 생성·다운로드", "재무팀 권한 전체", "계정·시스템 관리"];

  function text(el, s) { el.textContent = s; }

  function apiStatus() {
    fetch(C.apiBase + "/health").then(function (r) { return r.json(); }).then(function (j) {
      var el = $("apiStatus"); el.className = "status ok"; text(el, "서버 연결 정상 · VLM " + j.provider);
    }).catch(function () {
      var el = $("apiStatus"); el.className = "status bad"; text(el, "서버에 연결할 수 없습니다");
    });
  }

  function showMe(me) {
    var info = ROLE[me.role] || { label: me.role, perms: [] };
    var rows = [["아이디", me.email || "-"], ["역할", info.label + " (" + me.role + ")"],
                ["지국", me.branchId ? (BRANCH[me.branchId] || me.branchId) : "전체"]];
    if (me.acct) rows.push(["계정 종류", ACCT[me.acct] || me.acct]);
    var dl = $("meList"); dl.textContent = "";
    rows.forEach(function (r) {
      var dt = document.createElement("dt"), dd = document.createElement("dd");
      text(dt, r[0]); text(dd, r[1]); dl.appendChild(dt); dl.appendChild(dd);
    });
    var ul = $("perms"); ul.textContent = "";
    ALL.forEach(function (p) {
      var li = document.createElement("li"), ok = info.perms.indexOf(p) >= 0;
      text(li, (ok ? "✓ " : "– ") + p); if (!ok) li.className = "no"; ul.appendChild(li);
    });
    $("login").hidden = true; $("me").hidden = false;
  }

  $("loginForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var btn = $("loginBtn"), err = $("loginErr");
    btn.disabled = true; text(err, "");
    fetch("https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=" + encodeURIComponent(C.firebase.apiKey), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: $("email").value.trim(), password: $("pw").value, returnSecureToken: true }),
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error("아이디 또는 비밀번호가 올바르지 않습니다.");
        idToken = res.j.idToken;
        return fetch(C.apiBase + "/me", { headers: { Authorization: "Bearer " + idToken } });
      })
      .then(function (r) { if (!r.ok) throw new Error("서버 인증에 실패했습니다."); return r.json(); })
      .then(function (me) { $("pw").value = ""; showMe(me); })
      .catch(function (ex) { text(err, ex.message || "로그인에 실패했습니다."); })
      .then(function () { btn.disabled = false; });
  });

  $("logoutBtn").addEventListener("click", function () {
    idToken = null; $("me").hidden = true; $("login").hidden = false; $("email").focus();
  });

  apiStatus();
})();
