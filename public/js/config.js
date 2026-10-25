// 게임 설정 및 전역 상수

export const MP_VER = "0.10.14";
export const MP_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VER}/vision_bundle.mjs`;
export const MP_WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VER}/wasm`;
export const MP_MODEL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
export const MP_CJS = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VER}/vision_bundle.cjs`;
export const HAND_HZ = 30; // 손 인식을 1초에 최대 몇 번 돌릴지

export const FINGER = ["엄지", "검지", "중지", "약지", "새끼"];
export const FCOL = ["#f2a541", "#f07fb0", "#4fc3b5", "#9b8cf2", "#a3d65c"];
export const COL_P1 = "#7cc4ff";
export const COL_P2 = "#ffd2a0";

export const P1_ROLE = ["랜턴 끄기", "위", "아래", "왼쪽", "오른쪽"];
export const P1_KEY = ["Space", "↑", "↓", "←", "→"];
export const P2_KEY = ["1", "2", "3", "4", "5"];
export const DIRS = [null, [-1, 0], [1, 0], [0, -1], [0, 1]];

export const MOVE_MS = 230;      // 방향 손가락을 계속 구부리고 있을 때 한 칸 이동 간격
export const STEP_MS = 190;      // 한 칸 걷는 애니메이션 시간
export const GUARD_MS = 520;     // 괴물 이동 간격
export const BAT_MS = 280;       // 박쥐 떼 이동 간격
export const LOST_MS = 350;      // 손이 이 시간보다 오래 안 보이면 손가락을 편 것으로 처리
export const INVULN_MS = 1400;   // 피격 무적 시간
export const FIST_MS = 1000;     // 두 사람이 주먹을 이만큼 쥐고 있으면 다음 화면으로
export const FREEZE_MS = 3500;   // 덫 지속 시간
export const TRAP_RANGE = 6;     // 덫 유효 사거리
export const SONAR_SPEED = 6;    // 초당 몇 칸 퍼지는지
export const PING_WINDOW = 7000; // 핑 뒤 레이더에 출구가 잡히는 시간
export const SWEEP_MS = 2400;    // 레이더 1회전 주기
export const BLIP_MS = 2200;     // 레이더 점 유지 시간
export const LOST_WARN_MS = 700; // 손 유실 경고 표시 지연
export const ROLE_MEMORY_MS = 1500; // 손 추적 기억 시간

export const CAL_READY = 1300;
export const CAL_OPEN = 1500;
export const CAL_FINGER = 2000;

export const DEFAULT_OPEN = [0, 0, 0, 0, 0];
export const DEFAULT_CLOSED = [0.75, 105, 105, 105, 105];
export const DEFAULT_RANGE = DEFAULT_CLOSED.map((c, i) => c - DEFAULT_OPEN[i]);
export const MIN_RANGE = [0.2, 30, 30, 30, 30];
export const WEAK_RATIO = 0.55;

export const CONN = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],
  [13,17],[0,17],[17,18],[18,19],[19,20]
];
export const TIPS = [4, 8, 12, 16, 20];

export const THEMES = {
  cave:    { wall: 0xbdb6aa, cap: 0x8c867a, tile: 0xb4ac9c, fog: 0x08090e, sky: 0x5a6a9a, ground: 0x2a2018, hemi: 1.0, moon: 0x9db4ff, moonI: 1.3, props: "stalag", torches: true, mon: null },
  moss:    { wall: 0x93b89e, cap: 0x6cc46a, tile: 0x9cb8a0, fog: 0x05110e, sky: 0x4a8a7a, ground: 0x1a2a18, hemi: 1.05, moon: 0x9fe0d0, moonI: 1.1, props: "mushroom", torches: true,
             mon: { skin: 0x10221a, emissive: 0x0a3020, eye: 0x9cff40, spike: 0x0a1a10, tent: 0x15301f, light: 0x8cff50 } },
  mine:    { wall: 0xcfa47a, cap: 0x8c6a48, tile: 0xbc9c7a, fog: 0x110a05, sky: 0x9a7a5a, ground: 0x2a1a0a, hemi: 0.95, moon: 0xffd2a0, moonI: 0.9, props: "mine", torches: false,
             mon: { skin: 0x2a1608, emissive: 0x3a1a06, eye: 0xffa020, spike: 0x1a0c04, tent: 0x2a1a0c, light: 0xff9a30 } },
  crystal: { wall: 0xa096d0, cap: 0xb4aae8, tile: 0xaca4d4, fog: 0x090716, sky: 0x7a6aca, ground: 0x18102a, hemi: 1.0, moon: 0xb8a8ff, moonI: 1.2, props: "crystal", torches: true,
             mon: { skin: 0x1a1030, emissive: 0x2a1050, eye: 0xd070ff, spike: 0x9a70ff, tent: 0x221440, light: 0xc060ff } },
  lava:    { wall: 0x6e5c58, cap: 0x3c2c2a, tile: 0x7e6c66, fog: 0x180603, sky: 0x7a3a2a, ground: 0x6a1e08, hemi: 0.9, moon: 0xff9a70, moonI: 0.7, props: "lava", torches: false,
             mon: { skin: 0x100604, emissive: 0x701400, eye: 0xffd040, spike: 0x200806, tent: 0x1a0806, light: 0xff5010 } },
};
export const DEFAULT_MON = { skin: 0x1b0f22, emissive: 0x3a0610, eye: 0xff3020, spike: 0x0d0a10, tent: 0x24122c, light: 0xff2a1a };
