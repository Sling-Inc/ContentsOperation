import fs from "fs/promises";
import path from "path";

import { getFirebaseAdmin } from "#operation/credentials/firebaseCredentials.js";
import { existsFile } from "#operation/utils/file.js";
import { Logger } from "#operation/utils/logger.js";

const history = {
  "202508_CSE": {
    dir: "/Users/jgj/Documents/toy/contentsOperation/workspace/20250827_01/D01_postprocess_results",
  },
};

const TAG_CSE = "202508_CSE";
const TARGET_DIR = history[TAG_CSE].dir;

export async function R001_mergeUploadInfo() {
  Logger.section(`uploadInfo 파일 병합 작업을 시작합니다... ${TARGET_DIR}`);

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

    Logger.endSection();
  }

  await fs.writeFile(
    path.join(TARGET_DIR, "uploadInfo_merged.json"),
    JSON.stringify(result, null, 2)
  );

  Logger.endSection();
}
