// 목록 페이지 나누기 — 한 페이지에 몇 건 보일지 프리셋(10·20·50·100)과 쪽 이동.
// 화면마다 하나씩 만들고(key 로 구분), 선택한 건수는 브라우저에 기억한다(실패해도 무시).
import { h } from "./ui.js?v=25c4b60";

export const PAGE_SIZES = [10, 20, 50, 100];
const DEFAULT_SIZE = 20;

export function createPager(key, onChange) {
  const store = `pager:${key}`;
  let size = DEFAULT_SIZE;
  try {
    const v = Number(localStorage.getItem(store));
    if (PAGE_SIZES.includes(v)) size = v;
  } catch {
    /* 저장소를 못 쓰면 기본값 */
  }
  let page = 1;

  const pages = (total) => Math.max(1, Math.ceil(total / size));
  const clamp = (total) => (page = Math.min(Math.max(1, page), pages(total)));
  const go = (p) => {
    page = p;
    onChange();
  };

  return {
    /** 필터·정렬이 바뀌면 첫 쪽으로 */
    reset() {
      page = 1;
    },
    /** 현재 쪽에 보일 행 */
    slice(list) {
      clamp(list.length);
      return list.slice((page - 1) * size, page * size);
    },
    /** 하단 바: 범위 · 이동 · 건수 프리셋 */
    node(total) {
      clamp(total);
      const last = pages(total);
      const from = total ? (page - 1) * size + 1 : 0;
      const to = Math.min(total, page * size);
      const btn = (label, p, { disabled = false, current = false, title = "" } = {}) =>
        h("button", { type: "button", class: `pg-btn${current ? " on" : ""}`, disabled, title, "aria-label": title || `${label}쪽`, "aria-current": current ? "page" : null, onclick: () => go(p) }, label);

      // 1 … 4 5 [6] 7 8 … 20 형태로 줄여서 보여 준다
      const nums = [];
      const near = new Set([1, last, page - 1, page, page + 1]);
      if (page <= 3) [2, 3, 4].forEach((n) => near.add(n));
      if (page >= last - 2) [last - 1, last - 2, last - 3].forEach((n) => near.add(n));
      let prev = 0;
      for (const n of [...near].filter((n) => n >= 1 && n <= last).sort((a, b) => a - b)) {
        if (n - prev > 1) nums.push(h("span", { class: "pg-gap", "aria-hidden": "true" }, "…"));
        nums.push(btn(String(n), n, { current: n === page }));
        prev = n;
      }

      const sizeSeg = h(
        "div",
        { class: "pg-size", role: "group", "aria-label": "한 페이지에 보일 건수" },
        PAGE_SIZES.map((n) =>
          h(
            "button",
            {
              type: "button",
              class: `pg-size-btn${n === size ? " on" : ""}`,
              "aria-pressed": n === size ? "true" : "false",
              onclick: () => {
                size = n;
                page = 1;
                try {
                  localStorage.setItem(store, String(n));
                } catch {
                  /* 무시 */
                }
                onChange();
              },
            },
            String(n),
          ),
        ),
        h("span", { class: "pg-size-unit" }, "건씩"),
      );

      return h(
        "div",
        { class: "pager" },
        h("div", { class: "pg-range" }, total ? h("span", {}, h("b", {}, `${from.toLocaleString()}–${to.toLocaleString()}`), ` / ${total.toLocaleString()}건`) : "0건"),
        last > 1
          ? h("nav", { class: "pg-nav", "aria-label": "페이지 이동" }, btn("‹", page - 1, { disabled: page === 1, title: "이전 쪽" }), nums, btn("›", page + 1, { disabled: page === last, title: "다음 쪽" }))
          : h("span"),
        sizeSeg,
      );
    },
  };
}
