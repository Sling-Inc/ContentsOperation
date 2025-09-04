import fs from "fs/promises";
import path from "path";
import extract from "extract-zip";
import { Logger } from "#operation/utils/logger.js";
import { downloadMockTestFiles } from "#operation/utils/crawler/EBS/mockTest.js";
import { getInfoFromEbsMockTestFile } from "#root/operation/scripts/OP02_CSAT/_utils/ebsFileUtils.js";

/**
 * @typedef {import("#operation/utils/crawler/EBS/mockTest.js").MockTestFile} MockTestFile
 */
/**
 * 파일 타입에 따라 저장될 하위 디렉토리 이름을 반환합니다.
 * @param {string} type - 파일 타입 (e.g., "audio", "answer", "problem")
 * @returns {string} - 하위 디렉토리 이름
 */
function getDestinationSubdir(type) {
  const dirMap = {
    audio: "_audio",
    answer: "_answer",
  };
  return dirMap[type] || "00_pdf";
}

/**
 * 단일 파일을 분석하여 정해진 규칙에 따라 새 이름으로 복사합니다.
 * @param {object} file - 파일 정보 객체 { filePath, relativeName }
 * @param {string} outputDir - 최종 출력 루트 디렉토리
 * @param {string} year - 연도
 * @param {string} month - 월
 * @param {string} grade - 학년
 */
async function organizeFile(
  { filePath, relativeName },
  outputDir,
  year,
  month,
  grade
) {
  const fileInfo = getInfoFromEbsMockTestFile(year, month, grade, relativeName);

  if (!fileInfo || !fileInfo.section) {
    Logger.warn(`Could not get info for file: ${relativeName}`);
    return;
  }

  const { type, supervisor, section, subject } = fileInfo;
  const newFileName = `${
    type === "problem" || type === "explanation" ? `${type}_` : ""
  }${year}_${month}_${grade}_${supervisor.name}_${section}${
    subject ? `_${subject}` : ""
  }${path.extname(relativeName)}`;

  const destSubDir = getDestinationSubdir(type);
  const newFilePath = path.join(outputDir, destSubDir, newFileName);

  await fs.mkdir(path.dirname(newFilePath), { recursive: true });
  await fs.copyFile(filePath, newFilePath);
  Logger.info(`Copied ${relativeName} to ${newFileName}`);
}

/**
 * 다운로드된 파일 목록을 순회하며 ZIP 파일의 압축을 해제하고,
 * 모든 파일의 최종 목록을 플랫하게 만들어 반환합니다.
 * @param {string[]} downloadedFilePaths - 다운로드된 파일들의 경로 배열
 * @returns {Promise<Array<{filePath: string, relativeName: string}>>} - 처리할 모든 파일 정보 배열
 */
async function listAllFiles(downloadedFilePaths) {
  const filePromises = downloadedFilePaths.map(async (filePath) => {
    if (path.extname(filePath).toLowerCase() !== ".zip") {
      return [{ filePath, relativeName: path.basename(filePath) }];
    }

    const zipFileName = path.basename(filePath, ".zip");
    const extractDir = path.join(path.dirname(filePath), zipFileName);
    await fs.mkdir(extractDir, { recursive: true });
    await extract(filePath, { dir: extractDir });

    const extractedFiles = await fs.readdir(extractDir);
    return extractedFiles.map((extractedFile) => ({
      filePath: path.join(extractDir, extractedFile),
      relativeName: `${zipFileName}/${extractedFile}`,
    }));
  });

  const nestedFiles = await Promise.all(filePromises);
  return nestedFiles.flat();
}

/**
 * 다운로드된 파일들을 병렬로 처리하여 정리합니다.
 * @param {string[]} newlyDownloadedFilePaths - 새로 다운로드된 파일 경로 배열
 * @param {string} outputDir - 출력 디렉토리
 * @param {string} year - 연도
 * @param {string} month - 월
 * @param {string} grade - 학년
 */
async function processFiles(
  newlyDownloadedFilePaths,
  outputDir,
  year,
  month,
  grade
) {
  // 1. ZIP 파일 압축을 풀고 모든 파일 목록을 병렬로 가져옵니다.
  const allFiles = await listAllFiles(newlyDownloadedFilePaths);

  // 2. 모든 파일을 병렬로 복사하고 이름을 변경합니다.
  const processingPromises = allFiles.map((file) =>
    organizeFile(file, outputDir, year, month, grade)
  );
  await Promise.all(processingPromises);
}

/**
 * EBSi에서 특정 연도와 월의 모의고사 파일을 다운로드하고,
 * 정해진 명명 규칙에 따라 파일 이름을 변경하여 최종 디렉토리에 정리합니다.
 * @param {string} mockTestCodePath - `mockTestCodes.json` 파일의 경로.
 * @param {string} downloadRootDir - 다운로드한 파일을 임시 저장할 루트 디렉토리.
 * @param {string} outputDir - 최종적으로 정리된 파일을 저장할 디렉토리.
 * @param {object} config - 다운로드 대상 설정 객체.
 * @param {string} config.targetYear - 다운로드할 모의고사의 연도.
 * @param {string} config.targetMonth - 다운로드할 모의고사의 월.
 * @param {string[]} [config.targetGrades] - 다운로드할 학년 목록 (e.g., ['1', '3']). 지정하지 않으면 모든 학년을 처리합니다.
 * @param {MockTestFile["section"][]} [config.targetSections] - 다운로드할 과목 목록 (e.g., ['국어', '수학']). 지정하지 않으면 모든 과목을 처리합니다.
 * @param {MockTestFile["fileCategory"][]} [config.targetFileTypes] - 다운로드할 파일 종류
 */
export async function F001_downloadFiles(
  mockTestCodePath,
  downloadRootDir,
  outputDir,
  config
) {
  const {
    targetYear,
    targetMonth,
    targetGrades,
    targetSections,
    targetFileTypes,
  } = config;
  Logger.section("EBS 모의고사 파일 다운로드 및 처리 시작");

  const mockTestInfo = JSON.parse(await fs.readFile(mockTestCodePath, "utf8"));
  const targetIRecords = mockTestInfo[targetYear]?.[targetMonth];

  if (targetIRecords) {
    await fs.mkdir(outputDir, { recursive: true });

    for (const [grade, irecord] of Object.entries(targetIRecords)) {
      // targetGrades가 있을 떄 현재 학년이 포함되지 않으면 건너뜁니다.
      if (
        targetGrades &&
        targetGrades.length > 0 &&
        !targetGrades.includes(grade)
      ) {
        continue;
      }

      const targetFolder = `${targetYear}_${targetMonth}_${grade}`;
      const downloadDir = path.join(downloadRootDir, targetFolder);

      Logger.info(`다운로드 경로: ${downloadDir}`);
      Logger.info(`결과 저장 경로: ${outputDir}`);

      const newlyDownloadedFilePaths = await downloadMockTestFiles(
        irecord,
        downloadDir,
        { targetSections, targetFileTypes }
      );

      if (newlyDownloadedFilePaths.length > 0) {
        await processFiles(
          newlyDownloadedFilePaths,
          outputDir,
          targetYear,
          targetMonth,
          grade
        );
      } else {
        Logger.info(
          `${targetFolder}에 새로 다운로드할 파일이 없어 처리를 건너뜁니다.`
        );
      }
    }
  }

  Logger.endSection();
}
