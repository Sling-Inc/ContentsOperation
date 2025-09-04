import fs from "fs/promises";
import path from "path";
import extract from "extract-zip";
import { Logger } from "#operation/utils/logger.js";
import { downloadMockTestFiles } from "#operation/utils/crawler/EBS/mockTest.js";
import { getInfoFromEbsMockTestFile } from "#root/operation/scripts/OP02_CSAT/_utils/ebsFileUtils.js";

async function processFiles(
  newlyDownloadedFilePaths,
  outputDir,
  year,
  month,
  grade
) {
  const allFiles = [];

  for (const filePath of newlyDownloadedFilePaths) {
    if (path.extname(filePath).toLowerCase() === ".zip") {
      const extractDir = path.join(
        path.dirname(filePath),
        path.basename(filePath, ".zip")
      );
      await fs.mkdir(extractDir, { recursive: true });
      await extract(filePath, { dir: extractDir });
      const extractedFiles = await fs.readdir(extractDir);
      for (const extractedFile of extractedFiles) {
        allFiles.push({
          path: path.join(extractDir, extractedFile),
          name: `${path.basename(filePath, ".zip")}/${extractedFile}`,
        });
      }
    } else {
      allFiles.push({ path: filePath, name: path.basename(filePath) });
    }
  }

  for (const file of allFiles) {
    const fileInfo = getInfoFromEbsMockTestFile(year, month, grade, file.name);
    if (fileInfo && fileInfo.section) {
      const { type, supervisor, section, subject } = fileInfo;
      const newFileName = `${
        type === "problem" || type === "explanation" ? `${type}_` : ""
      }${year}_${month}_${grade}_${supervisor.name}_${section}${
        subject ? `_${subject}` : ""
      }${path.extname(file.name)}`;
      const newFilePath = path.join(
        outputDir,
        type === "audio" ? "_audio" : type === "answer" ? "_answer" : "00_pdf",
        newFileName
      );
      await fs.mkdir(path.dirname(newFilePath), { recursive: true });
      await fs.copyFile(file.path, newFilePath);
      Logger.info(`Copied ${file.name} to ${newFileName}`);
    } else {
      Logger.warn(`Could not get info for file: ${file.name}`);
    }
  }
}

export async function F001_downloadFiles(
  mockTestCodePath,
  downloadRootDir,
  outputDir,
  targetYear,
  targetMonth
) {
  Logger.section("EBS 모의고사 파일 다운로드 및 처리 시작");

  const mockTestInfo = JSON.parse(await fs.readFile(mockTestCodePath, "utf8"));
  const targetIRecords = mockTestInfo[targetYear]?.[targetMonth];

  if (targetIRecords) {
    await fs.mkdir(outputDir, { recursive: true });

    for (const [grade, irecord] of Object.entries(targetIRecords)) {
      const targetFolder = `${targetYear}_${targetMonth}_${grade}`;
      const downloadDir = path.join(downloadRootDir, targetFolder);

      Logger.info(`다운로드 경로: ${downloadDir}`);
      Logger.info(`결과 저장 경로: ${outputDir}`);

      const newlyDownloadedFilePaths = await downloadMockTestFiles(
        irecord,
        downloadDir
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
