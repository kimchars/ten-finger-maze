// 입력 통합 관리 (키보드 + 손가락 인식 상태 결합)
import { trk } from "./hand/tracker.js";

export const keyP1 = [false, false, false, false, false];
export const keyP2 = [false, false, false, false, false];
// 방향키를 '눌렀다'는 사실을 따로 기억해요. 화면이 느려서 누르고 떼는 사이에 프레임이 지나가 버려도 한 칸은 꼭 움직이게요.
export const keyTapP1 = [0, 0, 0, 0, 0];
export const keyTapP2 = [0, 0, 0, 0, 0]; // 숫자키를 짧게 눌러도 다리가 생기게

export const KEYMAP = {
  Space: [1, 0],
  ArrowUp: [1, 1],
  ArrowDown: [1, 2],
  ArrowLeft: [1, 3],
  ArrowRight: [1, 4],
  Digit1: [2, 0],
  Digit2: [2, 1],
  Digit3: [2, 2],
  Digit4: [2, 3],
  Digit5: [2, 4],
  Numpad1: [2, 0],
  Numpad2: [2, 1],
  Numpad3: [2, 2],
  Numpad4: [2, 3],
  Numpad5: [2, 4],
};

export const on = (p, i) => trk[p].bent[i] || (p === 1 ? keyP1 : keyP2)[i];
export const amtOf = (p, i) => ((p === 1 ? keyP1 : keyP2)[i] ? 1 : trk[p].amt[i]);
export const allOn = (p) => [0, 1, 2, 3, 4].every((i) => on(p, i));

// 외부 액션 콜백 등록
const actionHandlers = {};
export function registerAction(name, fn) {
  actionHandlers[name] = fn;
}

export function initKeyboardListeners() {
  function handleKey(e, isDown) {
    if (e.target instanceof HTMLInputElement) {
      if (isDown && e.code === "Enter" && actionHandlers["saveRace"]) {
        e.preventDefault();
        actionHandlers["saveRace"]();
      }
      return;
    }

    const m = KEYMAP[e.code];
    if (m) {
      e.preventDefault();
      (m[0] === 1 ? keyP1 : keyP2)[m[1]] = isDown;
      if (isDown && !e.repeat) (m[0] === 1 ? keyTapP1 : keyTapP2)[m[1]]++;
      return;
    }

    if (!isDown || e.repeat) return;

    if (e.code === "Enter" && actionHandlers["primary"]) {
      e.preventDefault();
      actionHandlers["primary"]();
    } else if (e.code === "Escape" && actionHandlers["escape"]) {
      actionHandlers["escape"]();
    } else if (e.code === "KeyR" && actionHandlers["restart"]) {
      actionHandlers["restart"]();
    } else if (e.code === "KeyM" && actionHandlers["mute"]) {
      actionHandlers["mute"]();
    } else if (e.code === "KeyF" && actionHandlers["perf"]) {
      actionHandlers["perf"]();
    } else if (e.code === "KeyC" && actionHandlers["camToggle"]) {
      actionHandlers["camToggle"]();
    } else if (e.code === "KeyP" && actionHandlers["ping"]) {
      actionHandlers["ping"]();
    } else if (e.code === "KeyT" && actionHandlers["trap"]) {
      actionHandlers["trap"]();
    }
  }

  window.addEventListener("keydown", (e) => handleKey(e, true));
  window.addEventListener("keyup", (e) => handleKey(e, false));
  window.addEventListener("blur", () => {
    keyP1.fill(false);
    keyP2.fill(false);
  });
}
