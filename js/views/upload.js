// 증빙 업로드 — PDF·스크린샷 여러 개를 한 번에 올리면 AI 가 증빙으로 나눈다(POST /intake).
// 정산 분기는 항상 영수증 날짜 기준(자동). 업로드 진행·처리 결과 보관은 uploadjob.js 가 맡는다.
import {
  ACCOUNTS, BRANCH, DOC_TYPE, bytes, chip, clear, currentQuarter, field, h, icon, money, noticeParts,
  quarterLabel, select, statusChip, toast,
} from "../ui.js";
import { aiGateMark } from "../aigate.js";
import { getPeriod, periodSwitch } from "../period.js";
import { dismiss, dismissAll, getQueue, isBusy, startUpload, subscribe } from "../uploadjob.js";
import { limitsCard } from "./limits.js";
import { pageHeader } from "./shell.js";

const MAX_FILES = 20;
const MAX_BYTES = 20 * 1024 * 1024;
const TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"];
const SKIP_REASON = { unsupported: "형식 미지원", too_large: "용량 초과", duplicate_file: "이미 올린 파일", duplicate_in_batch: "중복 선택" };

export function renderUpload(el, { me, go }) {
  let files = [];
  const branch = `${BRANCH[me.branchId] || me.branchId}지국`;

  const account = select(ACCOUNTS.map((a) => [a, a]), ACCOUNTS[0]);
  const input = h("input", { type: "file", multiple: true, accept: ".pdf,.jpg,.jpeg,.png,.webp,.heic,application/pdf,image/*", class: "sr-only" });
  const list = h("div", { class: "file-list" });
  const submit = h("button", { class: "btn btn-primary btn-lg", type: "button", disabled: true }, icon("upload"), h("span", {}, "업로드하고 자동 인식"));
  const summary = h("div", { class: "upload-summary muted" });
  const queueSlot = h("div", { class: "stack" });
  const limitsSlot = h("div", {});

  const drop = h(
    "div",
    {
      class: "dropzone",
      tabindex: "0",
      role: "button",
      "aria-label": "파일 선택",
      onclick: () => !isBusy() && input.click(),
      onkeydown: (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), !isBusy() && input.click()),
      ondragover: (e) => (e.preventDefault(), drop.classList.add("over")),
      ondragleave: () => drop.classList.remove("over"),
      ondrop: (e) => {
        e.preventDefault();
        drop.classList.remove("over");
        if (!isBusy()) add([...e.dataTransfer.files]);
      },
    },
    icon("upload", "ic dropzone-ic"),
    h("div", { class: "dropzone-title" }, "파일을 끌어다 놓거나 클릭해서 선택"),
    h("div", { class: "dropzone-desc" }, `PDF · JPG · PNG · WEBP · HEIC — 한 번에 ${MAX_FILES}개, 합계 25쪽, 파일당 20MB까지`),
  );
  input.addEventListener("change", () => {
    add([...input.files]);
    input.value = "";
  });

  function add(picked) {
    for (const f of picked) {
      const ok = TYPES.includes(f.type) || /\.(pdf|jpe?g|png|webp|heic)$/i.test(f.name);
      if (!ok) {
        toast(`${f.name}: 지원하지 않는 형식입니다`, "warn");
        continue;
      }
      if (f.size > MAX_BYTES) {
        toast(`${f.name}: 20MB를 넘습니다`, "warn");
        continue;
      }
      if (files.some((x) => x.name === f.name && x.size === f.size)) continue;
      if (files.length >= MAX_FILES) {
        toast(`한 번에 ${MAX_FILES}개까지 올릴 수 있습니다`, "warn");
        break;
      }
      files.push(f);
    }
    paint();
  }

  function paint() {
    const busy = isBusy();
    clear(list);
    files.forEach((f, i) =>
      list.append(
        h(
          "div",
          { class: "file-row" },
          icon(/pdf$/i.test(f.type) || /\.pdf$/i.test(f.name) ? "pdf" : "image", "ic file-ic"),
          h("div", { class: "file-meta" }, h("div", { class: "file-name" }, f.name), h("div", { class: "file-size" }, bytes(f.size))),
          h("button", { class: "icon-btn", type: "button", title: "빼기", disabled: busy, onclick: () => (files.splice(i, 1), paint()) }, icon("x")),
        ),
      ),
    );
    const total = files.reduce((a, f) => a + f.size, 0);
    summary.textContent = files.length ? `${files.length}개 파일 · ${bytes(total)}` : "선택한 파일이 없습니다";
    submit.disabled = busy || !files.length;
    account.disabled = busy;
  }

  function paintQueue() {
    clear(queueSlot);
    const q = getQueue();
    if (!q.length) return;
    queueSlot.append(
      h(
        "div",
        { class: "queue-head" },
        h(
          "div",
          {},
          h("div", { class: "card-title" }, `처리 결과 · 확인 대기 ${q.length}건`),
          h("div", { class: "card-sub" }, "증빙은 이미 '작성중'으로 저장되어 있습니다. 결과를 확인했으면 [확인 완료]로 목록에서 치우세요. 이 탭을 닫기 전까지는 다른 메뉴에 다녀와도 남아 있습니다."),
        ),
        q.length > 1 ? h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: dismissAll }, icon("check"), h("span", {}, "모두 확인 완료")) : null,
      ),
      ...q.map((b) => batchView(b, go)),
    );
  }

  submit.addEventListener("click", async () => {
    if (!files.length || isBusy()) return;
    const picked = files;
    paint();
    const ok = await startUpload(picked, account.value);
    if (ok) files = files.filter((f) => !picked.includes(f));
    if (queueSlot.isConnected) paint();
  });

  // 업로드가 끝나거나 결과를 치우면 다시 그린다. 이 화면을 떠나면(슬롯이 문서에서 빠지면) 구독을 끊는다.
  const off = subscribe((event) => {
    if (!queueSlot.isConnected) return off();
    paintQueue();
    paint();
    if (event === "done") {
      clear(limitsSlot).append(limitsCard(getPeriod()));
      queueSlot.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  limitsSlot.append(limitsCard(getPeriod()));

  el.append(
    pageHeader({
      crumbs: [branch, "업무"],
      title: "증빙 업로드",
      desc: "PDF·스크린샷 증빙을 올리면 AI 가 영수증 단위로 나눠 증빙으로 등록합니다. 촬영 영수증은 촬영앱을 이용하세요.",
      // 오른쪽 분기 한도 현황을 볼 분기. 증빙의 정산 분기는 이와 무관하게 영수증 날짜로 정해진다
      actions: [periodSwitch((q) => clear(limitsSlot).append(limitsCard(q)))],
    }),
    h(
      "div",
      { class: "grid-main" },
      h(
        "div",
        { class: "stack" },
        h(
          "section",
          { class: "card" },
          h("div", { class: "card-head" }, h("div", { class: "card-title" }, "1. 정산 구분")),
          h("div", { class: "field-narrow" }, field("계정", account, "이번에 올리는 증빙 전체에 적용됩니다. 정산 분기는 영수증 날짜를 기준으로 자동 지정됩니다.")),
        ),
        h(
          "section",
          { class: "card" },
          h("div", { class: "card-head" }, h("div", { class: "card-title" }, "2. 증빙 파일")),
          drop,
          input,
          list,
          h("div", { class: "upload-foot" }, summary, submit),
        ),
        queueSlot,
      ),
      h("div", { class: "stack" }, limitsSlot, tipsCard()),
    ),
  );
  paint();
  paintQueue();
}

function tipsCard() {
  return h(
    "section",
    { class: "card" },
    h("div", { class: "card-head" }, h("div", { class: "card-title" }, "올리기 전에")),
    h(
      "ul",
      { class: "tips" },
      h("li", {}, "주문 내역·결제 확인·배송 안내처럼 같은 주문의 여러 장 증빙은 한 번에 올리면 1건으로 합쳐집니다."),
      h("li", {}, "이미 등록된 증빙(주문번호·금액 동일)을 다시 올리면 새 증빙 없이 기존 증빙에 합쳐지고 알려 드립니다."),
      h("li", {}, "광고·약관 같은 증빙이 아닌 입력은 자동으로 제외됩니다."),
      h("li", {}, "분기 한도를 넘는 금액은 비적격 처리되며, 제출은 막지 않습니다."),
      h("li", {}, h("b", {}, "AI 가 재무팀·보도IMC팀이 정한 정책으로 적격 여부를 먼저 검증합니다."), " 위반이면 검토 필요로 표시되고, 그대로 제출하면 자동 반려됩니다. 정당한 사유가 있으면 제출할 때 소명을 적어 주세요."),
    ),
  );
}

function whenText(at) {
  const d = new Date(at);
  const time = d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  return d.toDateString() === new Date().toDateString() ? time : `${d.getMonth() + 1}/${d.getDate()} ${time}`;
}

// 업로드 1회의 처리 결과(큐 항목).
function batchView(b, go) {
  const r = b.result;
  const cur = r.entries.find((e) => e.currency)?.currency || "USD";
  const parts = [];
  parts.push(
    h(
      "div",
      { class: "result-stats" },
      stat("등록된 증빙", r.entries.length, "ok"),
      stat("기존 증빙에 병합", r.merged.length, r.merged.length ? "info" : "neutral"),
      stat("건너뛴 파일", r.skippedFiles.length, r.skippedFiles.length ? "warn" : "neutral"),
      stat("제외된 쪽", r.ignored.length, "neutral"),
    ),
  );

  if (r.entries.length) {
    parts.push(
      h(
        "div",
        { class: "result-table" },
        h(
          "table",
          { class: "table" },
          h("thead", {}, h("tr", {}, h("th", {}, "사용일"), h("th", {}, "분기"), h("th", {}, "가맹점"), h("th", {}, "증빙"), h("th", { class: "num" }, "금액"), h("th", {}, "등록 시 상태"), h("th", {}))),
          h(
            "tbody",
            {},
            r.entries.map((e) =>
              h(
                "tr",
                { class: "row-link", onclick: () => go(`entries/${e.entryId}`) },
                h("td", { class: "mono" }, e.txnDate || "—"),
                h("td", { class: "cell-sub" }, quarterLabel(e.quarter)),
                h("td", {}, h("div", { class: "cell-main" }, e.merchantKo || e.merchant || "—"), h("div", { class: "cell-sub" }, DOC_TYPE[e.docType] || e.docType || "")),
                h("td", { class: "cell-sub" }, e.fileNames.join(", ")),
                h(
                  "td",
                  { class: "num" },
                  money(e.amount, e.currency),
                  e.ineligibleAmount > 0 ? h("div", { class: "cell-sub text-bad" }, `비적격 ${money(e.ineligibleAmount, e.currency)}`) : null,
                ),
                h("td", {}, statusChip(e.status), aiGateMark(e.aiGate) || (e.flagCount ? h("div", { class: "cell-sub" }, `규칙 ${e.flagCount}건`) : null)),
                h("td", { class: "cell-action" }, icon("chevron")),
              ),
            ),
          ),
        ),
      ),
    );
  }

  const notes = [];
  const qs = [...new Set(r.entries.map((e) => e.quarter))].sort();
  if (qs.length > 1 || (qs.length === 1 && qs[0] !== currentQuarter()))
    notes.push(note("info", "정산 분기", `영수증 날짜에 따라 ${qs.map((q) => `${quarterLabel(q)} ${r.entries.filter((e) => e.quarter === q).length}건`).join(", ")}으로 나뉘었습니다. 증빙 조회(기본: 전체 분기)에서 확인하세요.`));
  for (const m of r.merged)
    notes.push(note("info", "중복 병합", `${m.merchant || "기존 증빙"} ${money(m.amount, cur)} (주문 ${m.orderNumber}) — ${m.fileNames.join(", ")}`, () => go(`entries/${m.entryId}`)));
  for (const s of r.skippedFiles) notes.push(note("warn", SKIP_REASON[s.reason] || "건너뜀", `${s.fileName} — ${s.message}`));
  for (const g of r.ignored) notes.push(note("neutral", "제외된 쪽", `${g.fileName} ${g.page}쪽 — 증빙이 아닌 쪽으로 판단`));
  for (const e of r.entries)
    for (const n of e.notices) {
      const p = noticeParts(n);
      notes.push(note(p.tone, p.label, `${e.merchant || "증빙"}: ${p.text}`));
    }
  // AI 1차 적격 검증 — 정책 위반·판단 보류만 알린다
  for (const e of r.entries) {
    const g = e.aiGate;
    if (g?.verdict === "fail")
      notes.push(note("bad", "AI 정책 위반", `${e.merchantKo || e.merchant || "증빙"}: ${(g.violations || []).map((v) => v.reason).join(" · ") || g.summary} — 그대로 제출하면 자동 반려됩니다. 고치거나 제출할 때 소명을 적어 주세요.`, () => go(`entries/${e.entryId}`)));
    else if (g?.verdict === "uncertain")
      notes.push(note("warn", "AI 판단 보류", `${e.merchantKo || e.merchant || "증빙"}: ${g.summary || "정책 위반 여부를 판단하지 못했습니다"} — 결재자가 직접 확인합니다.`));
  }
  for (const n of r.notices) {
    const p = noticeParts(`${n.code}: ${n.message}`);
    notes.push(note(p.tone, p.label, p.text));
  }

  return h(
    "section",
    { class: "card result" },
    h(
      "div",
      { class: "card-head" },
      h(
        "div",
        {},
        h("div", { class: "card-title" }, `${whenText(b.at)} 업로드 · ${b.account}`),
        h("div", { class: "card-sub" }, `파일 ${b.fileCount}개 — 증빙을 눌러 원본과 대조하고 수정·제출하세요.`),
      ),
      h(
        "div",
        { class: "card-actions" },
        h("button", { class: "btn btn-primary btn-sm", type: "button", onclick: () => dismiss(b.id) }, icon("check"), h("span", {}, "확인 완료")),
      ),
    ),
    parts,
    notes.length ? h("div", { class: "notes" }, notes) : null,
  );
}

function stat(label, n, tone) {
  return h("div", { class: `rstat rstat-${tone}` }, h("div", { class: "rstat-n" }, String(n)), h("div", { class: "rstat-l" }, label));
}

function note(tone, label, text, onclick) {
  return h("div", { class: `note${onclick ? " note-link" : ""}`, onclick }, chip(label, tone), h("span", {}, text));
}
