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

export async function F000_createIds() {
  const PROD = await getFirebaseAdmin("giyoung");
  const DEV = await getFirebaseAdmin("dev-giyoung");

  const materialIdSet = new Set();
  const examPaperIdSet = new Set();
  const problemIdSet = new Set();
  const passageIdSet = new Set();

  Logger.section(`id 생성 작업을 시작합니다... ${TARGET_DIR}`);

  const entries = await fs.readdir(TARGET_DIR, { withFileTypes: true });
  const subdirectories = entries.filter((entry) => entry.isDirectory());

  if (subdirectories.length === 0) {
    Logger.warn("No subdirectories found in the input directory.");
    Logger.endSection();
    return;
  }

  for (const subdir of subdirectories) {
    const subdirName = subdir.name.normalize("NFC");

    Logger.section(`폴더: ${subdirName}`);

    //1. 각종 파일 로드
    const infoFilePath = path.join(TARGET_DIR, subdirName, "bbox.json");
    const infoFile = JSON.parse(await fs.readFile(infoFilePath, "utf8"));

    const uploadInfoFilePath = path.join(
      TARGET_DIR,
      subdirName,
      "uploadInfo.json"
    );

    let uploadInfo = {};

    if (await existsFile(uploadInfoFilePath)) {
      uploadInfo = JSON.parse(await fs.readFile(uploadInfoFilePath, "utf8"));
    }

    /**
     * 1. 각종 id 준비
     */

    /**
     * 1-1 Material id 준비
     */
    const materialId = uploadInfo.materialId || "";

    // id가 있을 경우 문서가 있는지 확인
    if (materialId) {
      const material_PROD_ref = PROD.admin
        .firestore()
        .collection("materials")
        .doc(materialId);

      const material_PROD = await material_PROD_ref.get();
      if (material_PROD.exists) {
        const title = material_PROD.data().title;
        if (subdirName !== title) {
          Logger.warn(
            `[PROD] material: ${materialId} 이미 존재합니다. : ${title}`
          );
        }
      }

      const material_DEV_ref = DEV.admin
        .firestore()
        .collection("materials")
        .doc(materialId);

      const material_DEV = await material_DEV_ref.get();
      if (material_DEV.exists) {
        const title = material_DEV.data().title;
        if (subdirName !== title) {
          Logger.warn(
            `[DEV] material: ${materialId} 이미 존재합니다. : ${title}`
          );
        }
      }

      materialIdSet.add(materialId);
    }
    // id가 없을 경우 새로 생성
    else {
      while (true) {
        const materialRef = PROD.admin
          .firestore()
          .collection("materials")
          .doc();

        const material_DEV_ref = DEV.admin
          .firestore()
          .collection("materials")
          .doc(materialRef.id);

        const material_DEV = await material_DEV_ref.get();
        if (material_DEV.exists) {
          continue;
        }
        if (materialIdSet.has(materialRef.id)) {
          continue;
        }

        materialIdSet.add(materialRef.id);

        uploadInfo.materialId = materialRef.id;
        await fs.writeFile(
          uploadInfoFilePath,
          JSON.stringify({ ...uploadInfo }, null, 2)
        );

        break;
      }
    }

    /**
     * 1-2 ExamPaper id 준비
     */
    const examPaperId = uploadInfo.examPaperId || "";
    let contents_PROD = [];
    let contents_DEV = [];

    if (examPaperId) {
      const examPaper_PROD_ref = PROD.admin
        .firestore()
        .collection("examPapers")
        .doc(examPaperId);

      const examPaper_PROD = await examPaper_PROD_ref.get();
      if (examPaper_PROD.exists) {
        const title = examPaper_PROD.data().title;
        contents_PROD = examPaper_PROD.data().contents;
        if (subdirName !== title) {
          Logger.warn(
            `[PROD] examPaper: ${examPaperId} 이미 존재합니다. : ${title}`
          );
        }
      }

      const examPaper_DEV_ref = DEV.admin
        .firestore()
        .collection("examPapers")
        .doc(examPaperId);

      const examPaper_DEV = await examPaper_DEV_ref.get();
      if (examPaper_DEV.exists) {
        const title = examPaper_DEV.data().title;
        contents_DEV = examPaper_DEV.data().contents;
        if (subdirName !== title) {
          Logger.warn(
            `[DEV] examPaper: ${examPaperId} 이미 존재합니다. : ${title}`
          );
        }
      }

      examPaperIdSet.add(examPaperId);
    } else {
      while (true) {
        const examPaperRef = PROD.admin
          .firestore()
          .collection("examPapers")
          .doc();

        const examPaper_DEV_ref = DEV.admin
          .firestore()
          .collection("examPapers")
          .doc(examPaperRef.id);

        const examPaper_DEV = await examPaper_DEV_ref.get();
        if (examPaper_DEV.exists) {
          continue;
        }

        if (examPaperIdSet.has(examPaperRef.id)) {
          continue;
        }

        examPaperIdSet.add(examPaperRef.id);

        uploadInfo.examPaperId = examPaperRef.id;
        await fs.writeFile(
          uploadInfoFilePath,
          JSON.stringify({ ...uploadInfo }, null, 2)
        );

        break;
      }
    }

    // 1-3 problem, passage 준비

    const problemIdMap = uploadInfo.problemIdMap || {};
    const passageIdMap = uploadInfo.passageIdMap || {};

    const contents_raw = Object.values(
      infoFile.bbox.reduce((acc, item) => {
        if (!acc[item.id]) acc[item.id] = item;
        return acc;
      }, {})
    );

    for (const box of contents_raw) {
      if (box.type === "question") {
        const problemId = problemIdMap[box.id];

        if (problemId) {
          const problem_PROD_ref = PROD.admin
            .firestore()
            .collection("problems")
            .doc(problemId);

          const problem_PROD = await problem_PROD_ref.get();
          if (
            problem_PROD.exists &&
            !contents_PROD.find(
              (content) =>
                content.type === "problem" && content.id === problemId
            )
          ) {
            Logger.warn(`[PROD] problem: ${problemId} 이미 존재합니다.`);
          }

          const problem_DEV_ref = DEV.admin
            .firestore()
            .collection("problems")
            .doc(problemId);

          const problem_DEV = await problem_DEV_ref.get();
          if (
            problem_DEV.exists &&
            !contents_DEV.find(
              (content) =>
                content.type === "problem" && content.id === problemId
            )
          ) {
            Logger.warn(`[DEV] problem: ${problemId} 이미 존재합니다.`);
          }

          problemIdSet.add(problemId);
        } else {
          while (true) {
            const problemRef = PROD.admin
              .firestore()
              .collection("problems")
              .doc();

            const problem_DEV_ref = DEV.admin
              .firestore()
              .collection("problems")
              .doc(problemRef.id);

            const problem_DEV = await problem_DEV_ref.get();
            if (problem_DEV.exists) {
              continue;
            }

            if (problemIdSet.has(problemRef.id)) {
              continue;
            }

            problemIdSet.add(problemRef.id);

            problemIdMap[box.id] = problemRef.id;

            break;
          }
        }
      } else if (box.type === "passage") {
        const passageId = passageIdMap[box.id];

        if (passageId) {
          const passage_PROD_ref = PROD.admin
            .firestore()
            .collection("passages")
            .doc(passageId);

          const passage_PROD = await passage_PROD_ref.get();
          if (
            passage_PROD.exists &&
            !contents_PROD.find(
              (content) =>
                content.type === "passage" && content.id === passageId
            )
          ) {
            Logger.warn(`[PROD] passage: ${passageId} 이미 존재합니다.`);
          }

          const passage_DEV_ref = DEV.admin
            .firestore()
            .collection("passages")
            .doc(passageId);

          const passage_DEV = await passage_DEV_ref.get();
          if (
            passage_DEV.exists &&
            !contents_DEV.find(
              (content) =>
                content.type === "passage" && content.id === passageId
            )
          ) {
            Logger.warn(`[DEV] passage: ${passageId} 이미 존재합니다.`);
          }

          passageIdSet.add(passageId);
        } else {
          while (true) {
            const passageRef = PROD.admin
              .firestore()
              .collection("passages")
              .doc();

            const passage_DEV_ref = DEV.admin
              .firestore()
              .collection("passages")
              .doc(passageRef.id);

            const passage_DEV = await passage_DEV_ref.get();
            if (passage_DEV.exists) {
              continue;
            }

            if (passageIdSet.has(passageRef.id)) {
              continue;
            }

            passageIdSet.add(passageRef.id);

            passageIdMap[box.id] = passageRef.id;
            break;
          }
        }
      }
    }

    uploadInfo.problemIdMap = problemIdMap;
    uploadInfo.passageIdMap = passageIdMap;
    await fs.writeFile(
      uploadInfoFilePath,
      JSON.stringify({ ...uploadInfo }, null, 2)
    );

    Logger.endSection();
  }

  Logger.endSection();
}
