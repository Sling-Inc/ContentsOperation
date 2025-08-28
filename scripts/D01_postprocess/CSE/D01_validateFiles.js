import fs from "fs/promises";
import { constants } from "fs"; // ← 추가 (constants는 fs에서)

import path from "path";
import { Logger } from "#root/utils/logger.js";

/**
 * node scripts/D01_postprocess/CSE/D01_validateFiles.js  workspace/20250827_01/D01_postprocess_results
 */

async function fileExists(path) {
  try {
    await fs.access(path, constants.F_OK); // 존재 여부만 확인
    return true;
  } catch (e) {
    return false;
  }
}

async function dirExists(path) {
  try {
    const stats = await fs.stat(path);
    return stats.isDirectory(); // 디렉토리면 true
  } catch {
    return false; // 없거나 접근 불가
  }
}

async function run(inputDir) {
  Logger.section(`Start validating files from ${inputDir}`);

  const entries = await fs.readdir(inputDir, { withFileTypes: true });
  const subdirectories = entries.filter((entry) => entry.isDirectory());

  if (subdirectories.length === 0) {
    Logger.warn("No subdirectories found in the input directory.");
    Logger.endSection();
    return;
  }

  for (const subdir of subdirectories) {
    const subdirName = subdir.name;
    Logger.info(`Processing: ${subdirName}`);

    //1. 각종 파일 확인
    const infoFilePath = path.join(inputDir, subdirName, "bbox.json");
    const answersFilePath = path.join(inputDir, subdirName, "answers.json");
    const metadataFilePath = path.join(inputDir, subdirName, "metadata.json");
    const imagesPath = path.join(inputDir, subdirName, "images");

    if (!(await fileExists(infoFilePath))) {
      Logger.error(`${infoFilePath} not found`);
      Logger.endSection();
      continue;
    }

    if (!(await fileExists(answersFilePath))) {
      Logger.error(`${answersFilePath} not found`);
      Logger.endSection();
      continue;
    }

    if (!(await fileExists(metadataFilePath))) {
      Logger.error(`${metadataFilePath} not found`);
      Logger.endSection();
      continue;
    }

    if (!(await dirExists(imagesPath))) {
      Logger.error(`${imagesPath} not found`);
      Logger.endSection();
      continue;
    }

    //2. 각종 파일 내용 확인

    const infoFile = JSON.parse(await fs.readFile(infoFilePath, "utf8"));
    const bbox = infoFile?.bbox;

    const answersFile = JSON.parse(await fs.readFile(answersFilePath, "utf8"));
    const answers = answersFile?.answers;

    if (!bbox || bbox.length === 0) {
      Logger.error(`${infoFilePath} has no bbox`);
      Logger.endSection();
      continue;
    }

    if (!answers || answers.length === 0) {
      Logger.error(`${answersFilePath} has no answer`);
      Logger.endSection();
      continue;
    }

    for (const box of bbox) {
      const id = box.id;
      const type = box.type;

      if (!(await fileExists(path.join(imagesPath, `${type}_${id}.png`)))) {
        Logger.error(`${imagesPath}/${type}_${id}.png not found`);
        Logger.endSection();
        continue;
      }

      if (type === "problem") {
        const choiceCount = box.choiceCount;

        if (
          !Number.isInteger(choiceCount) ||
          choiceCount < 0 ||
          choiceCount > 5
        ) {
          Logger.error(`${infoFilePath} has invalid choiceCount`);
          Logger.endSection();
          continue;
        }

        const answer = answers.find((a) => a.id === id);
        if (!answer) {
          Logger.error(`${answersFilePath} has no answer for ${id}`);
          Logger.endSection();
          continue;
        }

        const answerChoice = answer.answer;

        if (!answerChoice || answerChoice.length === 0) {
          Logger.error(`${answersFilePath} has no answer for ${id}`);
          Logger.endSection();
          continue;
        }

        for (const choice of answerChoice) {
          if (!Number.isInteger(choice) || choice < 1 || choice > choiceCount) {
            Logger.error(`${answersFilePath} has invalid answer for ${id}`);
            Logger.endSection();
            continue;
          }
        }
      } else if (type === "passage") {
        const problemIds = box.problemIds;

        if (!problemIds || problemIds.length === 0) {
          Logger.error(`${infoFilePath} has no problemIds`);
          Logger.endSection();
          continue;
        }

        for (const problemId of problemIds) {
          const problem = bbox.find((b) => b.id === problemId);
          if (!problem) {
            Logger.error(`${infoFilePath} has invalid problemId`);
            Logger.endSection();
            continue;
          }
        }
      }
    }
  }

  Logger.endSection();
}

/**
 * 스크립트 진입점
 */
function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    Logger.error(
      "Usage: node scripts/D01_postprocess/CSE/D01_validateFiles.js <input_directory>"
    );
    process.exit(1);
  }

  const [inputDir] = args;
  run(inputDir).finally(() => {
    Logger.close();
  });
}

main();
