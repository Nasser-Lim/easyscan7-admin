// 증빙 업로드 작업 — 화면(뷰)과 분리해 두어, 업로드 중·처리 후에 다른 메뉴로 갔다 와도 상태가 남는다.
//  · 진행 중: 모달 프로그레스 바(파일 전송 → AI 인식 → 정리). 메뉴를 이동해도 모달과 처리는 계속된다.
//  · 처리 결과: '확인 대기' 큐에 쌓이고 [확인 완료]를 누를 때까지 남는다(같은 탭이면 새로고침해도 유지).
// 증빙 자체는 서버가 업로드 즉시 '작성중'으로 저장한다 — 큐는 결과를 확인하기 위한 목록이지 데이터 보관소가 아니다.
import { api } from "./api.js";
import { bytes, errorText, h, icon, toast } from "./ui.js";
import { setNavBadge } from "./views/shell.js";

const KEY = "es7.upload-queue";
const MAX_QUEUE = 20;
const listeners = new Set();

let owner = null; // 큐 소유자(로그인 이메일) — 같은 탭에서 계정을 바꿔도 남의 결과가 보이지 않게
let queue = [];
let job = null; // 진행 중인 업로드

const storageKey = () => `${KEY}.${owner}`;

function load() {
  try {
    const v = JSON.parse(sessionStorage.getItem(storageKey()) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function save() {
  if (!owner) return;
  try {
    if (queue.length) sessionStorage.setItem(storageKey(), JSON.stringify(queue));
    else sessionStorage.removeItem(storageKey());
  } catch {
    /* 저장소를 못 쓰는 환경에서는 메모리에서만 유지 */
  }
}
function emit(event) {
  save();
  setNavBadge("upload", queue.length);
  listeners.forEach((fn) => fn(event));
}

export function initUploadQueue(me) {
  owner = me.email || me.uid || "me";
  queue = load();
  setNavBadge("upload", queue.length);
}
// 로그아웃 시 — 다음 사용자를 위해 이 탭에 남은 결과를 지운다.
export function resetUploadQueue() {
  if (owner) {
    try {
      sessionStorage.removeItem(storageKey());
    } catch {
      /* 무시 */
    }
  }
  owner = null;
  queue = [];
}
export const getQueue = () => queue;
export const isBusy = () => !!job;
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function dismiss(id) {
  queue = queue.filter((b) => b.id !== id);
  emit("dismiss");
}
export function dismissAll() {
  queue = [];
  emit("dismiss");
}

// 큐에는 결과 화면에 필요한 값만 둔다(저장 용량·노출 최소화).
function slim(r) {
  return {
    entries: (r.entries || []).map((e) => ({
      entryId: e.entryId,
      txnDate: e.txnDate,
      quarter: e.quarter,
      merchantKo: e.merchantKo,
      merchant: e.merchant,
      docType: e.docType,
      currency: e.currency,
      amount: e.amount,
      ineligibleAmount: e.ineligibleAmount,
      status: e.status,
      flagCount: (e.flags || []).length,
      notices: e.notices || [],
      fileNames: [...new Set((e.sources || []).map((s) => s.fileName))],
    })),
    merged: r.merged || [],
    skippedFiles: r.skippedFiles || [],
    ignored: r.ignored || [],
    // 묶음 단위 알림 중 증빙에 붙지 않는 것(인식 실패·쪽수 초과)만. 나머지는 증빙별 알림과 같다.
    notices: (r.notices || []).filter((n) => n && typeof n === "object" && ["PAGE_FAILED", "PAGES_TRUNCATED"].includes(n.code)),
  };
}

// ── 진행률 ──
// 전송은 실제 바이트로 잰다. AI 인식은 서버가 진행률을 주지 않아 파일 수로 예상 시간을 잡아 추정한다(95% 에서 멈추고 끝나면 100%).
const SEND_SHARE = 25;
function percent() {
  if (!job) return 100;
  if (job.stage === "send") return SEND_SHARE * job.sent;
  const est = 10_000 + 4_000 * job.count;
  const t = Date.now() - job.aiStart;
  return Math.min(95, SEND_SHARE + (95 - SEND_SHARE) * (1 - Math.exp(-t / est)));
}
const STEPS = [
  ["send", "파일 전송"],
  ["ai", "AI 인식"],
  ["done", "증빙 정리"],
];

function openModal() {
  const fill = h("div", { class: "pbar-fill" });
  const bar = h("div", { class: "pbar", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-label": "업로드 진행률" }, fill);
  const pct = h("span", { class: "pbar-pct" }, "0%");
  const stage = h("div", { class: "progress-stage" });
  const steps = h("ol", { class: "psteps" }, STEPS.map(([k, l]) => h("li", { class: "pstep", dataset: { k } }, l)));
  const body = h(
    "div",
    { class: "modal progress-modal", role: "dialog", "aria-modal": "true", "aria-live": "polite" },
    h("div", { class: "modal-title" }, "증빙을 올리고 있습니다"),
    stage,
    bar,
    h("div", { class: "pbar-row" }, h("span", { class: "muted small" }, `${job.count}개 파일 · ${bytes(job.total)}`), pct),
    steps,
    h("div", { class: "muted small progress-foot" }, "쪽 수에 따라 수십 초~몇 분 걸립니다. 다른 메뉴로 이동해도 처리는 계속되지만, 브라우저 탭은 닫지 마세요."),
  );
  const back = h("div", { class: "modal-back" }, body);
  document.body.append(back);

  const paint = () => {
    const p = Math.round(percent());
    fill.style.width = `${p}%`;
    pct.textContent = `${p}%`;
    bar.setAttribute("aria-valuenow", String(p));
    stage.textContent = !job ? "증빙을 정리하는 중…" : job.stage === "send" ? "파일을 서버로 보내는 중…" : "AI 가 영수증을 읽고 증빙으로 나누는 중…";
    const cur = job ? job.stage : "done";
    const idx = STEPS.findIndex(([k]) => k === cur);
    [...steps.children].forEach((li, i) => {
      li.classList.toggle("on", i === idx);
      li.classList.toggle("past", i < idx);
    });
  };
  paint();
  const timer = setInterval(paint, 250);

  return {
    close() {
      clearInterval(timer);
      back.remove();
    },
    fail(message) {
      clearInterval(timer);
      const close = () => back.remove();
      body.replaceChildren(
        h("div", { class: "modal-title" }, "업로드하지 못했습니다"),
        h("div", { class: "banner banner-bad" }, icon("alert"), h("div", {}, message)),
        h("div", { class: "modal-body muted small" }, "선택한 파일은 목록에 그대로 남아 있습니다. 확인 후 다시 시도하세요."),
        h("div", { class: "modal-actions" }, h("button", { class: "btn btn-primary", onclick: close }, "닫기")),
      );
      body.querySelector(".btn-primary").focus();
    },
  };
}

const guard = (e) => {
  e.preventDefault();
  e.returnValue = "";
};

// 업로드를 시작한다. 성공하면 결과를 큐 맨 앞에 쌓고 true, 실패하면 모달에 사유를 보이고 false.
export async function startUpload(files, account) {
  if (job) return false;
  job = { count: files.length, total: files.reduce((a, f) => a + f.size, 0), stage: "send", sent: 0, aiStart: 0 };
  const modal = openModal();
  window.addEventListener("beforeunload", guard);
  const fd = new FormData();
  files.forEach((f) => fd.append("files", f, f.name));
  fd.append("account", account);
  fd.append("quarter", "auto"); // 정산 분기는 항상 영수증 날짜 기준(자동)
  try {
    const r = await api.postFormProgress("/intake", fd, {
      onUpload: (loaded, all) => job && (job.sent = all ? loaded / all : 1),
      onSent: () => {
        if (!job) return;
        job.stage = "ai";
        job.sent = 1;
        job.aiStart = Date.now();
      },
    });
    job = null;
    queue = [{ id: `${Date.now()}`, at: Date.now(), account, fileCount: files.length, result: slim(r) }, ...queue].slice(0, MAX_QUEUE);
    modal.close();
    const n = (r.entries || []).length;
    toast(n ? `증빙 ${n}건을 등록했습니다 — 처리 결과를 확인하세요` : "새로 등록된 증빙이 없습니다", n ? "ok" : "info");
    emit("done");
    return true;
  } catch (e) {
    job = null;
    modal.fail(errorText(e));
    emit("fail");
    return false;
  } finally {
    window.removeEventListener("beforeunload", guard);
  }
}
