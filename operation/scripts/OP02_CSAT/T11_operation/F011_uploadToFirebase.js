import path from "path";
import pLimit from "p-limit";

import { getFirebaseAdmin } from "#operation/credentials/firebaseCredentials.js";
import { Logger } from "#operation/utils/logger.js";

import {
  readDirectories,
  readFilesWithExt,
  readJSONFile,
  writeFile,
} from "#root/operation/utils/file.js";
import {
  uploadFileToFirebase,
  uploadImageToFirebase,
} from "#root/operation/utils/bucket.js";

const UPLOAD = {
  ALL: true,
  MATERIAL: true,
  EXAMPAPER: true,
  PROBLEM: true,
  PASSAGE: true,
};

const limit = pLimit(10);

function getDuration(metadata) {
  switch (metadata.info.metadata.section.code) {
    case "korean":
      return 80;
    case "math":
      return 100;
    case "english":
      return 70;
    case "foreign":
      return 40;
    case "korean_history":
    case "society":
    case "science":
      return 30;
    default:
      return 30;
  }
}

async function DEBUG_writeFile(data, filePath) {
  if (true) return;
  await writeFile(filePath, JSON.stringify(data, null, 2));
}

export async function F011_uploadToFirebase(TARGET_DIR, TAGS) {
  const { admin } = await getFirebaseAdmin();
  let batch = admin.firestore().batch();
  let count = 0;

  Logger.section(`업로드 작업을 시작합니다... ${TARGET_DIR}`);

  const dirs = await readDirectories(TARGET_DIR);

  for (const dir of dirs) {
    const metadataFiles = (
      await readFilesWithExt(path.join(TARGET_DIR, dir), ".json")
    ).filter((item) => !item.startsWith("metadata"));

    for (const metadataFile of metadataFiles) {
      const metadata = await readJSONFile(metadataFile);
      if (metadata.type !== "problem") continue;

      Logger.section(`작업 시작: ${metadata.info.title}`);

      const currentDate = new Date();

      const materialId = metadata.materialId;
      if (!materialId) {
        Logger.error(`[${dir}] materialId가 없습니다.`);
        continue;
      }
      Logger.debug(`materialId: ${materialId}`);

      const examPaperId = metadata.examPaperId;
      if (!examPaperId) {
        Logger.error(`[${dir}] examPaperId가 없습니다.`);
        continue;
      }
      Logger.debug(`examPaperId: ${examPaperId}`);

      let pages = [];
      const problems = {};
      const passages = {};

      /**
       *
       * 1. problem, passage 생성
       *
       */

      //
      // 1-1. passage 정보 생성 &  page 생성
      Logger.debug(`passage: 총 ${Object.keys(metadata.passages).length}개`);
      for (const [id, passage] of Object.entries(metadata.passages)) {
        // 1-1-1 passage 정보 생성
        passages[passage.passageId] = {
          examPaperId: examPaperId,
          explanationImageURL: null,
          imageURL: null,
          metadata: null,
          problemIds: [],
          type: "main",

          __uploadInfo: {
            file_imageURL: passage.imageURL,
            file_explanationImageURL: passage.explanationImageURL ?? null,
          },
        };

        // 1-1-2 page 생성
        pages.push({
          contents: [
            {
              id: passage.passageId,
              type: "passage",
            },
          ],
          positions: {
            [passage.passageId]: {
              section: "left",
              sectionIndex: 0,
            },
          },
          type: "twoColumn",

          index: passage.problemIds.sort()[0],
          problemIds: passage.problemIds,
        });
      }

      //
      // 1-2. problem 정보 생성 &  page에 추가/생성
      Logger.debug(`problem: 총 ${Object.keys(metadata.problems).length}개`);
      let problemNumber = 0;
      for (const [id, problem] of Object.entries(metadata.problems)) {
        // 1-2-1 problem 정보 생성
        problems[problem.problemId] = {
          examPaperId: examPaperId,
          examPaperIds: [examPaperId],

          passageIds: [],

          problemNumber: ++problemNumber,

          type: problem.isChoice ? "multipleChoice" : "shortAnswer",
          score: problem.score,
          answer: String(problem.answer),

          imageURL: null,
          audioURL: null,

          explanationImageURL: null,
          explanationVideoURL: null,

          ebsCategory: {
            large: null,
            medium: null,
            small: null,
          },
          ebsWrongRate: null,
          ebsProblemId: null,

          explanations: [],

          __uploadInfo: {
            file_audioURL: problem.audioURL,
            file_imageURL: problem.imageURL,
            file_explanationImageURL: problem.explanationImageURL ?? null,
          },
        };

        let isAdded = false;
        for (const page of pages) {
          if (page.type !== "twoColumn") continue;
          if (!page.problemIds.includes(id)) continue;

          passages[page.contents[0].id].problemIds.push(problem.problemId);
          problems[problem.problemId].passageIds.push(page.contents[0].id);

          page.positions[problem.problemId] = {
            section: "right",
            sectionIndex: page.contents.length - 1,
          };
          page.contents.push({
            id: problem.problemId,
            type: "problem",
          });

          isAdded = true;
          break;
        }

        if (!isAdded) {
          pages.push({
            contents: [{ id: problem.problemId, type: "problem" }],
            positions: {
              [problem.problemId]: { section: "center", sectionIndex: 0 },
            },
            type: "oneColumn",

            index: id,
          });
        }
      }

      /**
       * problem 업로드
       */
      Logger.info(`problem 업로드 시작...`);
      if (UPLOAD.ALL && UPLOAD.PROBLEM) {
        const tasks = Object.entries(problems).map(([id, problem]) => {
          return limit(async () => {
            // 1. problem image
            problem.imageURL = await uploadFileToFirebase(
              admin,
              problem.__uploadInfo.file_imageURL,
              `problems/${id}/image.png`,
              "png"
            );

            // 2. 있을 경우 해설
            if (problem.__uploadInfo.file_explanationImageURL) {
              const explanationImageURL = await uploadFileToFirebase(
                admin,
                problem.__uploadInfo.file_explanationImageURL,
                `problems/${id}/explanation.png`,
                "png"
              );
              problem.explanations.push({
                author: "교육청",
                imageURL: explanationImageURL,
              });
            }

            // 3. 있을 경우 오디오
            if (problem.__uploadInfo.file_audioURL) {
              problem.audioURL = await uploadFileToFirebase(
                admin,
                problem.__uploadInfo.file_audioURL,
                `problems/${id}/audio.mp3`,
                "mp3"
              );
            }
          });
        });

        await Promise.all(tasks);

        for (const [id, problem] of Object.entries(problems)) {
          const { __uploadInfo, ...problemData } = problem;
          const problemRef = admin.firestore().collection("problems").doc(id);
          batch.set(problemRef, problemData);
          count++;
        }
      }
      Logger.info(`problem 업로드 완료`);

      /**
       * passage 업로드
       */
      Logger.info(`passage 업로드 시작...`);
      if (UPLOAD.ALL && UPLOAD.PASSAGE) {
        const tasks = Object.entries(passages).map(([id, passage]) => {
          return limit(async () => {
            passage.imageURL = await uploadFileToFirebase(
              admin,
              passage.__uploadInfo.file_imageURL,
              `passages/${id}/image.png`,
              "png"
            );

            if (passage.__uploadInfo.file_explanationImageURL) {
              passage.explanationImageURL = await uploadFileToFirebase(
                admin,
                passage.__uploadInfo.file_explanationImageURL,
                `passages/${id}/explanation.png`,
                "png"
              );
            }
          });
        });

        await Promise.all(tasks);

        for (const [id, passage] of Object.entries(passages)) {
          const { __uploadInfo, ...passageData } = passage;
          const passageRef = admin.firestore().collection("passages").doc(id);
          batch.set(passageRef, passageData);
          count++;
        }
      }
      Logger.info(`passage 업로드 완료`);

      await DEBUG_writeFile(
        problems,
        path.join(TARGET_DIR, dir, "debug_problems.json")
      );
      await DEBUG_writeFile(
        passages,
        path.join(TARGET_DIR, dir, "debug_passages.json")
      );

      /**
       *
       * 2. examPaper 생성
       *
       */

      pages = pages
        .sort((a, b) => Number(a.index) - Number(b.index))
        .map((page, index) => ({
          contents: page.contents,
          pageNumber: index + 1,
          positions: page.positions,
          type: page.type,
        }));

      // 영어 16-17번 합치기
      if (metadata.info.metadata.section.code === "english") {
        let page16 = pages[15];
        let page17 = pages[16];

        if (page16.contents.length !== 1 || page17.contents.length !== 1)
          Logger.warn(`영어 시험지가 뭔가 이상합니다... `);
        const page16ProblemId = page16.contents[0].id;
        const page17ProblemId = page17.contents[0].id;

        page16 = {
          ...page16,
          contents: [page16.contents[0], page17.contents[0]],
          positions: {
            [page17ProblemId]: {
              ...page17.positions[page17ProblemId],
              sectionIndex: 1,
            },
            [page16ProblemId]: {
              ...page16.positions[page16ProblemId],
              sectionIndex: 0,
            },
          },
        };

        pages = [
          ...pages.slice(0, 15),
          page16,
          ...pages
            .slice(17)
            .map((page) => ({ ...page, pageNumber: page.pageNumber - 1 })),
        ];
      }

      const contents = pages.map((page) => page.contents).flat();

      const examPaperData = {
        title: metadata.info.title,
        shortTitle: metadata.info.shortTitle,

        createdAt: currentDate,
        updatedAt: currentDate,

        isVisible: true,
        thumbnailURL: null,

        executionYear: metadata.info.metadata.executionYear,
        executionMonth: metadata.info.metadata.executionMonth,
        highSchoolYear: metadata.info.metadata.highSchoolYear,

        problemCount: Object.keys(metadata.problems).length,
        perfectScore: metadata.maxScore,

        supervisor: metadata.info.metadata.supervisor,
        materialId: materialId,

        duration: getDuration(metadata),

        scoreCutURL: null,

        section: metadata.info.metadata.section,
        subject: metadata.info.metadata.subject,
        pages: pages,
        contents: contents,

        explanationPDFDownloadURL: null,
        explanationVideoURL: null,
      };

      await DEBUG_writeFile(
        examPaperData,
        path.join(TARGET_DIR, dir, "debug_examPaper.json")
      );
      if (UPLOAD.ALL && UPLOAD.EXAMPAPER) {
        const examPaperRef = admin
          .firestore()
          .collection("examPapers")
          .doc(examPaperId);

        batch.set(examPaperRef, examPaperData);
        count++;
      }

      /**
       *
       * 3. material 생성
       *
       */

      const materialData = {
        _tag: TAGS,

        type: "examPaper",
        subType: "previous",
        authority: "free",

        title: metadata.info.title,
        shortTitle: metadata.info.shortTitle,
        description: null,

        isVisible: false,
        addedCount: 0,
        createdAt: currentDate,
        updatedAt: currentDate,

        thumbnailURL: "",
        thumbnails: [
          {
            width: 112,
            height: 150,
            url: "",
          },
          {
            width: 480,
            height: 640,
            url: "",
          },
        ],

        metadata: metadata.info.metadata,
        contents: {
          alsIds: [examPaperId],
          contents: {
            alsId: examPaperId,
            numberOfProblems: Object.keys(metadata.problems).length,
            perfectScore: metadata.maxScore,
            title: metadata.info.title,
          },
          depth: 1,
          format: "als",
        },
      };

      // thumbnail Image Upload
      if (UPLOAD.ALL && UPLOAD.MATERIAL) {
        await Promise.all([
          limit(async () => {
            // 150
            const url = await uploadImageToFirebase(
              admin,
              metadata.thumbnailImage[150],
              `materials/${materialId}/thumbnail_150.png`
            );
            materialData.thumbnails[0].url = url;
          }),
          limit(async () => {
            // 640
            const url = await uploadImageToFirebase(
              admin,
              metadata.thumbnailImage[640],
              `materials/${materialId}/thumbnail_640.png`
            );
            materialData.thumbnails[1].url = url;
            materialData.thumbnailURL = url;
          }),
        ]);
      }
      await DEBUG_writeFile(
        materialData,
        path.join(TARGET_DIR, dir, "debug_material.json")
      );
      if (UPLOAD.ALL && UPLOAD.MATERIAL) {
        const materialRef = admin
          .firestore()
          .collection("materials")
          .doc(materialId);

        batch.set(materialRef, materialData);
        count++;
      }

      if (count > 300) {
        await batch.commit();
        batch = admin.firestore().batch();
        count = 0;
      }

      Logger.endSection();
    }
  }

  await batch.commit();
}
