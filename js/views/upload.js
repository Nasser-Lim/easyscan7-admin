// 증빙 업로드 — PDF·스크린샷 여러 개를 한 번에 올리면 AI 가 전표로 나눈다(POST /intake).
import { api } from "../api.js";
import {
  ACCOUNTS, BRANCH, DOC_TYPE, bytes, chip, clear, currentQuarter, errorText, field, h, icon, money, noticeParts,
  quarterLabel, quarterOptions, select, spinner, statusChip, toast,
} from "../ui.js";
import { limitsCard } from "./limits.js";
import { pageHeader } from "./shell.js";

const MAX_FILES = 20;
const MAX_BYTES = 20 * 1024 * 1024;
const TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"];
const SKIP_REASON = { unsupported: "형식 미지원", too_large: "용량 초과", duplicate_file: "이미 올린 파일", duplicate_in_batch: "중복 선택" };

export function renderUpload(el, { me, go }) {
  let files = [];
  let busy = false;
  const branch = `${BRANCH[me.branchId] || me.branchId}지국`;

  const account = select(ACCOUNTS.map((a) => [a, a]), ACCOUNTS[0]);
  const quarter = select(quarterOptions(4).map((q) => [q, quarterLabel(q)]), currentQuarter());
  const input = h("input", { type: "file", multiple: true, accept: ".pdf,.jpg,.jpeg,.png,.webp,.heic,application/pdf,image/*", class: "sr-only" });
  const list = h("div", { class: "file-list" });
  const submit = h("button", { class: "btn btn-primary btn-lg", type: "button", disabled: true }, icon("upload"), h("span", {}, "업로드하고 전표 만들기"));
  const summary = h("div", { class: "upload-summary muted" });
  const result = h("div", { class: "result" });
  const limitsSlot = h("div", {});

  const drop = h(
    "div",
    {
      class: "dropzone",
      tabindex: "0",
      role: "button",
      "aria-label": "파일 선택",
      onclick: () => !busy && input.click(),
      onkeydown: (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), !busy && input.click()),
      ondragover: (e) => (e.preventDefault(), drop.classList.add("over")),
      ondragleave: () => drop.classList.remove("over"),
      ondrop: (e) => {
        e.preventDefault();
        drop.classList.remove("over");
        if (!busy) add([...e.dataTransfer.files]);
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
  }

  submit.addEventListener("click", async () => {
    if (!files.length || busy) return;
    busy = true;
    account.disabled = quarter.disabled = true;
    paint();
    clear(result).append(
      h(
        "section",
        { class: "card progress-card" },
        spinner(),
        h("div", {}, h("div", { class: "card-title" }, "AI 가 증빙을 읽고 있습니다"), h("div", { class: "muted small" }, `${files.length}개 파일 — 쪽 수에 따라 수십 초~몇 분 걸립니다. 이 화면을 닫지 마세요.`)),
      ),
    );
    const fd = new FormData();
    files.forEach((f) => fd.append("files", f, f.name));
    fd.append("account", account.value);
    fd.append("quarter", quarter.value);
    try {
      const r = await api.postForm("/intake", fd);
      clear(result).append(resultView(r, go));
      const n = r.entries.length;
      toast(n ? `전표 ${n}건을 만들었습니다` : "새로 만든 전표가 없습니다", n ? "ok" : "info");
      files = [];
      clear(limitsSlot).append(limitsCard(quarter.value));
    } catch (e) {
      clear(result).append(h("div", { class: "banner banner-bad" }, icon("alert"), h("div", {}, h("b", {}, "업로드 실패"), h("div", {}, errorText(e)))));
    } finally {
      busy = false;
      account.disabled = quarter.disabled = false;
      paint();
    }
  });

  quarter.addEventListener("change", () => clear(limitsSlot).append(limitsCard(quarter.value)));
  limitsSlot.append(limitsCard(quarter.value));

  el.append(
    pageHeader({
      crumbs: [branch, "업무"],
      title: "증빙 업로드",
      desc: "PDF·스크린샷 증빙을 올리면 AI 가 영수증 단위로 나눠 전표를 만듭니다. 촬영 영수증은 촬영앱을 이용하세요.",
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
          h("div", { class: "form-row" }, field("계정", account, "이번에 올리는 증빙 전체에 적용됩니다"), field("분기", quarter, "증빙 날짜가 이 분기 밖이면 알려 드립니다")),
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
        result,
      ),
      h("div", { class: "stack" }, limitsSlot, tipsCard()),
    ),
  );
  paint();
}

function tipsCard() {
  return h(
    "section",
    { class: "card" },
    h("div", { class: "card-head" }, h("div", { class: "card-title" }, "올리기 전에")),
    h(
      "ul",
      { class: "tips" },
      h("li", {}, "주문 내역·결제 확인·배송 안내처럼 같은 주문의 여러 장은 한 번에 올리면 1건으로 합쳐집니다."),
      h("li", {}, "이미 등록된 주문(주문번호·금액 동일)을 다시 올리면 새 전표 없이 기존 전표에 합쳐지고 알려 드립니다."),
      h("li", {}, "광고·약관 같은 증빙이 아닌 쪽은 자동으로 제외됩니다."),
      h("li", {}, "분기 한도를 넘는 금액은 비적격으로 처리되며, 제출은 막지 않습니다."),
    ),
  );
}

function resultView(r, go) {
  const cur = r.entries.find((e) => e.currency)?.currency || "USD";
  const parts = [];
  parts.push(
    h(
      "div",
      { class: "result-stats" },
      stat("만든 전표", r.entries.length, "ok"),
      stat("기존 전표에 병합", r.merged.length, r.merged.length ? "info" : "neutral"),
      stat("건너뛴 파일", r.skippedFiles.length, r.skippedFiles.length ? "warn" : "neutral"),
      stat("제외된 쪽", r.ignored.length, "neutral"),
    ),
  );

  if (r.entries.length) {
    parts.push(
      h(
        "table",
        { class: "table" },
        h("thead", {}, h("tr", {}, h("th", {}, "사용일"), h("th", {}, "가맹점"), h("th", {}, "증빙"), h("th", { class: "num" }, "금액"), h("th", {}, "상태"), h("th", {}))),
        h(
          "tbody",
          {},
          r.entries.map((e) =>
            h(
              "tr",
              { class: "row-link", onclick: () => go(`entries/${e.entryId}`) },
              h("td", { class: "mono" }, e.txnDate || "—"),
              h("td", {}, h("div", { class: "cell-main" }, e.merchantKo || e.merchant || "—"), h("div", { class: "cell-sub" }, DOC_TYPE[e.docType] || e.docType || "")),
              h("td", { class: "cell-sub" }, [...new Set((e.sources || []).map((s) => s.fileName))].join(", ")),
              h(
                "td",
                { class: "num" },
                money(e.amount, e.currency),
                e.ineligibleAmount > 0 ? h("div", { class: "cell-sub text-bad" }, `비적격 ${money(e.ineligibleAmount, e.currency)}`) : null,
              ),
              h("td", {}, statusChip(e.status), e.flags?.length ? h("div", { class: "cell-sub" }, `규칙 ${e.flags.length}건`) : null),
              h("td", { class: "cell-action" }, icon("chevron")),
            ),
          ),
        ),
      ),
    );
  }

  const notes = [];
  for (const m of r.merged)
    notes.push(note("info", "중복 병합", `${m.merchant || "기존 전표"} ${money(m.amount, cur)} (주문 ${m.orderNumber}) — ${m.fileNames.join(", ")}`, () => go(`entries/${m.entryId}`)));
  for (const s of r.skippedFiles) notes.push(note("warn", SKIP_REASON[s.reason] || "건너뜀", `${s.fileName} — ${s.message}`));
  for (const g of r.ignored) notes.push(note("neutral", "제외된 쪽", `${g.fileName} ${g.page}쪽 — 증빙이 아닌 쪽으로 판단`));
  for (const e of r.entries) for (const n of e.notices || []) {
    const p = noticeParts(n);
    notes.push(note(p.tone, p.label, `${e.merchant || "전표"}: ${p.text}`));
  }
  // 묶음 단위 알림 중 전표에 붙지 않는 것(인식 실패·쪽수 초과)만. 나머지는 위 전표별 알림과 같다.
  for (const n of r.notices || []) {
    if (typeof n !== "object" || !["PAGE_FAILED", "PAGES_TRUNCATED"].includes(n.code)) continue;
    const p = noticeParts(`${n.code}: ${n.message}`);
    notes.push(note(p.tone, p.label, p.text));
  }

  return h(
    "section",
    { class: "card" },
    h(
      "div",
      { class: "card-head" },
      h("div", {}, h("div", { class: "card-title" }, "처리 결과"), h("div", { class: "card-sub" }, "전표를 눌러 원본과 대조하고 수정·제출하세요.")),
      h("a", { class: "btn btn-ghost btn-sm", href: "#/entries" }, "전표 조회로", icon("chevron")),
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
