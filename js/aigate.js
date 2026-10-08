// AI 1차 적격 검증(gate) 표시 — 증빙 상세 패널, 목록용 작은 표식.
// 판정은 서버(services/ai_gate.py)가 한다: 업로드 직후 사전 판정, 제출할 때 최종 판정(위반이면 자동 반려, 소명하면 사람 결재로).
import { AI_VERDICT, aiKey, chip, dateTime, h, icon } from "./ui.js";

// 목록 상태 칸 아래 한 줄 — 통과·정책 없음은 조용히, 확인이 필요한 판정만 보인다
export function aiGateMark(gate) {
  const k = aiKey(gate);
  if (!k || k === "pass" || k === "skipped") return null;
  return h("div", { class: `ai-mark ai-${AI_VERDICT[k].tone}` }, icon("shield"), AI_VERDICT[k].label, gate.stale ? " · 재검증 예정" : "");
}

// 증빙 상세 맨 위 패널. audience: "staff" | "reviewer"
export function aiGatePanel(gate, audience) {
  const k = aiKey(gate);
  if (!k) return null;
  const v = AI_VERDICT[k];
  const lead = {
    pass: "재무팀·보도IMC팀이 정한 정책을 AI 가 먼저 확인했고, 위반 사항이 없었습니다.",
    fail: audience === "staff"
      ? "정책 위반으로 판단했습니다. 그대로 제출하면 자동 반려됩니다. 내용을 고치거나, 정당한 사유가 있으면 제출할 때 소명을 적어 주세요."
      : "AI 가 정책 위반으로 판단한 증빙입니다.",
    override: audience === "staff"
      ? "AI 는 정책 위반으로 판단했지만 소명을 적어 제출했습니다. 결재자가 소명을 보고 판단합니다."
      : "AI 는 정책 위반으로 판단했지만 지국이 소명을 적어 제출했습니다. 소명이 타당한지 확인해 주세요.",
    uncertain: "증빙 정보만으로는 정책 위반 여부를 판단하지 못했습니다. 결재자가 직접 확인합니다.",
    skipped: "이 계정에는 아직 AI 적격 정책이 없습니다. 결재자가 직접 확인합니다.",
    error: "AI 검증을 하지 못했습니다. 결재자가 직접 확인합니다.",
  }[k];
  return h(
    "section",
    { class: `ai-panel ai-panel-${v.tone}` },
    h("div", { class: "ai-panel-head" }, icon("shield"), h("b", {}, "AI 1차 적격 검증"), chip(v.label.replace(/^AI /, ""), v.tone), gate.stale ? h("span", { class: "muted small" }, "내용이 바뀌어 제출할 때 다시 검증합니다") : null),
    h("p", { class: "ai-panel-lead" }, lead),
    gate.summary && k !== "skipped" ? h("p", { class: "ai-panel-sum" }, gate.summary) : null,
    gate.violations?.length
      ? h("ul", { class: "ai-viol" }, gate.violations.map((x) => h("li", {}, h("span", { class: "ai-viol-rule" }, x.rule), h("span", { class: "ai-viol-why" }, x.reason))))
      : null,
    gate.override ? h("div", { class: "ai-override" }, h("b", {}, "지국 소명"), h("span", {}, gate.override.justification), h("span", { class: "muted small" }, `${gate.override.by || ""} · ${dateTime(gate.override.at)}`)) : null,
    h("div", { class: "ai-panel-foot muted small" }, `정책 v${gate.policyVersion ?? "-"} · ${dateTime(gate.checkedAt)} 판정`),
  );
}
