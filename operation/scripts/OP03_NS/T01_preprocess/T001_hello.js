import { Logger } from "#operation/utils/logger.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function T001_hello() {
  const totalFiles = 10;
  Logger.log("새로운 로거 테스트를 시작합니다.");

  Logger.startProgress(`파일 처리 시작... (0/${totalFiles})`);

  for (let i = 1; i <= totalFiles; i++) {
    await sleep(500); // 0.5초 대기
    Logger.updateProgress(`파일 처리 중... (${i}/${totalFiles})`);

    if (i === 3) {
      Logger.info("중간 로그: 3번째 파일을 처리했습니다.");
    }
    if (i === 7) {
      Logger.warn("경고: 7번째 파일에서 사소한 문제가 발견되었습니다.");
    }
  }

  Logger.endProgress(`총 ${totalFiles}개의 파일 처리가 완료되었습니다.`);
  Logger.log("로거 테스트를 종료합니다.");
}
