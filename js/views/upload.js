// 증빙 업로드 — PDF·스크린샷 여러 개를 한 번에 올리면 AI 가 증빙으로 나눈다(POST /intake).
// 적용 분기를 직접 고르거나 사용일로 자동 결정한다. 업로드 진행·처리 결과 보관은 uploadjob.js 가 맡는다.
import {
  DOC_TYPE, accountSelect, bytes, chip, clear, currentQuarter, field, h, icon, money, noticeParts,
  quarterLabel, select, statusChip, tip, toast,
} from "../ui.js?v=f130322";
import { aiGateMark } from "../aigate.js?v=f130322";
import { api } from "../api.js?v=f130322";
import { currentPeriod, periodOfEntry, periodOptions, unitName } from "../period.js?v=f130322";
import { dismiss, dismissAll, getQueue, isBusy, startUpload, subscribe } from "../uploadjob.js?v=f130322";
import { limitsCard } from "./limits.js?v=f130322";
import { pageHeader } from "./shell.js?v=f130322";

const MAX_FILES = 20;
const MAX_BYTES = 20 * 1024 * 1024;
const TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"];
const SKIP_REASON = { unsupported: "형식 미지원", too_large: "용량 초과", duplicate_file: "이미 올린 파일", duplicate_in_batch: "중복 선택" };

export function renderUpload(el, { me, go }) {
  let files = [];

  const account = accountSelect("", { required: true }, { branch: me.branchId, blank: "증빙 유형을 선택하세요" });
  const appliedQuarter = select([["auto", "사용일 기준 (자동)"],
    ...periodOptions(4, "quarter").map((q) => [q, quarterLabel(q)])], "auto", { "aria-label": "적용 분기" });
  const input = h("input", { type: "file", multiple: true, accept: ".pdf,.jpg,.jpeg,.png,.webp,.heic,application/pdf,image/*", class: "sr-only" });
  const list = h("div", { class: "file-list" });
  const submit = h("button", { class: "btn btn-primary btn-lg", type: "button", disabled: true }, icon("upload"), h("span", {}, "업로드·AI 판독"));
  const summary = h("div", { class: "upload-summary muted" });
  const queueSlot = h("div", { class: "stack" });
  const limitsSlot = h("div", {});
  function refreshLimits() {
    const quarter = appliedQuarter.value === "auto" ? currentQuarter() : appliedQuarter.value;
    limitsSlot.replaceChildren(limitsCard(quarter));
  }
  appliedQuarter.addEventListener("change", refreshLimits);

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
    h("div", { class: "dropzone-title" }, "파일 선택 또는 드래그"),
    h("div", { class: "dropzone-desc" }, `PDF · JPG · PNG · WEBP · HEIC · ${MAX_FILES}개 / 25쪽 · 파일당 20MB`),
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
    submit.disabled = busy || !files.length || !account.value;
    account.disabled = busy;
    appliedQuarter.disabled = busy;
  }
  account.addEventListener("change", paint);

  // 기록의 상태·금액은 업로드 당시 값이 아니라 **지금 값**(증빙 조회와 같은 값)으로 보여 준다 — 서버에서 한 번 받아 둔다
  let live = null; // { entryId: 증빙 } — 못 받으면 null(기록에 저장된 값으로 대체)
  async function refreshLive() {
    try {
      const { entries } = await api.get("/entries");
      live = Object.fromEntries(entries.map((e) => [e.id, e]));
    } catch {
      /* 현재 상태를 못 받아도 기록은 보여 준다 */
    }
    if (queueSlot.isConnected) paintQueue();
  }
  // 처리 결과 — 최근 5회만 보이고(더 오래된 것은 자동으로 밀려남), 카드마다 지울 수 있다. 증빙은 지워지지 않는다.
  function paintQueue() {
    clear(queueSlot);
    const q = getQueue();
    if (!q.length) return;
    queueSlot.append(
      h(
        "div",
        { class: "queue-head" },
        h("div", {}, h("div", { class: "card-title" }, "최근 처리 결과(최대 5건까지 표시)")),
        q.length > 1 ? h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: dismissAll }, icon("trash"), h("span", {}, "모두 지우기")) : null,
      ),
      ...q.map((b) => batchView(b, go, live)),
    );
  }

  submit.addEventListener("click", async () => {
    if (!files.length || isBusy() || !account.value) return;
    const picked = files;
    const upload = startUpload(picked, account.value, appliedQuarter.value);
    paint();
    if (await upload) files = files.filter((f) => !picked.includes(f));
    if (queueSlot.isConnected) paint();
  });

  // 업로드가 끝나거나 결과를 치우면 다시 그린다. 이 화면을 떠나면(슬롯이 문서에서 빠지면) 구독을 끊는다.
  const off = subscribe((event) => {
    if (!queueSlot.isConnected) return off();
    paintQueue();
    paint();
    if (event === "done") {
      refreshLive();
      refreshLimits();
      queueSlot.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  refreshLimits();

  el.append(
    pageHeader({
      title: "증빙 업로드",
      help: "촬영 영수증은 촬영앱을 쓰세요.\n세 계정(취재비·경상비·차량유지비) 밖의 영수증도 모두 올립니다 — 결재 없이 '보관'되고 정산서에 계정별로 합산됩니다.",
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
          h("div", { class: "card-head" }, h("div", { class: "card-title with-symbol" }, icon("sliders"), "정산 구분")),
          h("div", { class: "form-row" },
            field(h("span", {}, "증빙 유형", tip("같은 유형의 파일을 한 번에 올려 주세요.\n기타 계정은 결재 없이 보관됩니다.")), account),
            field(h("span", {}, "적용 분기", tip("직접 고른 분기는 이번 업로드에서 새로 등록되는 증빙에 적용됩니다. 자동으로 두면 각 영수증의 사용일을 따릅니다.")), appliedQuarter)),
        ),
        h(
          "section",
          { class: "card" },
          h("div", { class: "card-head" }, h("div", { class: "card-title with-symbol" }, icon("receipt"), "증빙 파일")),
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
  refreshLive();
}

function tipsCard() {
  const li = (symbol, text, help) => h("li", {}, h("span", { class: "upload-guide-icon" }, icon(symbol)), h("span", {}, text), help ? tip(help) : null);
  return h(
    "section",
    { class: "card desktop-guide" },
    h("div", { class: "card-head" }, h("div", { class: "card-title" }, "올리기 전에")),
    h(
      "ul",
      { class: "upload-guide" },
      li("file", "같은 주문은 한 번에", "주문 내역·결제 확인·배송 안내를 함께 올리면 한 건으로 묶입니다."),
      li("check", "중복 증빙은 자동 병합", "주문번호·금액이 같으면 기존 증빙에 합치고 알려 드립니다."),
      li("send", "판독 결과 확인 후 제출", "업로드만 하면 작성중 상태로 저장됩니다."),
      li("sliders", "한도 초과분은 비적격", "제출은 가능합니다. 지국 통화와 다른 영수증은 한도 판정에서 제외됩니다."),
      li("shield", "정책 위반 건은 소명 후 제출", "소명 없이 제출하면 자동 반려됩니다."),
    ),
  );
}

function whenText(at) {
  const d = new Date(at);
  const time = d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  return d.toDateString() === new Date().toDateString() ? time : `${d.getMonth() + 1}/${d.getDate()} ${time}`;
}

// 업로드 1회의 처리 결과(큐 항목).
function batchView(b, go, live) {
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
          h("thead", {}, h("tr", {}, h("th", {}, "사용일"), h("th", {}, unitName()), h("th", {}, "가맹점"), h("th", {}, "증빙"), h("th", { class: "num" }, "금액"), h("th", {}, "상태"), h("th", {}))),
          h(
            "tbody",
            {},
            r.entries.map((x) => {
              // 상태·금액·AI 판정은 지금 값(증빙 조회와 같은 값). 서버에서 못 받았으면 업로드 당시 값
              const c = live?.[x.entryId];
              const e = c ? { ...x, status: c.status, amount: c.amount, ineligibleAmount: c.ineligibleAmount, aiGate: c.aiGate ?? x.aiGate } : x;
              const gone = !!live && !c; // 목록에 없으면 삭제된 증빙
              return h(
                "tr",
                { class: gone ? "" : "row-link", onclick: gone ? null : () => go(`entries/${e.entryId}?work=1`) },
                h("td", { class: "mono" }, e.txnDate || "—"),
                h("td", { class: "cell-sub" }, quarterLabel(periodOfEntry(e))),
                h("td", {}, h("div", { class: "cell-main" }, e.merchantKo || e.merchant || "—"), h("div", { class: "cell-sub" }, DOC_TYPE[e.docType] || e.docType || "")),
                h("td", { class: "cell-sub" }, e.fileNames.join(", ")),
                h(
                  "td",
                  { class: "num" },
                  money(e.amount, e.currency),
                  e.ineligibleAmount > 0 ? h("div", { class: "cell-sub text-bad" }, `비적격 ${money(e.ineligibleAmount, e.currency)}`) : null,
                ),
                h("td", {}, statusChip(gone ? "deleted" : e.status), gone ? null : aiGateMark(e.aiGate) || (e.flagCount ? h("div", { class: "cell-sub" }, `규칙 ${e.flagCount}건`) : null)),
                h("td", { class: "cell-action" }, gone ? null : icon("chevron")),
              );
            }),
          ),
        ),
      ),
    );
  }

  const notes = [];
  const qs = [...new Set(r.entries.map((e) => periodOfEntry(e)))].filter(Boolean).sort();
  if (b.quarter && b.quarter !== "auto" && r.entries.length)
    notes.push(note("info", "적용 분기", `${quarterLabel(b.quarter)} · ${r.entries.length}건`));
  else if (qs.length > 1 || (qs.length === 1 && qs[0] !== currentPeriod()))
    notes.push(note("info", `정산 ${unitName()}`, `영수증 날짜에 따라 ${qs.map((q) => `${quarterLabel(q)} ${r.entries.filter((e) => periodOfEntry(e) === q).length}건`).join(", ")}`));
  for (const m of r.merged)
    notes.push(note("info", "중복 병합", `${m.merchant || "기존 증빙"} ${money(m.amount, cur)} (주문 ${m.orderNumber}) — ${m.fileNames.join(", ")}`, () => go(`entries/${m.entryId}?work=1`)));
  for (const s of r.skippedFiles) notes.push(note("warn", SKIP_REASON[s.reason] || "건너뜀", `${s.fileName} — ${s.message}`));
  for (const g of r.ignored) notes.push(note("neutral", "제외된 쪽", `${g.fileName} ${g.page}쪽 — 증빙이 아닌 쪽으로 판단`));
  for (const e of r.entries)
    for (const n of e.notices) {
      const p = noticeParts(n);
      notes.push(note(p.tone, p.label, `${e.merchant || "증빙"}: ${p.text}`));
    }
  // AI 1차 적격 검증 — 정책 위반·판단 보류만 알린다
  for (const x of r.entries) {
    const c = live?.[x.entryId];
    if (live && (!c || !["draft", "flagged"].includes(c.status))) continue; // 이미 제출·반려·삭제된 증빙은 상태 열이 말해 준다
    const e = c ? { ...x, aiGate: c.aiGate ?? x.aiGate } : x;
    const g = e.aiGate;
    if (g?.verdict === "fail")
      notes.push(note("bad", "AI 정책 위반", `${e.merchantKo || e.merchant || "증빙"}: ${(g.violations || []).map((v) => v.reason).join(" · ") || g.summary} — 그대로 제출하면 자동 반려됩니다. 고치거나 제출할 때 소명을 적어 주세요.`, () => go(`entries/${e.entryId}?work=1`)));
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
        h("div", { class: "card-sub" }, `파일 ${b.fileCount}개`),
      ),
      h("div", { class: "card-actions" }, h("button", { class: "btn btn-ghost btn-sm", type: "button", title: "이 처리 결과 기록을 지웁니다(증빙은 그대로)", onclick: () => dismiss(b.id) }, icon("trash"), h("span", {}, "지우기"))),
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
