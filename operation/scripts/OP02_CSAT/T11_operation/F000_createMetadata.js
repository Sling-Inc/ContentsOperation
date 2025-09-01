/**
  node operation OP02_CSAT T11_operation F000
 */
import path from "path";
import { getMaterialInfo } from "../_utils/materialUtils.js";

import {
  readDirectories,
  readJSONFile,
  existsFile,
  writeFile,
} from "#root/operation/utils/file.js";
import { Logger } from "#operation/utils/logger.js";

export async function F000_createMetadata(TARGET_DIR, THUMBNAIL_DIR) {
  Logger.section("Create Metadata json");

  const dirs = await readDirectories(TARGET_DIR);

  for (const dir of dirs) {
    const [type, year, month, grade, supervisor, section, subject] =
      dir.split("_");

    let metadataTypes = ["default"];
    if (["국어", "수학"].includes(section)) {
      if (grade === "3") {
        metadataTypes = (
          await readDirectories(path.join(TARGET_DIR, dir))
        ).filter((item) => item !== section);
      } else metadataTypes = [section];
    }
    for (const metadataType of metadataTypes) {
      const metadataPath = path.join(
        TARGET_DIR,
        dir,
        `metadata_${metadataType}.json`
      );
      let metadata = {};

      //
      // 시험지 메타데이터 생성
      //
      if (type === "problem") {
        metadata = {
          ...metadata,
          type: "problem",
          maxScore: 0,
          info: getMaterialInfo(
            year,
            month,
            grade,
            supervisor,
            section,
            ["default", "국어", "수학"].includes(metadataType)
              ? subject
              : metadataType
          ),
          problems: {},
          passages: {},
        };

        const thumbnailTitle = `${metadata.info.metadata.executionMonth}월_고${metadata.info.metadata.highSchoolYear}_${metadata.info.metadata.supervisor}_${metadata.info.metadata.section.name}_${metadata.info.metadata.subject.name}.png`;

        if (!existsFile(path.join(THUMBNAIL_DIR, "150", thumbnailTitle))) {
          console.log("150", thumbnailTitle);
        }
        if (!existsFile(path.join(THUMBNAIL_DIR, "640", thumbnailTitle))) {
          console.log("640", thumbnailTitle);
        }

        metadata.thumbnailImage = {
          150: path.join(THUMBNAIL_DIR, "150", thumbnailTitle),
          640: path.join(THUMBNAIL_DIR, "640", thumbnailTitle),
        };

        for (const sub of ["default", "국어", "수학"].includes(metadataType)
          ? [metadataType]
          : [section, metadataType]) {
          console.log(dir, sub);
          const infoFilePath = path.join(TARGET_DIR, dir, sub, "bbox.json");
          const infoFile = await readJSONFile(infoFilePath);

          const boxes = Object.values(
            infoFile.bbox.reduce((acc, item) => {
              if (!acc[item.id]) acc[item.id] = item;
              return acc;
            }, {})
          );

          for (const box of boxes) {
            if (box.type === "question") {
              metadata.problems[box.id] = {
                score: box.score,
                imageURL: path.join(
                  TARGET_DIR,
                  dir,
                  sub,
                  "images",
                  `question-${box.id}.png`
                ),
              };
              metadata.maxScore += box.score;
            } else if (box.type === "passage") {
              metadata.passages[box.id] = {
                problemIds: box.problemIds,
                imageURL: path.join(
                  TARGET_DIR,
                  dir,
                  sub,
                  "images",
                  `passage-${box.id}.png`
                ),
              };
            }
          }
        }

        // problem, passage 값을 점검합니다.
        for (const problem of Object.values(metadata.problems)) {
          // 이미지 확인
          if (!existsFile(problem.imageURL)) {
            Logger.warn(`[${dir}] problem: ${problem.id} 이미지가 없습니다.`);
          }
        }

        for (const passage of Object.values(metadata.passages)) {
          // 이미지 확인
          if (!existsFile(passage.imageURL)) {
            Logger.warn(`[${dir}] passage: ${passage.id} 이미지가 없습니다.`);
          }
          // problemIds 확인
          for (const problemId of passage.problemIds) {
            if (!metadata.problems[problemId]) {
              Logger.warn(`[${dir}] passage: ${passage.id} 문제가 없습니다.`);
            }
          }
        }

        console.log(dir, metadata.maxScore);
      }
      //
      // 해설
      //
      else {
        metadata = {
          ...metadata,
          type: "explanation",
          problems: {},
          passages: {},
        };

        for (const sub of ["default", "국어", "수학"].includes(metadataType)
          ? [metadataType]
          : [section, metadataType]) {
          const infoFilePath = path.join(TARGET_DIR, dir, sub, "bbox.json");
          const infoFile = await readJSONFile(infoFilePath);

          const boxes = Object.values(
            infoFile.bbox.reduce((acc, item) => {
              if (!acc[item.id]) acc[item.id] = item;
              return acc;
            }, {})
          );

          for (const box of boxes) {
            if (box.type === "question") {
              metadata.problems[box.id] = {
                imageURL: path.join(
                  TARGET_DIR,
                  dir,
                  sub,
                  "images",
                  `question-${box.id}.png`
                ),
              };
            } else if (box.type === "passage") {
              metadata.passages[box.id] = {
                imageURL: path.join(
                  TARGET_DIR,
                  dir,
                  sub,
                  "images",
                  `passage-${box.id}.png`
                ),
              };
            }
          }
        }
      }

      await writeFile(metadataPath, JSON.stringify(metadata, null, 2));
    }
  }

  Logger.endSection();
}
