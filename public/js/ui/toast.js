// 토스트 메시지 및 상단 안내 힌트 알림

let msgEl = null;
let hintEl = null;
let msgUntil = 0;

export function initToastDOM(elements) {
  msgEl = elements.msgEl;
  hintEl = elements.hintEl;
}

export function say(text, ms = 2600) {
  if (!msgEl) return;
  msgEl.textContent = text;
  msgEl.hidden = false;
  msgUntil = performance.now() + ms;
}

export function updateToast(now) {
  if (msgEl && now > msgUntil && !msgEl.hidden) {
    msgEl.hidden = true;
  }
}

export function setHint(text) {
  if (hintEl && hintEl.textContent !== text) {
    hintEl.textContent = text;
  }
}

export function clearHint() {
  if (hintEl && hintEl.textContent) {
    hintEl.textContent = "";
  }
}
