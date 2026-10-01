// 관리웹 공개 설정. 이 파일은 GitHub Pages 로 그대로 공개된다 → 공개해도 되는 값만 둔다.
//  - Firebase 웹 API 키는 클라이언트용 공개값이다(보안은 로그인 + 서버 권한 검사). 서버 키·토큰·서비스계정은 절대 넣지 않는다.
//  - 배포 전 tools/verify-publish.mjs 가 금지 패턴을 검사한다.
window.ES7_CONFIG = {
  apiBase: "https://easyscan7-api-1059112315055.asia-northeast3.run.app",
  firebase: {
    apiKey: "AIzaSyAnyTxCajb2JQjRWHfM9QTdE6tMKlpXCNM",
    projectId: "gen-lang-client-0598304740",
    authDomain: "gen-lang-client-0598304740.firebaseapp.com",
  },
};
