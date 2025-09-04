import fs from "fs/promises";
import path from "path";

import { getFirebaseAdmin } from "#operation/credentials/firebaseCredentials.js";
import { existsFile } from "#operation/utils/file.js";
import { Logger } from "#operation/utils/logger.js";

const history = {
  "202501_naesin": {
    dir: "/Users/sling/workspace/ContentsOperation/workspace_1/D01_postprocess_results",
  },
};

const TAG_NAESIN = "202501_naesin";
const TARGET_DIR = history[TAG_NAESIN].dir;

export async function R001_mergeUploadInfo() {
  Logger.section(`내신 uploadInfo 파일 병합 작업을 시작합니다... ${TARGET_DIR}`);

  const entries = await fs.readdir(TARGET_DIR, { withFileTypes: true });
  const subdirectories = entries.filter((entry) => entry.isDirectory());

  const result = {};

  if (subdirectories.length === 0) {
    Logger.warn("No subdirectories found in the input directory.");
    Logger.endSection();
    return;
  }

  for (const subdir of subdirectories) {
    const subdirName = subdir.name.normalize("NFC");

    Logger.section(`폴더: ${subdirName}`);

    let uploadInfo = {};

    const uploadInfoFilePath = path.join(
      TARGET_DIR,
      subdirName,
      "uploadInfo.json"
    );

    if (await existsFile(uploadInfoFilePath)) {
      uploadInfo = JSON.parse(await fs.readFile(uploadInfoFilePath, "utf8"));
    }

    result[subdirName] = uploadInfo;

    Logger.info(`✅ ${subdirName} uploadInfo 병합 완료`);
    Logger.endSection();
  }

  const mergedFilePath = path.join(TARGET_DIR, "uploadInfo_merged.json");
  await fs.writeFile(
    mergedFilePath,
    JSON.stringify(result, null, 2)
  );

  Logger.info(`총 ${subdirectories.length}개 폴더의 uploadInfo 병합 완료`);
  Logger.info(`병합된 파일: ${mergedFilePath}`);
  Logger.endSection("uploadInfo 병합 작업 완료");
}