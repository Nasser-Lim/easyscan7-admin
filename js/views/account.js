// 내 계정 — 역할·지국·계정 종류. 지국 담당자 외 역할은 메뉴가 준비 중임을 안내한다.
import { ACCT, BRANCH, ROLE, h } from "../ui.js";
import { pageHeader } from "./shell.js";

const PERMS = {
  staff: ["자기 지국 증빙 업로드", "자기 지국 전표 조회·수정·제출"],
  imc: ["전체 지국 전표 조회", "적격/비적격 분류"],
  imc_head: ["전체 지국 전표 조회", "적격/비적격 분류", "적격 증빙 전결"],
  bureau_chief: ["전체 지국 전표 조회", "비적격 증빙 전결"],
  division_head: ["전체 지국 전표 조회", "비적격 증빙 전결"],
  finance: ["전체 지국 전표 조회", "증빙 최종 검토·전표 결재", "검증 규칙·분기 한도 편집", "정산서 생성·다운로드"],
  admin: ["재무팀 권한 전체", "계정·시스템 관리"],
};

export function renderAccount(el, { me }) {
  const ready = Boolean(PERMS[me.role]);
  el.append(
    pageHeader({ crumbs: ["설정"], title: "내 계정", desc: "로그인한 계정의 역할과 권한입니다." }),
    h(
      "div",
      { class: "grid-2" },
      h(
        "section",
        { class: "card" },
        h("div", { class: "card-head" }, h("div", { class: "card-title" }, "계정 정보")),
        h(
          "dl",
          { class: "kv" },
          h("dt", {}, "아이디"), h("dd", {}, me.email || "-"),
          h("dt", {}, "역할"), h("dd", {}, `${ROLE[me.role] || me.role} (${me.role})`),
          h("dt", {}, "지국"), h("dd", {}, me.branchId ? `${BRANCH[me.branchId] || me.branchId}지국` : "전체(본사)"),
          h("dt", {}, "계정 종류"), h("dd", {}, me.acct ? ACCT[me.acct] || me.acct : "-"),
        ),
        me.acct === "shared"
          ? h("p", { class: "card-note" }, "임시 운영 중인 지국 공용 계정입니다. 개인 계정(회사 이메일)으로 전환될 예정이며, 비밀번호를 외부에 공유하지 마세요.")
          : null,
      ),
      h(
        "section",
        { class: "card" },
        h("div", { class: "card-head" }, h("div", { class: "card-title" }, "이 계정의 권한")),
        h("ul", { class: "perm-list" }, (PERMS[me.role] || []).map((p) => h("li", {}, p))),
        ready ? null : h("p", { class: "card-note" }, "이 역할은 아직 정의되지 않았습니다. 관리자에게 문의하세요."),
      ),
    ),
  );
}
