import fs from "fs/promises";
import path from "path";
import extract from "extract-zip";
import { Logger } from "#operation/utils/logger.js";
import { downloadMockTestFiles } from "#operation/utils/crawler/EBS/mockTest.js";
import { getInfoFromEbsMockTestFile } from "#root/operation/scripts/OP02_CSAT/_utils/ebsFileUtils.js";

const targetYear = "2024";
const targetMonth = "09";

async function processFiles(downloadDir, outputDir, year, month, grade) {
  const files = await fs.readdir(downloadDir);
  const allFiles = [];

  for (const file of files) {
    const filePath = path.join(downloadDir, file);
    const stats = await fs.stat(filePath);

    if (stats.isDirectory()) {
      continue;
    }

    if (path.extname(file).toLowerCase() === ".zip") {
      const extractDir = path.join(downloadDir, path.basename(file, ".zip"));
      await fs.mkdir(extractDir, { recursive: true });
      await extract(filePath, { dir: extractDir });
      const extractedFiles = await fs.readdir(extractDir);
      for (const extractedFile of extractedFiles) {
        allFiles.push({
          path: path.join(extractDir, extractedFile),
          name: `${path.basename(file, ".zip")}/${extractedFile}`,
        });
      }
    } else {
      allFiles.push({ path: filePath, name: file });
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

export async function F001_downloadFiles(mockTestCodePath) {
  Logger.section("EBS 모의고사 파일 다운로드 및 처리 시작");

  const mockTestInfo = JSON.parse(await fs.readFile(mockTestCodePath, "utf8"));
  const targetIRecords = mockTestInfo[targetYear]?.[targetMonth];

  if (targetIRecords) {
    const outputDir = path.join(process.cwd(), "workspace", "20250901_02");
    await fs.mkdir(outputDir, { recursive: true });

    for (const [grade, irecord] of Object.entries(targetIRecords)) {
      const targetFolder = `${targetYear}_${targetMonth}_${grade}`;
      const downloadDir = path.join(
        process.cwd(),
        "workspace",
        "downloads",
        targetFolder
      );

      Logger.info(`다운로드 경로: ${downloadDir}`);
      Logger.info(`결과 저장 경로: ${outputDir}`);

      await downloadMockTestFiles(irecord, downloadDir);
      await processFiles(
        downloadDir,
        outputDir,
        targetYear,
        targetMonth,
        grade
      );
    }
  }

  Logger.endSection();
}
