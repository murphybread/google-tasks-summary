// deploy.js - 배포 후 웹앱 URL 표시
const { execSync } = require("child_process");

const DEPLOYMENT_ID = "AKfycbxwi03iPbI7yvBTTagbtpt-sg4GU5JRlZ4kAQnXh9G8X_wiPJNkq_kPKMdiIGOoMQ";

// 커맨드 라인 인자에서 description 가져오기
// 사용법: npm run deploy "설명 메시지"
const description = process.argv[2] || "";

console.log("📤 코드를 Apps Script에 푸시합니다...\n");

try {
  execSync("clasp push", { stdio: "inherit" });
  console.log("\n✅ 푸시 완료!\n");
} catch (error) {
  console.error("❌ 푸시 실패:", error.message);
  process.exit(1);
}

console.log("🚀 배포를 업데이트합니다...\n");

try {
  const descFlag = description.trim() ? `-d "${description.trim()}"` : "";
  execSync(`clasp deploy -i ${DEPLOYMENT_ID} ${descFlag}`, { stdio: "inherit" });
  console.log("\n✅ 배포 완료!\n");
  if (description) {
    console.log(`📝 배포 설명: "${description}"\n`);
  }
} catch (error) {
  console.error("❌ 배포 실패:", error.message);
  process.exit(1);
}

// 웹앱 URL 표시
const webappUrl = `https://script.google.com/macros/s/${DEPLOYMENT_ID}/exec`;

console.log("━".repeat(60));
console.log("");
console.log("🌐 웹앱 URL:");
console.log("");
console.log(`   ${webappUrl}`);
console.log("");
console.log("━".repeat(60));
console.log("");
console.log("💡 팁:");
console.log("   - 위 URL을 브라우저에서 열어 앱을 테스트하세요");
console.log("   - 배포 목록 확인: npm run deployments");
console.log('   - 배포 설명 추가: npm run deploy "설명 메시지"');
console.log("");
