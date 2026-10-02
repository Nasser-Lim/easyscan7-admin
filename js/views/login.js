// 로그인 화면 — 왼쪽 브랜드 패널(SBS 흰색 로고, 네이비), 오른쪽 폼.
import { health, login } from "../api.js";
import { h, icon, spinner } from "../ui.js";

export function renderLogin(root, onSuccess) {
  const err = h("div", { class: "form-error", role: "alert" });
  const email = h("input", { class: "input input-lg", type: "email", autocomplete: "username", required: true, placeholder: "name@example.com" });
  const pw = h("input", { class: "input input-lg", type: "password", autocomplete: "current-password", required: true, placeholder: "비밀번호" });
  const btn = h("button", { class: "btn btn-primary btn-lg btn-block", type: "submit" }, "로그인");
  const status = h("div", { class: "login-status" }, spinner(true), h("span", {}, "서버 연결 확인 중"));

  const form = h(
    "form",
    {
      class: "login-form",
      novalidate: true,
      onsubmit: async (e) => {
        e.preventDefault();
        err.textContent = "";
        if (!email.value.trim() || !pw.value) {
          err.textContent = "아이디와 비밀번호를 입력하세요.";
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
    h("div", { class: "login-eyebrow" }, "EASYSCAN"),
    h("h1", { class: "login-title" }, "해외지국 정산관리"),
    h("p", { class: "login-sub" }, "발급받은 계정으로 로그인하세요."),
    h("label", { class: "field" }, h("span", { class: "field-label" }, "아이디"), email),
    h("label", { class: "field" }, h("span", { class: "field-label" }, "비밀번호"), pw),
    err,
    btn,
    h("p", { class: "login-help" }, "계정 발급·비밀번호 초기화는 재무팀 또는 AI파트너십팀에 문의하세요."),
    status,
  );

  const brand = h(
    "aside",
    { class: "login-brand" },
    h("div", { class: "login-rings", "aria-hidden": "true" }),
    h("img", { class: "login-logo", src: "assets/sbs-logo-w.png", alt: "SBS" }),
    h(
      "div",
      { class: "login-brand-body" },
      h("div", { class: "login-brand-kicker" }, "보도본부 · 재무팀"),
      h("div", { class: "login-brand-title" }, "해외지국 영수증", h("br"), "정산 시스템"),
      h(
        "ul",
        { class: "login-points" },
        h("li", {}, icon("upload"), h("span", {}, "PDF·스크린샷 증빙을 올리면 AI 가 전표를 만듭니다")),
        h("li", {}, icon("check"), h("span", {}, "한글 번역·검산·분기 한도를 자동으로 확인합니다")),
        h("li", {}, icon("send"), h("span", {}, "확인한 전표를 제출하면 결재선으로 넘어갑니다")),
      ),
    ),
    h("div", { class: "login-brand-foot" }, "© SBS · EASYSCAN"),
  );

  root.append(h("div", { class: "login" }, brand, h("main", { class: "login-main" }, form)));
  email.focus();

  health()
    .then((j) => status.replaceChildren(h("span", { class: "dot dot-ok" }), h("span", {}, `서버 연결 정상 · ${j.provider}`)))
    .catch(() => status.replaceChildren(h("span", { class: "dot dot-bad" }), h("span", {}, "서버에 연결할 수 없습니다")));
}
