import { Logger } from "#operation/utils/logger.js";
import { downloadMockTestFiles } from "#operation/utils/crawler/EBS/mockTest.js";
import path from "path";

export async function testDownload() {
  Logger.section("EBS 모의고사 파일 다운로드 테스트 시작");

  const irecord = "202504303"; // 2024년 6월 고2 학력평가
  const outputDir = path.join(process.cwd(), "workspace", "downloads", irecord);

  Logger.info(`다운로드 경로: ${outputDir}`);

  await downloadMockTestFiles(irecord, outputDir);

  Logger.endSection();
}
