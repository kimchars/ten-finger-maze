// 로컬 스토리지 래퍼 및 영구 데이터 관리

export const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem(k);
      return v ? JSON.parse(v) : d;
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {}
  },
};

export const BEST_KEY = "tfm4-best";
export const CALIB_KEY = "tfm3-calib";
export const SENS_KEY = "tfm3-sens";
export const MUTED_KEY = "tfm3-muted";
export const QUALITY_KEY = "tfm3-quality";
export const CAM_MINI_KEY = "tfm3-cammini";
export const PERF_KEY = "tfm3-perf";
export const LAST_NAME_KEY = "tfm4-lastname";
export const LOCAL_BOARD_KEY = "tfm4-board";
