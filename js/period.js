// 정산 분기 선택 — 현분기와 전분기 중 하나. 한 분기의 정산은 다음 분기에 하므로 오늘 날짜로 고정하지 않는다.
// 고른 값은 이 탭에서 기억해 홈·증빙 업로드(분기 한도 현황)가 같은 분기를 본다.
import { currentQuarter, h } from "./ui.js";

const KEY = "es7.period";

function prevQuarter(q) {
  const [y, n] = q.split("Q").map(Number);
  return n === 1 ? `${y - 1}Q4` : `${y}Q${n - 1}`;
}

// [전분기, 현분기]
export function periodChoices() {
  const cur = currentQuarter();
  return [prevQuarter(cur), cur];
}

export function getPeriod() {
  const choices = periodChoices();
  try {
    const v = sessionStorage.getItem(KEY);
    if (choices.includes(v)) return v;
  } catch {
    /* 저장소를 못 쓰면 기본값 */
  }
  return choices[1];
}

export function setPeriod(q) {
  try {
    sessionStorage.setItem(KEY, q);
  } catch {
    /* 메모리에만 */
  }
}

const shortLabel = (q) => {
  const [y, n] = q.split("Q");
  return `${y} Q${n}`;
};

// 분기 전환 스위치 — [직전 분기 | 현재 분기] 두 칸(글자는 분기 번호만). onChange(q) 는 값이 바뀔 때만 부른다.
export function periodSwitch(onChange) {
  const [prev, cur] = periodChoices();
  let value = getPeriod();
  const seg = (q) => {
    const b = h(
      "button",
      { class: "period-seg", type: "button", role: "radio", dataset: { q } },
      h("span", { class: "period-q" }, shortLabel(q)),
    );
    b.addEventListener("click", () => {
      if (q === value) return;
      value = q;
      setPeriod(q);
      paint();
      onChange(q);
    });
    return b;
  };
  const segs = [seg(prev), seg(cur)];
  const node = h("div", { class: "period-switch", role: "radiogroup", "aria-label": "정산 분기" }, h("span", { class: "period-label" }, "정산 분기"), h("div", { class: "period-segs" }, segs));
  function paint() {
    for (const b of segs) {
      const on = b.dataset.q === value;
      b.classList.toggle("on", on);
      b.setAttribute("aria-checked", on ? "true" : "false");
    }
  }
  paint();
  return node;
}
