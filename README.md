# 열 손가락 미로 (Ten-Finger Maze) 🖐️🏰

> **웹캠 하나로 두 사람이 함께 즐기는 10손가락 협동 3D 미로 탈출 게임**
> Three.js(WebGL) 3D 던전 렌더링 + Google MediaPipe 온디바이스 손 인식 + Firebase(Firestore & Auth) 글로벌 온라인 순위표

---

## 🎮 게임 소개

- **P1 (탐험가 - 화면 왼쪽 손)**: 랜턴을 들고 어두운 미로를 탐험합니다.
  - **검지**: 위로 이동 `↑`
  - **중지**: 아래로 이동 `↓`
  - **약지**: 왼쪽으로 이동 `←`
  - **새끼**: 오른쪽으로 이동 `→`
  - **엄지**: 엄지를 접으면 **랜턴 끄기** (박쥐 떼와 그림자 괴물의 시야를 피해 숨기)
- **P2 (문지기 - 화면 오른쪽 손)**: 색깔 철창과 물/용암 다리를 조작합니다.
  - **엄지 ~ 새끼 (1~5번)**: 각 손가락에 연결된 색깔 철창을 열거나 다리를 띄웁니다.
  - **소나 핑 (손 폈다가 주먹 쥐기)**: 음파를 쏘아 미로 벽면과 출구 위치, 괴물의 반사파를 감지합니다.
  - **괴물 덫 (엄지·새끼만 펴기)**: 가까이 다가온 그림자 괴물을 3.5초간 얼려 무력화합니다.

---

## ⚡ 주요 최적화 기술

1. **Web Worker 기반 비동기 손 인식**:
   - 무거운 MediaPipe 비전 연산(10~30ms)을 메인 스레드와 분리된 `hand-worker.js`에서 실행하여 60fps 3D 애니메이션의 프레임 드랍을 완전히 제거했습니다.
2. **GPU 인스턴싱 (InstancedMesh) & 지오메트리 병합 (mergeGeometries)**:
   - 수백 개의 바닥 타일, 벽체, 촉수 구체, 소나 발광 캡 등을 인스턴싱하여 Draw Call을 50회 미만으로 극소화했습니다.
3. **적응형 동적 해상도 스케일러 (Dynamic Resolution Scaling)**:
   - 기기 사양에 맞춰 프레임레이트를 실시간 측정하고, 45fps 이하로 떨어질 경우 렌더링 배율을 자동 조절하여 저사양 PC/노트북에서도 쾌적하게 구동됩니다.
4. **절차적 Web Audio 신디사이저**:
   - 무거운 외부 MP3/WAV 오디오 다운로드 없이 Web Audio API 오실레이터와 바이쿼드 필터로 발걸음, 철창음, 괴물 포효, 신호음 등 20여 가지 사운드를 실시간 합성합니다.
5. **오프라인 우선 (Offline-First) 하이브리드 순위표**:
   - Firebase 미설정 상태이거나 오프라인 환경에서도 `localStorage` 기반으로 모든 기록이 보존되며, Firebase 연동 시 Cloud Firestore로 글로벌 동기화됩니다.

---

## 📂 프로젝트 구조

```
ten-finger-maze/
├── public/                          # 정적 웹 호스팅 루트
│   ├── index.html                   # 메인 HTML 껍데기
│   ├── css/
│   │   └── style.css                # 전체 반응형 다크 테마 스타일
│   ├── workers/
│   │   └── hand-worker.js           # MediaPipe 백그라운드 손 인식 Web Worker
│   └── js/
│       ├── main.js                  # 게임 엔진 초기화 및 메인 렌더 루프
│       ├── config.js                # 스테이지 색상, 타이밍, 키 맵 등 전역 설정
│       ├── store.js                 # 브라우저 스토리지 래퍼
│       ├── audio.js                 # Web Audio 실시간 음향 합성기
│       ├── input.js                 # 키보드 테스트 키 및 손가락 제스처 통합
│       ├── hand/
│       │   ├── camera.js            # 웹캠 피드 및 P1/P2 손 역할 지속 추적
│       │   ├── tracker.js           # 손가락 관절 각도 계산 및 굽힘 판정 (Hysteresis)
│       │   ├── overlay.js           # 카메라 뷰포트 위 관절 골격 오버레이
│       │   └── calibration.js       # 개인별 손가락 가동범위 맞춤 보정 시스템
│       ├── 3d/
│       │   ├── engine.js            # Three.js 씬, 카메라, 조명, 블룸 후처리
│       │   ├── world.js             # 던전 지형 인스턴싱, 액체 평면, 소품 배치
│       │   ├── entities.js          # 플레이어, 괴물, 철창, 출구 포탈, 횃불, 박쥐 메쉬
│       │   ├── particles.js         # GPU 파티클 시스템 (불꽃, 스파크, 충격파)
│       │   ├── camera.js            # 플레이어 추적 시점, UI 회피 시야 보정, 카메라 셰이크
│       │   └── sync.js              # 매 프레임 캐릭터 애니메이션, 촉수 IK, 소나 파동 동기화
│       ├── game/
│       │   ├── stages.js            # 5개 테마 스테이지 맵 데이터 (동굴, 이끼, 광산, 수정, 용암)
│       │   ├── state.js             # 런타임 게임 상태 객체
│       │   └── logic.js             # 캐릭터 이동, 문 개폐 충돌, 괴물 순찰/피격 판정
│       ├── ui/
│       │   ├── hud.js               # 상/하단 HUD 게이지, 손 유실 경고, 성능 표시기
│       │   ├── radar.js             # 2D 소나 핑 원형 레이더 캔버스
│       │   ├── toast.js             # 인게임 안내 메시지 및 힌트 알림
│       │   └── screens.js           # 타이틀, 인트로, 클리어, 순위표 UI
│       └── firebase/
│           ├── config.js            # Firebase 프로젝트 설정 (설정 가이드 포함)
│           ├── init.js              # Firebase Modular SDK v11 초기화
│           ├── auth.js              # 익명(Anonymous) 인증 관리
│           └── leaderboard.js       # Cloud Firestore 글로벌 순위표 CRUD
├── firebase.json                    # Firebase Hosting & Firestore 규칙 구성
├── firestore.rules                  # Firestore 보안 규칙 (데이터 무결성 및 치팅 방지)
├── package.json                     # 실행 스크립트 정의
└── README.md
```

---

## 🚀 로컬 실행 방법

### 방법 1: 즉시 로컬 웹서버 실행 (Node.js 환경)
```bash
# ten-finger-maze 폴더로 이동
cd ten-finger-maze

# 정적 로컬 서버 구동 (포트 5000)
npm start
```
브라우저에서 `http://localhost:5000` 접속 후 카메라 권한을 허용하면 바로 플레이할 수 있습니다.

### 방법 2: Firebase 에뮬레이터로 풀스택 로컬 테스트
```bash
npm run dev
```

---

## 🔥 Firebase 연동 가이드 (온라인 순위표 활성화)

1. [Firebase Console](https://console.firebase.google.com/) 접속 후 새 프로젝트를 생성합니다.
2. **Authentication(인증)** 메뉴에서 **익명(Anonymous)** 로그인을 사용 설정합니다.
3. **Firestore Database** 메뉴에서 데이터베이스를 만듭니다.
4. **프로젝트 설정 > 일반 > 내 앱**에서 **웹 앱(`</>`)**을 추가하고 제공되는 `firebaseConfig` 객체를 복사합니다.
5. `public/js/firebase/config.js` 파일을 열고 복사한 키 값을 붙여넣습니다:
   ```javascript
   export const firebaseConfig = {
     apiKey: "AIzaSy...",
     authDomain: "your-project.firebaseapp.com",
     projectId: "your-project",
     storageBucket: "your-project.firebasestorage.app",
     messagingSenderId: "...",
     appId: "1:...:web:..."
   };
   ```
6. 터미널에서 Firebase에 배포합니다:
   ```bash
   npx -y firebase-tools@latest login
   npx -y firebase-tools@latest use your-project-id
   npm run deploy
   ```

---

## ⌨️ 키보드 단독 테스트 모드

웹캠이 없거나 1인 개발 테스트 시 키보드로 모든 동작을 대신할 수 있습니다:
- **P1 (탐험가)**: 방향키 `↑` `↓` `←` `→`, 랜턴 끄기 `Space`
- **P2 (문지기)**: 손가락 구부리기 `1`, `2`, `3`, `4`, `5`, 소나 핑 `P`, 괴물 덫 `T`
- **시스템**: 메뉴/재시작 `Esc` / `R`, 음소거 `M`, 성능 창 `F`, 카메라 접기 `C`, 확인 `Enter`

---

## 📄 라이선스
MIT License
