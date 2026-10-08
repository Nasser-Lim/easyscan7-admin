// 도움말 — EASY SCAN 결재선 다이어그램(역할별 레인 + AI 1차 검증), 상태 안내, 내 역할 안내, 현재 AI 적격 정책, 자주 묻는 질문. 전 계정 공통.
import { api } from "../api.js";
import { ACCOUNTS, ROLE, STATUS, chip, clear, dateTime, h, icon, spinner } from "../ui.js";
import { BUILD, VERSION } from "../version.js";
import { pageHeader } from "./shell.js";

// ── 역할 → 다이어그램 레인 ──
const LANES = [
  { id: "staff", title: "지국 담당자", sub: "업로드 · 작성 · 제출", roles: ["staff"] },
  { id: "ai", title: "AI 1차 검증", sub: "재무·IMC 정책 자동 적용", roles: [] },
  { id: "imc", title: "보도IMC팀", sub: "적격 / 비적격 분류", roles: ["imc"] },
  { id: "chief", title: "보도국장", sub: "보도본부장 동일 권한", roles: ["bureau_chief", "division_head"] },
  { id: "fin", title: "재무팀", sub: "최종 검토 · 결재", roles: ["finance", "admin"] },
];

const MY_TASK = {
  staff: "증빙을 올리고(관리웹·촬영앱) AI 가 읽은 날짜·금액·적요를 원본과 대조해 제출합니다. AI 가 정책 위반으로 판단한 증빙은 고치거나, 업무상 필요한 지출이면 소명을 적어 제출하세요(소명 없이 내면 자동 반려). 반려되면 사유를 확인하고 고쳐서 다시 제출하세요.",
  imc: "AI 1차 검증을 통과했거나 지국이 소명한 증빙을 원본과 대조해 적격 / 비적격으로 분류합니다. 증빙 상세의 AI 판정과 근거를 참고하세요. 적격은 재무팀 최종 검토로, 비적격(사유 필수)은 보도국장 전결로 올라갑니다. 지국별 분기 한도와 AI 적격 정책도 관리합니다.",
  bureau_chief: "보도IMC팀이 비적격으로 분류한 증빙을 결재합니다. 승인하면 재무팀 최종 검토로, 불승인하면 지급하지 않고 종결됩니다. 사유를 적어 반려할 수도 있습니다.",
  division_head: "보도IMC팀이 비적격으로 분류한 증빙을 결재합니다(보도국장과 권한 동일). 승인하면 재무팀 최종 검토로, 불승인하면 지급하지 않고 종결됩니다.",
  finance: "결재선을 거친 증빙을 최종 검토하고 결재합니다. 문제가 있으면 사유를 적어 지국으로 반려합니다. 검토 중에는 내용을 정정할 수 있습니다. 보도IMC팀과 함께 AI 적격 정책(계정별 비적격 기준)을 관리합니다.",
  admin: "재무팀과 같은 최종 검토 단계를 처리할 수 있고, 지국별 분기 한도와 AI 적격 정책을 설정합니다.",
};

const STATUS_GUIDE = [
  ["draft", "지국 담당자", "증빙을 원본과 대조·수정한 뒤 제출", "AI 1차 검증 → 보도IMC 결재중"],
  ["flagged", "지국 담당자", "검증 경고(날짜·금액·적요, AI 정책 위반 등)를 확인하고 수정·제출", "AI 1차 검증 → 보도IMC 결재중"],
  ["returned", "지국 담당자", "반려 사유(AI 자동 반려 포함)를 확인하고 고쳐서, 또는 소명을 적어 다시 제출", "AI 1차 검증 → 보도IMC 결재중"],
  ["submitted", "보도IMC팀", "적격 / 비적격 분류 (비적격은 사유 필수)", "적격 → 재무팀 결재중 · 비적격 → 보도국장 결재중"],
  ["chief_review", "보도국장·보도본부장", "승인 / 불승인(사유 필수) / 반려", "승인 → 재무팀 결재중 · 불승인 → 종결"],
  ["finance_review", "재무팀", "증빙 최종 검토 후 결재 (정정 가능)", "결재 완료"],
  ["approved", "—", "결재가 끝났습니다. 정산서에 포함됩니다", "종결"],
  ["rejected", "—", "비적격 증빙으로 지급하지 않기로 결재됐습니다", "종결 (한도에서도 빠짐)"],
];

const FAQ = [
  ["AI 1차 적격 검증은 무엇인가요?", "보도IMC팀과 재무팀이 계정(취재비·경상비·차량유지비)별로 정한 '이런 경우 비적격' 기준을 AI 가 먼저 적용합니다. 증빙을 올리면 바로 판정해 위반이면 '검토 필요'로 알려 주고, 제출할 때 다시 판정해 위반이면 결재선에 올리지 않고 자동 반려합니다. 사람이 모든 영수증의 기준 위반 여부를 일일이 보지 않아도 되도록, AI 판정과 근거가 증빙과 결재 이력에 남습니다."],
  ["AI 가 잘못 반려한 것 같아요.", "업무상 필요한 지출이면 증빙을 열어 [IMC팀에 제출] 할 때 소명을 적으세요. 소명과 함께 보도IMC팀으로 넘어가 사람이 판단합니다. AI 는 정책에 적힌 기준만 쓰고, 판단할 정보가 부족하면 막지 않고 '판단 보류'로 결재자에게 넘깁니다."],
  ["AI 적격 정책은 누가 정하나요?", "보도IMC팀과 재무팀이 관리웹 'AI 적격 정책' 메뉴에서 함께 관리합니다. 저장하면 바로 적용되고 변경 이력이 남습니다. 현재 정책은 이 도움말 아래에서 누구나 볼 수 있습니다."],
  ["반려되면 어떻게 되나요?", "어느 결재 단계에서든 사유를 적어 지국으로 반려할 수 있습니다. 증빙 상세 맨 위에 반려 사유가 표시되고, 지국 담당자가 고쳐서 다시 제출하면 보도IMC팀 분류부터 다시 시작합니다. 지난 결재 이력은 증빙에 그대로 남습니다."],
  ["분기 한도를 넘으면 제출할 수 없나요?", "제출은 됩니다. 한도를 넘은 금액만큼이 비적격으로 처리되고, 그런 증빙은 보도IMC팀이 적격으로 분류할 수 없어 보도국장 전결을 거칩니다. 한도는 보도IMC팀이 지국·계정별로 설정합니다."],
  ["결재가 끝난 증빙의 한도 금액이 바뀌기도 하나요?", "아니요. 보도IMC팀이 분류한 뒤의 증빙(결재 진행 중·완료)은 그때의 적격/비적격 금액이 고정됩니다. 나중에 앞선 날짜의 영수증이 들어오면 그 영수증이 남은 한도를 쓰고, 한도가 찼다면 그 영수증이 비적격이 됩니다."],
  ["정산 분기는 어떻게 정해지나요?", "영수증 사용일이 속한 분기로 자동 지정됩니다. 다른 분기에 정산해야 하면 지국 담당자가 증빙에서 분기를 직접 바꿀 수 있고, 직접 바꾼 분기는 사용일을 고쳐도 따라 바뀌지 않습니다."],
  ["제출한 증빙을 고치고 싶어요.", "제출 후에는 지국에서 수정할 수 없습니다. 보도IMC팀이나 재무팀에 반려를 요청하세요. 반려되면 다시 고쳐서 제출할 수 있습니다."],
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
    path(`M290 ${nodeY(ST) + NODE.h} V${nodeY(AI)}`, "ai"), // 업로드 → 사전 판정
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
    // AI 자동 반려 — 사전 판정 상자를 가로지르지 않게 상자 위 여백으로 돌아 통로에 합류
    s("path", { d: `M${X} ${nodeY(AI) + 16} H${X - 22} V${laneY(AI) + 18} H172`, class: "dg-line back" }),
    ...[laneY(AI) + 18, cy(IMC), cy(CH)].map((y) => s("circle", { cx: 172, cy: y, r: 4, class: "dg-dot back" })),
  ];
  const labels = [
    label(X + 98, nodeY(AI) + NODE.h + 36, "통과 · 소명", "ok"),
    label(700, cy(IMC) - 8, "적격 → 재무팀", "ok"), label(X + 98, nodeY(IMC) + NODE.h + 36, "비적격", "bad"),
    label(695, cy(CH) - 8, "불승인", "bad"), label(X + 48, nodeY(CH) + NODE.h + 36, "승인", "ok"),
    label(695, cy(FIN) - 8, "최종 결재", "ok"), label(765, laneY(FIN) + 2, "적격 분류 완료", "ok"),
    label(302, laneY(AI) + 13, "정책 위반 → 자동 반려 (소명 시 통과)", "back"),
    label(250, cy(IMC) - 8, "반려 (사유 필수)", "back"), label(250, cy(CH) - 8, "반려 (사유 필수)", "back"), label(250, cy(FIN) - 8, "반려 (사유 필수)", "back"),
  ];
  const nodes = [
    node(200, ST, "① 업로드 · 작성", "지국 작성중 · 검토 필요", "n-staff"),
    node(X, ST, "② 제출", "취재비는 적요 필수", "n-staff"),
    node(200, AI, "사전 판정", "위반이면 검토 필요 표시", "n-ai n-ai-pre"),
    node(X, AI, "③ AI 적격 검증", "계정별 정책 · 자동 반려", "n-ai"),
    node(X, IMC, "④ 적격 분류", "보도IMC 결재중", "n-imc"),
    node(X, CH, "⑤ 비적격 전결", "보도국장 결재중", "n-chief"),
    node(760, CH, "불승인 · 종결", "지급하지 않음", "n-bad"),
    node(X, FIN, "⑥ 최종 검토", "재무팀 결재중", "n-fin"),
    node(760, FIN, "결재 완료", "정산서에 포함", "n-ok"),
  ];
  return s("svg", { class: "dg", viewBox: `0 0 ${W} ${LANES.length * LANE_H}`, role: "img", "aria-label": "EASY SCAN 결재선 다이어그램: 지국 제출, AI 1차 적격 검증(정책 위반이면 자동 반려, 소명하면 통과), 보도IMC팀 적격 분류, 적격은 재무팀 최종 결재, 비적격은 보도국장 전결 후 재무팀 최종 결재" },
    defs, lanes, lines, nodes, labels);
}

export function renderHelp(el, { me }) {
  const lane = LANES.find((l) => l.roles.includes(me.role));
  el.append(
    pageHeader({ crumbs: ["설정"], title: "도움말", desc: "EASY SCAN 에서 증빙이 어떤 결재선을 따라 흐르는지 한눈에 봅니다." }),
    h(
      "section",
      { class: "card" },
      h("div", { class: "card-head" }, h("div", {}, h("div", { class: "card-title" }, "결재선"), h("div", { class: "card-sub" }, "지국에서 올린 증빙이 재무팀 결재까지 가는 길")),
        h("div", { class: "dg-legend" }, h("span", { class: "lg ok" }, "승인·적격"), h("span", { class: "lg bad" }, "비적격·불승인"), h("span", { class: "lg ai" }, "AI 검증"), h("span", { class: "lg back" }, "반려"))),
      h("div", { class: "dg-wrap" }, diagram(me.role)),
      h("ul", { class: "dg-notes" },
        h("li", { class: "dg-note-ai" }, h("b", {}, "AI 가 먼저 적격 여부를 검증합니다."), " 보도IMC팀·재무팀이 정한 계정별 정책으로 업로드 직후 사전 판정하고, 제출할 때 다시 판정해 정책 위반이면 결재선에 올리지 않고 자동 반려합니다. 업무상 필요한 지출은 지국이 소명을 적어 제출하면 사람이 판단합니다. AI 판정과 근거는 증빙과 결재 이력에 남아 결재자가 함께 봅니다."),
        h("li", {}, h("b", {}, "적격 / 비적격은 보도IMC팀이 분류합니다."), " 적격이면 바로 재무팀 최종 검토로, 비적격(사유 필수)이면 보도국장 전결을 거쳐 재무팀으로 갑니다."),
        h("li", {}, h("b", {}, "분기 한도를 넘은 금액이 있는 증빙"), "은 적격으로 분류할 수 없어 보도국장 전결(비적격)을 거칩니다."),
        h("li", {}, h("b", {}, "반려"), "는 어느 결재 단계에서든 가능하며 사유가 필수입니다. 반려되면 지국이 고쳐서 처음 단계부터 다시 제출합니다."),
        h("li", {}, h("b", {}, "보도본부장"), "은 보도국장과 같은 권한으로 ⑤ 단계를 결재합니다.")),
    ),
    h(
      "div",
      { class: "grid-2" },
      h("section", { class: "card" },
        h("div", { class: "card-head" }, h("div", { class: "card-title" }, "내 역할"), chip(ROLE[me.role] || me.role, "info")),
        h("p", { class: "help-task" }, MY_TASK[me.role] || ""),
        lane ? h("p", { class: "muted small" }, `다이어그램에서 「${lane.title}」 줄이 내 업무입니다.`) : null),
      h("section", { class: "card" },
        h("div", { class: "card-head" }, h("div", { class: "card-title" }, "상태 이름 읽는 법")),
        h("p", { class: "help-task" }, "증빙 상태는 「지금 처리해야 하는 쪽 + 행위」로 표시됩니다. 예) ", chip(STATUS.chief_review.label, "info"), " 는 보도국장이 결재할 차례라는 뜻입니다."),
        h("p", { class: "muted small" }, "메뉴의 결재함에는 내 차례인 증빙만 모입니다.")),
    ),
    h(
      "section",
      { class: "card card-flush" },
      h("div", { class: "card-head pad" }, h("div", { class: "card-title" }, "단계별 처리 안내")),
      h("div", { class: "table-wrap" },
        h("table", { class: "table" },
          h("thead", {}, h("tr", {}, h("th", {}, "증빙 상태"), h("th", {}, "처리 주체"), h("th", {}, "할 일"), h("th", {}, "다음"))),
          h("tbody", {}, STATUS_GUIDE.map(([st, who, todo, next]) =>
            h("tr", {}, h("td", {}, h("span", { class: `chip ${STATUS[st].cls}` }, STATUS[st].label)), h("td", { class: "strong" }, who), h("td", {}, todo), h("td", { class: "cell-sub" }, next)))))),
    ),
    policyCard(),
    h(
      "section",
      { class: "card" },
      h("div", { class: "card-head" }, h("div", { class: "card-title" }, "자주 묻는 질문")),
      h("div", { class: "faq" }, FAQ.map(([q, a]) => h("details", { class: "faq-item" }, h("summary", {}, icon("chevron", "ic faq-ic"), q), h("p", {}, a)))),
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
        p.version ? h("p", { class: "muted small policy-read-foot" }, `정책 v${p.version} · ${dateTime(p.updatedAt)} 저장 · 보도IMC팀·재무팀 관리`) : null,
      );
    })
    .catch(() => clear(box).append(h("p", { class: "muted small" }, "정책을 불러오지 못했습니다.")));
  return h("section", { class: "card" }, h("div", { class: "card-head" }, h("div", { class: "card-title" }, "현재 AI 적격 정책"), h("span", { class: "muted small" }, "이 기준으로 AI 가 1차 검증합니다")), box);
}
