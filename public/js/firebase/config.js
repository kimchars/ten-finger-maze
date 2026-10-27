// Firebase 설정 파일
// Firebase 콘솔(https://console.firebase.google.com/)에서 프로젝트를 생성한 후
// '웹 앱 추가'에서 발급받은 구성 객체를 아래에 입력하세요.
// 설정하지 않아도 브라우저 로컬 저장소(localStorage)로 완전하게 동작합니다!

// 웹 앱 구성 값은 공개돼도 괜찮아요. 데이터 보호는 firestore.rules가 맡아요.
export const firebaseConfig = {
  apiKey: "AIzaSyCz8W7dqObMvMCtTYZtidyv1fkth-pNVLE",
  authDomain: "devday-5e9e4.firebaseapp.com",
  projectId: "devday-5e9e4",
  storageBucket: "devday-5e9e4.firebasestorage.app",
  messagingSenderId: "1043262352548",
  appId: "1:1043262352548:web:f4b4f03f263c98fd4f0a31",
  measurementId: "G-8KGWHJJLFG"
};

// 설정 입력 여부 확인
export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.projectId &&
  firebaseConfig.apiKey !== "" &&
  !firebaseConfig.apiKey.startsWith("YOUR_")
);
