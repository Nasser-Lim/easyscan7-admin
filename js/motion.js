import { h, select } from "./ui.js?v=4609e37";

const KEY = "es7.motion";
const MODES = [["auto", "자동"], ["full", "전체 효과"], ["off", "끄기"]];

let mode = "auto";
try {
  const saved = localStorage.getItem(KEY);
  if (MODES.some(([value]) => value === saved)) mode = saved;
} catch { /* storage is optional */ }
document.documentElement.dataset.motion = mode;

export function motionControl() {
  const picker = select(MODES, mode, { class: "input input-sm" });
  picker.addEventListener("change", () => {
    mode = picker.value;
    document.documentElement.dataset.motion = mode;
    try {
      localStorage.setItem(KEY, mode);
    } catch { /* the setting still applies to the current page */ }
  });
  return h("label", { class: "motion-control",
    title: "동작 줄이기 설정에서는 자동 모드가 밝기 효과를 사용합니다." }, h("span", {}, "화면 효과"), picker);
}
