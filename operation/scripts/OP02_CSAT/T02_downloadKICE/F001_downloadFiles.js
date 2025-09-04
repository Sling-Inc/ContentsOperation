import fs from "fs/promises";
import path from "path";
import extract from "extract-zip";
import { Logger } from "#operation/utils/logger.js";
import { downloadMockTestFiles } from "#operation/utils/crawler/KICE/mockTest.js";
import { getInfoFromKiceMockTestFile } from "#root/operation/scripts/OP02_CSAT/_utils/kiceFileUtils.js";

async function processFiles(
  downloadedFilePaths,
  outputDir,
  year,
  month
) {
  const allFiles = [];

  for (const filePath of downloadedFilePaths) {
    if (path.extname(filePath).toLowerCase() === ".zip") {
      const extractDir = path.resolve(
        path.dirname(filePath),
        path.basename(filePath, ".zip")
      );
      await fs.mkdir(extractDir, { recursive: true });
      await extract(filePath, { dir: extractDir });
      const extractedFiles = await fs.readdir(extractDir);
      for (const extractedFile of extractedFiles) {
        allFiles.push({
          path: path.join(extractDir, extractedFile),
          name: path.basename(extractedFile),
        });
      }
    } else {
      allFiles.push({ path: filePath, name: path.basename(filePath) });
    }
  }

  for (const file of allFiles) {
    const fileInfo = getInfoFromKiceMockTestFile(
      year,
      month,
      "고3",
      file.name
    );
    if (fileInfo && fileInfo.section) {
      const { type, supervisor, section, subject } = fileInfo;
      const newFileName = `${
        type === "problem" || type === "explanation" ? `${type}_` : ""
      }${year}_${month}_고3_${supervisor.name}_${section}${
        subject && section !== subject ? `_${subject}` : ""
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
  url,
  downloadRootDir,
  outputDir,
  targetYear,
  targetMonth
) {
  Logger.section("KICE 자료 다운로드를 시작합니다.");

  const downloadDir = path.join(
    downloadRootDir,
    `${targetYear}_${targetMonth}_KICE`
  );
  await fs.mkdir(downloadDir, { recursive: true });

  const newlyDownloadedFilePaths = await downloadMockTestFiles(url, downloadDir);

  if (newlyDownloadedFilePaths && newlyDownloadedFilePaths.length > 0) {
    await processFiles(
      newlyDownloadedFilePaths,
      outputDir,
      targetYear,
      targetMonth
    );
  } else {
    Logger.info("새로 다운로드할 파일이 없어 처리를 건너뜁니다.");
  }

  Logger.endSection();
}