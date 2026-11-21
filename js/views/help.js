// 도움말 — 결재 흐름, 역할별 안내, 자주 묻는 질문, 현재 AI 적격 정책.
import { api } from "../api.js?v=6927aa5";
import { ACCOUNTS, ROLE, chip, clear, dateTime, h, icon, spinner, policyVer } from "../ui.js?v=6927aa5";
import { BUILD, VERSION } from "../version.js?v=6927aa5";
import { pageHeader } from "./shell.js?v=6927aa5";

// ── 역할 → 다이어그램 레인 ──
const LANES = [
  { id: "staff", title: "지국 담당자", sub: "업로드 · 작성 · 제출", step: "증빙 제출", icon: "send", roles: ["staff"] },
  { id: "ai", title: "AI 1차 검증", sub: "재무·IMC 정책 자동 적용", step: "AI 검증", icon: "shield", roles: [] },
  { id: "imc", title: "보도IMC팀", sub: "적격 / 비적격 분류", step: "적격 분류", icon: "list", roles: ["imc"] },
  { id: "chief", title: "보도국장", sub: "보도본부장 동일 권한", step: "비적격 전결", icon: "user", roles: ["bureau_chief", "division_head"] },
  { id: "fin", title: "재무팀", sub: "최종 검토 · 결재", step: "최종 결재", icon: "check", roles: ["finance", "admin"] },
];

const MY_TASK = {
  staff: "AI가 읽은 날짜·금액·적요를 원본과 맞춰 보고 제출하세요. 반려된 증빙은 사유를 확인해 수정하거나 소명한 뒤 다시 제출할 수 있습니다.",
  imc: "원본과 AI 판정 근거를 확인해 적격·비적격을 분류하세요. 적격 증빙은 재무팀으로, 비적격 증빙은 사유와 함께 보도국장에게 보냅니다.",
  bureau_chief: "비적격 증빙의 사유를 확인해 전결하세요. 승인하면 재무팀에 넘어가고, 불승인하면 종결됩니다.",
  division_head: "보도국장과 같은 권한으로 비적격 증빙을 전결합니다. 승인하면 재무팀에 넘어가고, 불승인하면 종결됩니다.",
  finance: "원본과 정산 금액을 최종 확인한 뒤 결재하세요. 결재 완료분은 정산 출력에서 받을 수 있습니다.",
  admin: "재무팀과 같은 최종 검토 단계를 처리할 수 있고, 지국별 분기 한도와 AI 적격 정책을 설정합니다.",
};

const FAQ = [
  ["AI 1차 적격 검증은 무엇인가요?", "보도IMC팀과 재무팀이 계정(취재비·경상비·차량유지비)별로 정한 '이런 경우 비적격' 기준을 AI 가 먼저 적용합니다. 증빙을 올리면 바로 판정해 위반이면 '검토 필요'로 알려 주고, 제출할 때 다시 판정해 위반이면 결재선에 올리지 않고 자동 반려합니다. 사람이 모든 영수증의 기준 위반 여부를 일일이 보지 않아도 되도록, AI 판정과 근거가 증빙과 결재 이력에 남습니다."],
  ["AI 가 잘못 반려한 것 같아요.", "업무상 필요한 지출이면 증빙을 열어 [IMC팀에 제출] 할 때 소명을 적으세요. 소명과 함께 보도IMC팀으로 넘어가 사람이 판단합니다. AI 는 정책에 적힌 기준만 쓰고, 판단할 정보가 부족하면 막지 않고 '판단 보류'로 결재자에게 넘깁니다."],
  ["AI 적격 정책은 누가 정하나요?", "보도IMC팀과 재무팀이 함께 관리합니다. 적용 중인 기준은 이 화면의 [현재 AI 적격 정책]에서 확인할 수 있습니다."],
  ["반려되면 어떻게 되나요?", "어느 결재 단계에서든 사유를 적어 지국으로 반려할 수 있습니다. 증빙 상세 맨 위에 반려 사유가 표시되고, 지국 담당자가 고쳐서 다시 제출하면 보도IMC팀 분류부터 다시 시작합니다. 지난 결재 이력은 증빙에 그대로 남습니다."],
  ["분기 한도를 넘으면 제출할 수 없나요?", "제출은 됩니다. 한도를 넘은 금액만큼이 비적격으로 처리되고, 그런 증빙은 보도IMC팀이 적격으로 분류할 수 없어 보도국장 전결을 거칩니다. 한도는 보도IMC팀이 지국·계정별로 설정합니다."],
  ["결재가 끝난 증빙의 한도 금액이 바뀌기도 하나요?", "아니요. 보도국장·재무팀 단계로 넘어간 증빙과 결재 완료 증빙은 그때의 적격/비적격 금액이 고정됩니다(재무팀이 금액을 고치면 다시 계산). 아직 보도IMC팀이 분류하기 전인 증빙은 한도를 바꾸면 새 한도로 다시 계산됩니다. 나중에 앞선 날짜의 영수증이 들어오면 그 영수증이 남은 한도를 쓰고, 한도가 찼다면 그 영수증이 비적격이 됩니다."],
  ["원화 영수증은 한도에 들어가나요?", "한도 판정에는 들어가지 않습니다. 지국 통화(뉴욕은 달러)와 다른 통화 영수증은 한도 현황에 현재 환율로 환산해 '참고용'으로만 더해 보이고, 적격/비적격 계산에서는 빠집니다. 환산액은 정산 시점 환율과 다를 수 있습니다."],
  ["정산 분기는 어떻게 정해지나요?", "영수증 사용일이 속한 분기로 자동 지정됩니다. 다른 분기에 정산해야 하면 지국 담당자가 증빙에서 분기를 직접 바꿀 수 있고, 직접 바꾼 분기는 사용일을 고쳐도 따라 바뀌지 않습니다."],
  ["제출한 증빙을 고치고 싶어요.", "보도IMC팀이 분류하기 전(보도IMC 결재중)이면 증빙을 열어 [제출 취소]로 되돌린 뒤 고쳐서 다시 제출하세요. 이미 분류됐다면 수정할 수 없으니 보도IMC팀·보도국장·재무팀에 반려를 요청하세요. 반려되면 다시 고쳐서 제출할 수 있습니다."],
  ["결재를 잘못 눌렀어요.", "각 팀은 자기 팀이 마지막으로 한 결재(승인·분류·불승인)를 다음 단계가 처리하기 전까지 증빙 상세의 [내 결재 취소]로 되돌릴 수 있습니다. 취소하면 직전 단계로 돌아가고 이력에 남습니다. 다음 단계가 이미 처리했다면 그 담당자에게 반려를 요청하세요."],
  ["촬영만 하고 제출하지 않으면 어떻게 되나요?", "사진과 수정값은 촬영앱 초안에 저장됩니다. 이어쓰기 링크에서 작성한 내용을 불러올 수 있고, 최종 제출하면 관리웹 증빙 목록에 등록됩니다."],
  ["월별 정산과 분기별 정산 중 무엇으로 하나요?", "보도IMC팀·재무팀이 '한도·정산 설정'에서 정합니다. 바꾸면 증빙 조회·결재함·한도·정산 출력이 그 단위로 바뀝니다. 한도는 분기 값으로 저장하고 월별이면 분기 ÷ 3 으로 계산합니다. 기간은 영수증 사용일 기준이며 증빙에서 직접 바꿀 수 있습니다."],
  ["취재비·경상비·차량유지비 말고 다른 영수증은요?", "통신비·급여·임차료 등 모든 영수증을 같은 방법으로 올립니다(계정에서 '기타 계정' 선택). 기타 계정은 AI 검증·한도·결재 없이 '제출 완료(보관)'되고, 정산 출력의 정산서 시트에 계정별로 합산됩니다. 우편 발송은 필요 없습니다."],
  ["전표에 붙일 증빙은 어떻게 받나요?", "'정산 출력'에서 계정별 [증빙 PDF]를 누르면 원본을 엑셀과 같은 번호·순서로 한 쪽에 한 장씩 모은 PDF 를 받습니다."],
  ["여기서 말하는 '결재'는 ERP 전표 결재인가요?", "아니요. 이 시스템 안의 결재(보도IMC팀 분류 → 보도국장 전결 → 재무팀 최종 결재)입니다. ERP 전표 결재는 별도로 진행합니다."],
  ["정산 엑셀은 어떻게 받나요?", "왼쪽 '정산 출력' 메뉴에서 기간을 고르고 [엑셀 내려받기]를 누르세요(지국 담당자·보도IMC팀·재무팀). 재무팀 양식 그대로 정산서 시트(규정액·기타 계정 합계 자동 집계)와 세부내역 3개 시트(결재 완료분)가 나옵니다. 원화 등은 현재 환율로 환산해 넣고 세부사용내역에 원래 금액을 적습니다."],
  ["같은 영수증을 두 번 올렸어요.", "같은 파일이거나 같은 주문·같은 날짜·같은 금액·같은 가게로 판단되면 새 증빙을 만들지 않고 기존 증빙에 합쳐지고, 증빙에 알림이 남습니다."],
];

// ── SVG 헬퍼 (CSP 때문에 style 속성 대신 클래스·SVG 속성만 사용) ──
const NS = "http://www.w3.org/2000/svg";
function s(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) el.setAttribute(k, v);
  for (const k of kids.flat()) if (k !== null && k !== undefined) el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return el;
}

const W = 1020;
const LANE_H = 130;
const NODE = { w: 180, h: 64 };
const laneY = (i) => i * LANE_H;
const nodeY = (i) => laneY(i) + 33;
const cy = (i) => nodeY(i) + NODE.h / 2;

function node(x, lane, title, sub, cls) {
  return s("g", { class: `dg-node ${cls || ""}` }, s("rect", { x, y: nodeY(lane), width: NODE.w, height: NODE.h, rx: 10 }),
    s("text", { x: x + NODE.w / 2, y: nodeY(lane) + 27, class: "dg-title", "text-anchor": "middle" }, title),
    s("text", { x: x + NODE.w / 2, y: nodeY(lane) + 47, class: "dg-sub", "text-anchor": "middle" }, sub));
}
const path = (d, cls = "") => s("path", { d, class: `dg-line ${cls}`, "marker-end": `url(#${cls.includes("back") ? "arr-back" : cls.includes("ok") ? "arr-ok" : cls.includes("bad") ? "arr-bad" : cls.includes("ai") ? "arr-ai" : "arr"})` });
const label = (x, y, text, cls = "") => s("text", { x, y, class: `dg-label ${cls}` }, text);

function diagram(role) {
  const mine = LANES.findIndex((l) => l.roles.includes(role));
  const X = 430; // 중앙 열 (제출·분류·비적격 전결·최종 검토)
  const defs = s("defs", {}, ...[["arr", "dg-head"], ["arr-ok", "dg-head ok"], ["arr-bad", "dg-head bad"], ["arr-back", "dg-head back"], ["arr-ai", "dg-head ai"]].map(([id, cls]) =>
    s("marker", { id, viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" }, s("path", { d: "M0 0 L10 5 L0 10 z", class: cls }))));

  const lanes = LANES.map((l, i) =>
    s("g", { class: `dg-lane lane-${l.id}${i === mine ? " me" : ""}` },
      s("rect", { x: 0, y: laneY(i), width: W, height: LANE_H, class: "dg-lane-bg" }),
      s("rect", { x: 0, y: laneY(i), width: 150, height: LANE_H, class: "dg-lane-head" }),
      s("text", { x: 14, y: laneY(i) + 56, class: "dg-lane-title" }, l.title),
      s("text", { x: 14, y: laneY(i) + 76, class: "dg-lane-sub" }, l.sub),
      i === mine ? s("text", { x: 14, y: laneY(i) + 100, class: "dg-lane-me" }, "◀ 내 업무") : null));

  // 레인: 0 지국 · 1 AI · 2 보도IMC · 3 보도국장 · 4 재무팀
  const [ST, AI, IMC, CH, FIN] = [0, 1, 2, 3, 4];
  const lines = [
    path(`M380 ${cy(ST)} H${X}`), // 작성 → 제출
    path(`M${X + 90} ${nodeY(ST) + NODE.h} V${nodeY(AI)}`), // 제출 → AI 검증
    path(`M${X + 90} ${nodeY(AI) + NODE.h} V${nodeY(IMC)}`, "ok"), // 통과·소명 → 분류
    path(`M${X + 90} ${nodeY(IMC) + NODE.h} V${nodeY(CH)}`, "bad"), // 비적격 → 국장
    path(`M${X + 180} ${cy(CH)} H760`, "bad"), // 불승인
    path(`M${X + 40} ${nodeY(CH) + NODE.h} V${nodeY(FIN)}`, "ok"), // 국장 승인 → 재무
    path(`M${X + 180} ${cy(IMC)} H985 V${laneY(FIN) + 10} H${X + 140} V${nodeY(FIN)}`, "ok"), // 적격 → 재무팀
    path(`M${X + 180} ${cy(FIN)} H760`, "ok"), // 최종 결재 → 완료
    // 반려 — AI(자동)·보도IMC팀·보도국장·재무팀에서 왼쪽 통로(x=172)를 타고 지국 담당자로
    s("path", { d: `M${X} ${cy(FIN)} H172 V${cy(ST)} H200`, class: "dg-line back", "marker-end": "url(#arr-back)" }),
    s("path", { d: `M${X} ${cy(CH)} H172`, class: "dg-line back" }),
    s("path", { d: `M${X} ${cy(IMC)} H172`, class: "dg-line back" }),
    s("path", { d: `M${X} ${cy(AI)} H172`, class: "dg-line back" }), // AI 자동 반려
    ...[cy(AI), cy(IMC), cy(CH)].map((y) => s("circle", { cx: 172, cy: y, r: 4, class: "dg-dot back" })),
  ];
  const labels = [
    label(X + 98, nodeY(AI) + NODE.h + 36, "통과 · 소명", "ok"),
    label(700, cy(IMC) - 8, "적격 → 재무팀", "ok"), label(X + 98, nodeY(IMC) + NODE.h + 36, "비적격", "bad"),
    label(695, cy(CH) - 8, "불승인", "bad"), label(X + 48, nodeY(CH) + NODE.h + 36, "승인", "ok"),
    label(695, cy(FIN) - 8, "최종 결재", "ok"), label(765, laneY(FIN) + 2, "적격 분류 완료", "ok"),
    label(215, cy(AI) - 8, "정책 위반 → 자동 반려 (소명 시 통과)", "back"),
    label(250, cy(IMC) - 8, "반려 (사유 필수)", "back"), label(250, cy(CH) - 8, "반려 (사유 필수)", "back"), label(250, cy(FIN) - 8, "반려 (사유 필수)", "back"),
  ];
  const nodes = [
    node(200, ST, "① 업로드 · 작성", "지국 작성중", "n-staff"),
    node(X, ST, "② 제출", "적요 작성 필수", "n-staff"),
    node(X, AI, "③ AI 적격 검증", "계정별 정책 · 자동 반려", "n-ai"),
    node(X, IMC, "④ 적격 분류", "보도IMC 결재중", "n-imc"),
    node(X, CH, "⑤ 비적격 전결", "보도국장 결재중", "n-chief"),
    node(760, CH, "불승인 · 종결", "지급하지 않음", "n-bad"),
    node(X, FIN, "⑥ 최종 검토", "재무팀 결재중", "n-fin"),
    node(760, FIN, "결재 완료", "정산 출력에 포함", "n-ok"),
  ];
  return s("svg", { class: "dg", viewBox: `0 0 ${W} ${LANES.length * LANE_H}`, role: "img", "aria-label": "EASY SCAN 결재선 다이어그램: 지국 제출, AI 1차 적격 검증(정책 위반이면 자동 반려, 소명하면 통과), 보도IMC팀 적격 분류, 적격은 재무팀 최종 결재, 비적격은 보도국장 전결 후 재무팀 최종 결재" },
    defs, lanes, lines, nodes, labels);
}

export function renderHelp(el, { me }) {
  el.append(
    pageHeader({ title: "도움말" }),
    h("div", { class: "help-sections" },
      h("section", { class: "card help-overview", "aria-labelledby": "help-flow-title" },
        h("h2", { class: "help-title", id: "help-flow-title" }, "결재 흐름"),
        h("ol", { class: "help-flow" }, LANES.map((lane) =>
          h("li", { class: `help-flow-step${lane.roles.includes(me.role) ? " is-mine" : ""}` },
            h("span", { class: "help-step-icon" }, icon(lane.icon)),
            h("div", {}, h("b", {}, lane.step), h("small", {}, lane.id === "ai" ? "계정별 정책 확인" : lane.title))))),
        MY_TASK[me.role] ? h("div", { class: "help-role" }, icon("user"),
          h("div", {}, h("h3", {}, "내 역할", h("span", {}, ROLE[me.role] || me.role)), h("p", {}, MY_TASK[me.role]))) : null,
        h("details", { class: "help-diagram help-disclosure" },
          h("summary", {}, h("span", {}, icon("list"), "상세 결재선 보기"), icon("chevron", "ic help-chevron")),
          h("div", { class: "dg-legend" }, h("span", { class: "lg ok" }, "승인·적격"), h("span", { class: "lg bad" }, "비적격·불승인"), h("span", { class: "lg back" }, "반려")),
          h("div", { class: "dg-wrap", tabindex: "0", role: "region", "aria-label": "상세 결재선" }, diagram(me.role)))),
      policyCard(),
      h("section", { class: "card help-faq", "aria-labelledby": "help-faq-title" },
        h("h2", { class: "help-title", id: "help-faq-title" }, "자주 묻는 질문"),
        h("div", { class: "faq" }, FAQ.map(([q, a]) => h("details", { class: "faq-item" },
          h("summary", {}, h("span", {}, q), icon("chevron", "ic faq-ic")), h("p", {}, a))))),
    ),
    h("p", { class: "muted small help-foot" }, `EASY SCAN 관리웹 v${VERSION}${BUILD === "dev" ? " · dev" : ` · ${BUILD}`} — 문의: 보도IMC팀`),
  );
}

// 현재 AI 적격 정책(읽기 전용) — 지국 담당자도 무엇이 비적격인지 알 수 있게
function policyCard() {
  const box = h("div", {}, h("div", { class: "card-loading" }, spinner(true)));
  api
    .get("/policies")
    .then((p) => {
      clear(box).append(
        !p.enabled
          ? h("p", { class: "muted small" }, "AI 1차 적격 검증이 꺼져 있습니다. 증빙은 AI 검증 없이 보도IMC팀으로 갑니다.")
          : h("div", { class: "policy-read" }, ACCOUNTS.map((a) => {
              const x = p.accounts[a] || {};
              const lines = (x.rules || "").split("\n").map((l) => l.replace(/^\s*[-·•]\s*/, "").trim()).filter(Boolean);
              const on = x.enabled !== false && lines.length > 0;
              return h("div", { class: "policy-read-acc" },
                h("div", { class: "policy-read-head" }, h("b", {}, a), on ? chip(`${lines.length}개 기준`, "info") : chip("적용 안 함", "muted")),
                on ? h("ul", { class: "tips" }, lines.map((l) => h("li", {}, l))) : h("p", { class: "muted small" }, "이 계정은 AI 정책 검증을 하지 않습니다."));
            })),
        p.version ? h("p", { class: "muted small policy-read-foot" }, `정책 ${policyVer(p.version)} · ${p.updatedTeam ? `최종 수정 ${p.updatedTeam} · ` : ""}${dateTime(p.updatedAt)} · 보도IMC팀·재무팀 공용 관리`) : null,
      );
    })
    .catch(() => clear(box).append(h("p", { class: "muted small" }, "정책을 불러오지 못했습니다.")));
  return h("details", { class: "card help-policy help-disclosure" },
    h("summary", {}, h("span", {}, icon("shield"), "현재 AI 적격 정책"), icon("chevron", "ic help-chevron")),
    h("div", { class: "help-policy-body" }, box));
}
