// Firebase 설정 파일
// Firebase 콘솔(https://console.firebase.google.com/)에서 프로젝트를 생성한 후
// '웹 앱 추가'에서 발급받은 구성 객체를 아래에 입력하세요.
// 설정하지 않아도 브라우저 로컬 저장소(localStorage)로 완전하게 동작합니다!

export const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

// 설정 입력 여부 확인
export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.projectId &&
  firebaseConfig.apiKey !== "" &&
  !firebaseConfig.apiKey.startsWith("YOUR_")
);
