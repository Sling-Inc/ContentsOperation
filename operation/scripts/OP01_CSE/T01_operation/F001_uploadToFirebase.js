import fs from "fs/promises";
import path from "path";

import { getFirebaseAdmin } from "#operation/credentials/firebaseCredentials.js";
import { uploadFileToFirebase } from "#operation/utils/bucket.js";
import { existsFile } from "#operation/utils/file.js";
import { Logger } from "#operation/utils/logger.js";

const history = {
  "202508_CSE": {
    dir: "/Users/jgj/Documents/toy/contentsOperation/workspace/20250827_01/D01_postprocess_results",
  },
};

const TAG_CSE = "202508_CSE";
const TARGET_DIR = history[TAG_CSE].dir;

const target = "2025년 지방직 9급 국어";

export async function F001_uploadToFirebase() {
  const { admin } = await getFirebaseAdmin();

  Logger.section(`업로드 작업을 시작합니다... ${TARGET_DIR}`);

  const entries = await fs.readdir(TARGET_DIR, { withFileTypes: true });
  const subdirectories = entries.filter((entry) => entry.isDirectory());

  if (subdirectories.length === 0) {
    Logger.warn("No subdirectories found in the input directory.");
    Logger.endSection();
    return;
  }

  let batch = admin.firestore().batch();
  let count = 0;

  for (const subdir of subdirectories) {
    const subdirName = subdir.name.normalize("NFC");
    if (subdirName !== target) {
      continue;
    }

    Logger.section(`폴더: ${subdirName}`);

    //1. 각종 파일 로드
    const infoFilePath = path.join(TARGET_DIR, subdirName, "bbox.json");
    const infoFile = JSON.parse(await fs.readFile(infoFilePath, "utf8"));

    const answersFilePath = path.join(TARGET_DIR, subdirName, "answers.json");
    const answersFile = JSON.parse(await fs.readFile(answersFilePath, "utf8"));

    const metadataFilePath = path.join(TARGET_DIR, subdirName, "metadata.json");
    const metadataFile = JSON.parse(
      await fs.readFile(metadataFilePath, "utf8")
    );

    const uploadInfoFilePath = path.join(
      TARGET_DIR,
      subdirName,
      "uploadInfo.json"
    );

    let uploadInfo = {};

    if (await existsFile(uploadInfoFilePath)) {
      uploadInfo = JSON.parse(await fs.readFile(uploadInfoFilePath, "utf8"));
    }

    const imagesPath = path.join(TARGET_DIR, subdirName, "images");

    const currentDate = new Date();

    const title = subdirName;
    const shortTitle =
      metadataFile.option === "공무원"
        ? title
            .slice(2)
            .replace("계리직", "계리")
            .replace("국가직", "국가")
            .replace("국회직", "국회")
            .replace("기상직", "기상")
            .replace("법원직", "법원")
            .replace("서울시", "서울")
            .replace("지방직", "지방")
        : title.slice(2);

    const problemCount = answersFile.answers.length;

    /**
     * 1. 각종 id 준비
     */

    //1-1 Material id 준비
    const materialId = uploadInfo.materialId || "";
    const materialRef = materialId
      ? admin.firestore().collection("materials").doc(materialId)
      : admin.firestore().collection("materials").doc();

    uploadInfo.materialId = materialRef.id;
    await fs.writeFile(
      uploadInfoFilePath,
      JSON.stringify({ ...uploadInfo }, null, 2)
    );

    Logger.info(`materialId: ${materialRef.id}`);

    // 1-2 ExamPaper id 준비
    const examPaperId = uploadInfo.examPaperId || "";
    const examPaperRef = examPaperId
      ? admin.firestore().collection("examPapers").doc(examPaperId)
      : admin.firestore().collection("examPapers").doc();

    uploadInfo.examPaperId = examPaperRef.id;
    await fs.writeFile(
      uploadInfoFilePath,
      JSON.stringify({ ...uploadInfo }, null, 2)
    );

    Logger.info(`examPaperId: ${examPaperRef.id}`);

    // 1-3 probblem, passage 준비
    const problemRefMap = {};
    const passageRefMap = {};

    const problemInfoMap = {};
    const passageInfoMap = {};

    const problemIdMap = {};
    const passageIdMap = {};

    let pages = [];

    /**
     * 1-4 passage 생성
     */
    for (const box of infoFile.bbox.filter((box) => box.type === "passage")) {
      const id = box.id;

      let passageId = uploadInfo.passageIdMap?.[id] || "";
      const passageRef = passageId
        ? admin.firestore().collection("passages").doc(passageId)
        : admin.firestore().collection("passages").doc();

      passageRefMap[id] = passageRef;
      passageIdMap[id] = passageRef.id;
      passageInfoMap[id] = {
        examPaperId: examPaperRef.id,
        explanationImageURL: null,
        imageURL: null,
        problemIds: [],
        type: "main",
      };
      pages.push({
        contents: [
          {
            id: passageRef.id,
            type: "passage",
          },
        ],
        positions: {
          [passageRef.id]: {
            section: "left",
            sectionIndex: 0,
          },
        },
        type: "twoColumn",

        passageId: id,
        passageRefId: passageRef.id,

        index: box.problemIds.sort()[0],
        problemIds: box.problemIds,
      });
    }

    /**
     *  1-5 problem 생성
     */
    for (const box of infoFile.bbox
      .filter((box) => box.type === "question")
      .sort((a, b) => Number(a.id) - Number(b.id))) {
      const id = box.id;

      let problemId = uploadInfo.problemIdMap?.[id] || "";
      const problemRef = problemId
        ? admin.firestore().collection("problems").doc(problemId)
        : admin.firestore().collection("problems").doc();

      problemRefMap[id] = problemRef;
      problemIdMap[id] = problemRef.id;

      problemInfoMap[id] = {
        answer: answersFile.answers
          .find((answer) => answer.id === id)
          .answer.join("|"),
        audioURL: null,
        ebsCategory: {
          large: null,
          medium: null,
          small: null,
        },
        ebsProblemId: null,
        ebsWrongRate: null,
        examPaperId: examPaperRef.id,
        examPaperIds: [examPaperRef.id],
        explanationImageURL: null,
        explanationVideoURL: null,
        explanations: [],
        imageURL: "",
        passageIds: [],
        problemNumber: 0,
        score: 1,
        type: box.choiceCount === 5 ? "multipleChoice" : "multipleChoice_4",
      };

      let isAdded = false;
      for (const page of pages) {
        if (page.contents[0].type !== "passage") continue;

        if (page.problemIds.includes(id)) {
          page.positions[problemRef.id] = {
            section: "right",
            sectionIndex: page.contents.length - 1,
          };
          page.contents.push({
            id: problemRef.id,
            type: "problem",
          });

          passageInfoMap[page.passageId].problemIds.push(problemRef.id);
          problemInfoMap[id].passageIds.push(page.passageRefId);

          isAdded = true;
          break;
        }
      }

      if (!isAdded) {
        pages.push({
          contents: [{ id: problemRef.id, type: "problem" }],
          positions: {
            [problemRef.id]: { section: "center", sectionIndex: 0 },
          },
          type: "oneColumn",

          index: id,
        });
      }
    }

    pages = pages
      .sort((a, b) => Number(a.index) - Number(b.index))
      .map((page, index) => ({
        contents: page.contents,
        pageNumber: index + 1,
        positions: page.positions,
        type: page.type,
      }));

    const contents = pages.map((page) => page.contents).flat();

    let problemNumber = 1;
    for (const content of contents) {
      if (content.type === "problem") {
        const problemId = Object.entries(problemIdMap).find(
          ([_, value]) => value === content.id
        )[0];
        problemInfoMap[problemId].problemNumber = problemNumber;
        problemNumber++;
      }
    }

    uploadInfo.problemIdMap = problemIdMap;
    uploadInfo.passageIdMap = passageIdMap;
    await fs.writeFile(
      uploadInfoFilePath,
      JSON.stringify(
        {
          ...uploadInfo,
        },
        null,
        2
      )
    );

    /**
     * 2. Material 생성
     */
    const materialInfo = {
      _tag: TAG_CSE,
      _world: "CSE",
      _worldSchemaVersion: 1,

      type: "world",
      subType: "world",
      categoryText: `${metadataFile.option} 기출`,
      requiredTier: "free",

      title: title,
      shortTitle: shortTitle,
      description: null,
      descriptionURL: null,

      isVisible: false,
      addedCount: 0,
      createdAt: currentDate,
      updatedAt: currentDate,

      thumbnailURL:
        "https://firebasestorage.googleapis.com/v0/b/giyoung.appspot.com/o/textbookTemplates%2FIx6bYkhXVU7Sn4JXUSRT%2F1731936203960_thumbnail.png?alt=media&token=e3e744e7-2b30-48aa-aebb-0b2d6da9e73a",
      thumbnails: [
        {
          width: 112,
          height: 150,
          url: "https://firebasestorage.googleapis.com/v0/b/giyoung.appspot.com/o/materials%2FFSZZSR4JqJoAV4t683VG%2Fthumbnail_150.png?alt=media&token=34184850-06c0-4697-9dca-ab1f59a4b4d1",
        },
        {
          width: 480,
          height: 640,
          url: "https://firebasestorage.googleapis.com/v0/b/giyoung.appspot.com/o/materials%2FFSZZSR4JqJoAV4t683VG%2Fthumbnail_640.png?alt=media&token=64bba780-b427-45da-96f2-8219246a7a04",
        },
      ],

      metadata: metadataFile,
      contents: {
        alsIds: [examPaperId],
        contents: {
          alsId: examPaperId,
          numberOfProblems: problemCount,
          perfectScore: problemCount,
          title: title,
        },
        depth: 1,
        format: "als",
      },
    };

    batch.set(materialRef, materialInfo);
    count++;

    /**
     * 3. ExamPaper 생성
     */
    const examPaperInfo = {
      _world: "world",
      _worldSchemaVersion: 1,

      title: title,
      shortTitle: shortTitle,

      createdAt: currentDate,

      isVisible: true,
      thumbnailURL: null,

      executionYear: metadataFile.executionYear,
      executionMonth: null,
      highSchoolYear: null,

      problemCount: problemCount,
      perfectScore: problemCount,

      supervisor: metadataFile.supervisor,
      materialId: materialId,

      duration: null,

      scoreCutURL: null,

      section: {
        code: "etc",
        name: "기타",
      },
      subject: {
        code: "etc",
        name: "기타",
      },

      pages: pages,
      contents: contents,

      explanationPDFDownloadURL: null,
      explanationVideoURL: null,
    };

    batch.set(examPaperRef, examPaperInfo);
    count++;

    /**
     * 4. Problem && Passage 생성
     */

    for (const box of infoFile.bbox) {
      if (box.type === "passage") {
        const passageId = box.id;
        const passageRef = passageRefMap[passageId];
        Logger.info(`passageId: ${passageRef.id}`);

        const imagePath = path.join(imagesPath, `passage_${box.id}.png`);
        const imageURL = await uploadFileToFirebase(
          admin,
          imagePath,
          `passages/${passageRef.id}/image.png`,
          "png"
        );

        passageInfoMap[passageId].imageURL = imageURL;

        batch.set(passageRef, passageInfoMap[passageId]);
        count++;
      } else if (box.type === "question") {
        const problemId = box.id;
        const problemRef = problemRefMap[problemId];
        Logger.info(`problemId: ${problemRef.id}`);

        const imagePath = path.join(imagesPath, `question_${box.id}.png`);
        const imageURL = await uploadFileToFirebase(
          admin,
          imagePath,
          `problems/${problemRef.id}/image.png`,
          "png"
        );

        problemInfoMap[problemId].imageURL = imageURL;

        batch.set(problemRef, problemInfoMap[problemId]);
        count++;
      }
    }

    if (count > 300) {
      await batch.commit();
      batch = admin.firestore().batch();
      count = 0;
    }

    Logger.endSection();
    break;
  }

  await batch.commit();

  Logger.endSection();
}
