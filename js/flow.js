// 결재 흐름 도식 — 증빙 상세 상단에 '지금 어디까지 왔는지'를 한눈에 보여 준다.
// 지국 제출 → AI 1차 검증 → 보도BIZ팀 분류 → 보도국장 전결(비적격일 때) → 재무팀 최종 결재
import { h, icon, isCoreAccount } from "./ui.js?v=44821c9";

const NODES = [
  { key: "staff", label: "지국", sub: "작성 · 제출" },
  { key: "ai", label: "AI 검증", sub: "1차 적격" },
  { key: "imc", label: "보도BIZ팀", sub: "적격 분류", from: "submitted" },
  { key: "chief", label: "보도국장", sub: "전결", from: "chief_review" },
  { key: "fin", label: "재무팀", sub: "최종 결재", from: "finance_review" },
];

const shortDate = (at) => (at ? at.slice(5, 10).replace("-", ".") : "");
// 그 단계에서 마지막으로 일어난 결재 이력 (취소 이력은 제외)
const lastAt = (list, from) => [...list].reverse().find((a) => a.from === from && a.action !== "cancel");

/** 증빙 한 건의 흐름 상태 → 노드별 상태·메모와 한 줄 요약 */
export function flowState(e) {
  if (e.account && !isCoreAccount(e.account)) return otherFlow(e);
  const list = e.approvals || [];
  const st = e.status;
  const chiefNeeded = e.eligibility === "ineligible" || (e.ineligibleAmount || 0) > 0;
  const gate = e.aiGate?.verdict;
  const aiReturned = st === "returned" && e.returnedBy === "ai";
  // 사람이 반려했다면 반려한 단계까지는 지나온 것으로 그린다
  const retFrom = st === "returned" && !aiReturned ? [...list].reverse().find((a) => a.action === "return")?.from : null;
  const idx = retFrom ? { submitted: 2, chief_review: 3, finance_review: 4 }[retFrom] ?? 0 : { draft: 0, flagged: 0, returned: 0, submitted: 2, chief_review: 3, finance_review: 4, approved: 5, rejected: 3 }[st] ?? 0;

  const nodes = NODES.map((n, i) => {
    let state = i < idx ? "done" : i === idx ? "current" : "todo";
    let note = "";
    if (n.key === "staff") {
      const r = [...list].reverse().find((a) => a.action === "submit");
      if (st === "returned") {
        state = "current";
        note = "수정 필요";
      } else if (idx > 0) note = shortDate(r?.at);
      else note = "작성중";
    }
    if (n.key === "ai") {
      if (aiReturned) {
        state = "bad";
        note = "자동 반려";
      } else if (idx > 0) {
        note = gate === "pass" ? "통과" : gate === "fail" ? (e.aiGate.override ? "소명 제출" : "위반") : gate === "uncertain" ? "보류" : !gate || gate === "skipped" ? "정책 없음" : "확인 필요";
      } else state = "todo";
    }
    if (n.from) {
      const rec = lastAt(list, n.from);
      if (state === "done" && rec) note = shortDate(rec.at);
      if (state === "current") note = st === "rejected" ? "불승인" : "결재 대기";
      if (n.key === "chief") {
        if (state === "todo") note = chiefNeeded ? "" : "비적격 시";
        if (state === "done" && !rec) {
          state = "skip";
          note = "해당 없음";
        }
        if (st === "rejected") state = "bad";
      }
      if (retFrom === n.from) {
        state = "bad";
        note = "반려";
      }
    }
    return { ...n, state, note };
  });
  if (st === "approved") nodes[4].note = shortDate(lastAt(list, "finance_review")?.at) || "완료";

  const summary =
    {
      draft: ["작성중", "지국 담당자가 작성 중입니다", "muted"],
      flagged: ["작성중", "검토 필요 항목이 있어 지국에서 확인 중입니다", "muted"],
      returned: ["반려", aiReturned ? "AI 1차 검증에서 자동 반려되었습니다 — 소명하거나 고쳐서 다시 제출" : "반려되었습니다 — 지국에서 고쳐서 다시 제출", "bad"],
      submitted: ["보도BIZ팀 적격 분류 대기", "다음: 보도BIZ팀이 적격 · 비적격을 분류합니다", "info"],
      chief_review: ["보도국장 전결 대기", "비적격 증빙이라 보도국장 전결이 필요합니다", "info"],
      finance_review: ["재무팀 최종 결재 대기", "다음: 재무팀이 최종 결재합니다", "info"],
      approved: ["결재 완료", "재무팀 최종 결재까지 끝났습니다", "ok"],
      rejected: ["불승인", "보도국장이 불승인해 지급하지 않습니다", "bad"],
    }[st] || [st, "", "muted"];
  return { nodes, summary };
}

// 기타 계정(결재 대상 아님) — 지국 작성 → 보관 두 단계
function otherFlow(e) {
  const filed = e.status === "filed";
  const sub = [...(e.approvals || [])].reverse().find((a) => a.action === "submit");
  return {
    nodes: [
      { key: "staff", label: "지국", sub: "작성 · 제출", state: filed ? "done" : "current", note: filed ? shortDate(sub?.at) : "작성중" },
      { key: "file", label: "보관", sub: "정산서 합산", state: filed ? "done" : "todo", note: filed ? "완료" : "" },
    ],
    summary: filed ? ["제출 완료(보관)", "결재 없이 보관되어 정산서에 계정별로 합산됩니다", "ok"] : ["작성중", "기타 계정 — 제출하면 결재 없이 보관됩니다", "muted"],
  };
}

const STEP_ICON = { staff: "send", ai: "shield", imc: "list", chief: "user", fin: "check", file: "file" };
const STEP_STATE = { done: "완료", current: "진행 중", todo: "대기", skip: "해당 없음", bad: "반려·불승인" };

export function compactFlow(entry) {
  const { nodes, summary: [, , tone] } = flowState(entry);
  return h("ol", { class: `receipt-pipeline flow-${tone}`, "aria-label": "결재 단계" }, nodes.map((node, index) => {
    const current = node.state === "current";
    const active = current || (tone === "ok" && index === nodes.length - 1) || (entry.status === "rejected" && node.state === "bad");
    const label = `${node.label} · ${STEP_STATE[node.state]}${node.note ? ` (${node.note})` : ""}`;
    return h("li", { class: `rp-step rp-${node.state}${active ? " rp-active" : ""}`, title: label, "aria-current": current ? "step" : null },
      node.state === "skip" ? h("span", { "aria-hidden": "true" }, "–") : icon(node.state === "bad" ? "x" : STEP_ICON[node.key]),
      h("span", { class: "sr-only" }, label));
  }));
}

export function flowDiagram(e) {
  const { nodes, summary } = flowState(e);
  const [title, hint, tone] = summary;
  return h(
    "section",
    { class: `flow flow-${tone}`, "aria-label": "결재 흐름" },
    h("div", { class: "flow-head" }, h("span", { class: "flow-now" }, title), h("span", { class: "flow-hint" }, hint)),
    h(
      "ol",
      { class: "flow-track" },
      nodes.map((n) =>
        h(
          "li",
          { class: `fn fn-${n.state}`, "aria-current": n.state === "current" ? "step" : null },
          h("span", { class: "fn-dot", "aria-hidden": "true" }, n.state === "done" ? icon("check") : n.state === "bad" ? icon("x") : n.state === "skip" ? "–" : n.state === "current" ? h("i", {}) : null),
          h("span", { class: "fn-label" }, n.label, n.sub ? h("small", {}, n.sub) : null),
          h("span", { class: "fn-note" }, n.note || " "),
        ),
      ),
    ),
  );
}
