import { Logger } from "#operation/utils/logger.js";
import { getMockTestIRecords } from "#operation/utils/crawler/EBS/mockTest.js";
import { writeFile } from "#operation/utils/file.js";
import path from "path";
import url from "url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

async function fetchAndMergeRecords(years, grades) {
  let allRecords = {};

  for (const year of years) {
    allRecords[year] = {};
    for (const grade of grades) {
      Logger.info(`${year}년 ${grade}학년 정보 수집 중...`);
      const records = await getMockTestIRecords(grade, year);
      if (records && records[year]) {
        Object.assign(allRecords[year], records[year]);
      }
    }
  }
  return allRecords;
}

export async function getMockTestCodes() {
  Logger.section("EBS 모의고사 코드 수집 시작");

  const yearsToScan = [2024, 2025];
  const gradesToScan = [1, 2, 3];

  const allRecords = await fetchAndMergeRecords(yearsToScan, gradesToScan);

  if (Object.keys(allRecords).length > 0) {
    const outputPath = path.join(__dirname, "mockTestCodes.json");
    await writeFile(outputPath, JSON.stringify(allRecords, null, 2));
    Logger.notice(`모든 코드를 ${outputPath} 파일에 저장했습니다.`);
    Logger.log(JSON.stringify(allRecords, null, 2));
  } else {
    Logger.warn("수집된 데이터가 없습니다.");
  }

  Logger.endSection();
}
