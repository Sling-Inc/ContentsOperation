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
  readFilesWithExt,
} from "#root/operation/utils/file.js";
import { Logger } from "#operation/utils/logger.js";

export async function F003_createMetadata(TARGET_DIR, THUMBNAIL_DIR) {
  Logger.section("Create Metadata json");

  const dirs = await readDirectories(TARGET_DIR);

  /*
   * 1. 시험지 & 해설지 메타데이터 생성
   */
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
      if (existsFile(metadataPath)) {
        metadata = await readJSONFile(metadataPath);
      }

      //
      // 시험지 메타데이터 생성
      //
      if (type === "problem") {
        const answerFilePath = path.join(TARGET_DIR, dir, "answers.json");
        console.log(answerFilePath);
        const answerFile = await readJSONFile(answerFilePath);

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
          problems: { ...metadata.problems },
          passages: { ...metadata.passages },
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

          console.log(
            sub === "default" ? (subject === "공통" ? section : subject) : sub
          );
          let answerInfo = answerFile.find(
            (item) =>
              item.subject ===
              (sub === "default"
                ? subject === "공통"
                  ? section
                  : subject
                : sub)
          )?.answers;

          const audioFiles = await readFilesWithExt(
            path.join(TARGET_DIR, dir, sub, "audio"),
            ".mp3"
          );

          //if (!answerInfo) Logger.warn(`[${dir}] ${sub} 정답 정보가 없습니다.`);
          if (!answerInfo) answerInfo = answerFile[0].answers;

          const boxes = Object.values(
            infoFile.bbox.reduce((acc, item) => {
              if (!acc[item.id]) acc[item.id] = item;
              return acc;
            }, {})
          );

          for (const box of boxes) {
            if (box.type === "question") {
              const answer = answerInfo?.find(
                (item) => item.id === box.id
              )?.answer;

              const audioFile = audioFiles.find((item) =>
                item.endsWith("/" + box.id + ".mp3")
              );

              if (!answer)
                Logger.warn(`[${dir}] problem: ${box.id} 정답이 없습니다.`);
              metadata.problems[box.id] = {
                ...metadata.problems[box.id],
                score: box.score,
                answer: answer,
                isChoice: box.isChoice,
                audioURL: audioFile,
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
                ...metadata.passages[box.id],
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
        for (const [id, problem] of Object.entries(metadata.problems)) {
          // 이미지 확인
          if (!existsFile(problem.imageURL)) {
            Logger.warn(`[${dir}] problem: ${id} 이미지가 없습니다.`);
          }

          // 주관식 확인
          if (!problem.isChoice) {
            Logger.notice(`[${dir}] problem ${id} 주관식입니다.`);
          }

          // 오디오 파일 확인
          if (problem.audioURL && !existsFile(problem.audioURL)) {
            Logger.warn(`[${dir}] problem: ${id} 오디오가 없습니다.`);
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

  /**
   * 2. 시험지 & 해설지 메타데이터 병합
   */

  Logger.section("해설 이미지 확인...");
  for (const dir of dirs) {
    const [type, year, month, grade, supervisor, section, subject] =
      dir.split("_");

    const metadataFiles = (
      await readFilesWithExt(path.join(TARGET_DIR, dir), ".json")
    ).filter((item) => !item.startsWith("metadata"));

    for (const metadataFile of metadataFiles) {
      const metadata = await readJSONFile(metadataFile);
      if (metadata.type !== "problem") continue;

      const explanationMetadata = await readJSONFile(
        path.join(
          TARGET_DIR,
          dir.replace("problem", "explanation"),
          path.basename(metadataFile)
        )
      );

      for (const [id, problem] of Object.entries(metadata.problems)) {
        problem.explanationImageURL =
          explanationMetadata?.problems?.[id]?.imageURL ?? null;

        if (section === "영어") {
          if (["16", "17"].includes(id)) {
            problem.explanationImageURL =
              explanationMetadata.passages["[16~17]"]?.imageURL ?? null;
          }
          // 41~42
          else if (["41", "42"].includes(id)) {
            problem.explanationImageURL =
              explanationMetadata.passages["[41~42]"]?.imageURL ?? null;
          }
          // 43~45
          else if (["43", "44", "45"].includes(id)) {
            problem.explanationImageURL =
              explanationMetadata.passages["[43~45]"]?.imageURL ?? null;
          }
        }

        if (!problem.explanationImageURL) {
          Logger.notice(`[${dir}] problem: ${id} 설명 이미지가 없습니다.`);
        }
      }

      for (const [id, passage] of Object.entries(metadata.passages)) {
        passage.explanationImageURL =
          explanationMetadata?.passages?.[id]?.imageURL ?? null;

        if (!passage.explanationImageURL) {
          Logger.warn(`[${dir}] passage: ${id} 설명 이미지가 없습니다.`);
        }
      }

      await writeFile(metadataFile, JSON.stringify(metadata, null, 2));
    }
  }
  Logger.endSection();

  Logger.endSection();
}
