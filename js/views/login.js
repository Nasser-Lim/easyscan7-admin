import { health, login, setEmulatorPassword } from "../api.js?v=b8fd816";
import { field, h, icon, toast } from "../ui.js?v=b8fd816";
import { BUILD, VERSION } from "../version.js?v=b8fd816";

export function renderLogin(root, onSuccess) {
  const code = window.ES7_CONFIG.firebase.emulator && location.hash.startsWith("#/setup?")
    ? new URLSearchParams(location.hash.slice("#/setup?".length)).get("code") : null;
  const err = h("div", { class: "form-error", role: "alert" });
  const email = h("input", { class: "input input-lg", name: "email", type: "email", autocomplete: "username", required: true });
  const pw = h("input", { class: "input input-lg", name: "password", type: "password", autocomplete: "current-password", required: true });
  const btn = h("button", { class: "btn btn-primary btn-lg btn-block", type: "submit" }, "로그인");
  const status = h("p", { class: "login-status", role: "status" });

  const form = h(
    "form",
    {
      class: "login-form",
      novalidate: true,
      onsubmit: async (e) => {
        e.preventDefault();
        err.textContent = "";
        if (btn.disabled) return;
        if (!email.value.trim() || email.validity.typeMismatch) {
          err.textContent = "이메일을 확인해 주세요.";
          email.focus();
          return;
        }
        if (!pw.value) {
          err.textContent = "비밀번호를 입력해 주세요.";
          pw.focus();
          return;
        }
        btn.disabled = true;
        btn.textContent = "확인 중…";
        try {
          await login(email.value.trim(), pw.value);
          onSuccess();
        } catch (ex) {
          err.textContent = ex.message;
          btn.disabled = false;
          btn.textContent = "로그인";
          pw.select();
        }
      },
    },
    h("h2", { class: "login-title" }, "로그인"),
    h("label", { class: "field" }, h("span", { class: "field-label" }, "이메일"), email),
    h("label", { class: "field" }, h("span", { class: "field-label" }, "비밀번호"), pw),
    err,
    btn,
    h("p", { class: "login-help" }, "계정·비밀번호 문의는 보도BIZ팀에 연락해 주세요."),
    status,
  );

  const visual = h("figure", { class: "login-visual" },
    h("img", { src: "assets/easyscan-ai-accounting-flow.webp", alt: "영수증의 날짜와 금액이 AI를 거쳐 정산표로 이어지는 모습", width: 1536, height: 1024, loading: "lazy" }),
  );
  const brand = h(
    "section",
    { class: "login-brand" },
    h("div", { class: "login-lockup" },
      h("img", { class: "login-logo", src: "assets/sbs-logo-w.png", alt: "SBS" }),
      h("span", {}, "EASYSCAN"),
    ),
    h(
      "div",
      { class: "login-brand-body" },
      h("h1", { class: "login-brand-title" }, "해외지국 AI 정산 시스템"),
      h(
        "ul",
        { class: "login-points" },
        h("li", {}, icon("check"), h("span", {}, "AI 자동화로 업무 효율화")),
        h("li", {}, icon("file"), h("span", {}, "외국어 영수증 번역·검산 자동화")),
        h("li", {}, icon("print"), h("span", {}, "사내 정산 양식으로 원클릭 출력")),
      ),
    ),
    visual,
    h("small", { class: "login-version" }, `v${VERSION} · ${BUILD}`),
  );

  root.append(h("div", { class: "login" }, brand, h("main", { class: "login-main" }, code ? setupForm(code, onSuccess) : form)));

  health().catch(() => { status.textContent = "서버에 연결할 수 없습니다."; });
}

function setupForm(code, onSuccess) {
  const password = h("input", { class: "input input-lg", type: "password", required: true, minlength: 8, autocomplete: "new-password" });
  const confirmation = h("input", { class: "input input-lg", type: "password", required: true, minlength: 8, autocomplete: "new-password" });
  const err = h("div", { class: "form-error", role: "alert" });
  const submit = h("button", { class: "btn btn-primary btn-lg btn-block", type: "submit" }, "비밀번호 저장");
  return h("form", { class: "login-form", onsubmit: async (event) => {
    event.preventDefault();
    if (password.value !== confirmation.value) {
      err.textContent = "두 비밀번호가 일치하는지 확인해 주세요.";
      return;
    }
    submit.disabled = true;
    err.textContent = "";
    try {
      await setEmulatorPassword(code, password.value);
      location.replace("#/master");
      onSuccess();
      toast("비밀번호를 저장했습니다. 다시 로그인해 주세요.", "ok");
    } catch (error) {
      err.textContent = error.message;
      submit.disabled = false;
    }
  } }, h("h2", { class: "login-title" }, "테스트 비밀번호 설정"),
  field("새 비밀번호", password), field("새 비밀번호 확인", confirmation), err, submit);
}
