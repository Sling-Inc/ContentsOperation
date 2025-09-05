import fs from "fs/promises";
import path from "path";
import pLimit from "p-limit";

import { getFirebaseAdmin } from "#operation/credentials/firebaseCredentials.js";
import { uploadFileToFirebase } from "#operation/utils/bucket.js";
import { existsFile } from "#operation/utils/file.js";
import { Logger } from "#operation/utils/logger.js";

const history = {
  "202509_naesin_test": {
    dir: "/Users/sling/workspace/ContentsOperation/workspace_2학년_수학__원안지/D01_postprocess_results",
  },
};

const TAG_NAESIN = "202509_naesin_test";
const TARGET_DIR = history[TAG_NAESIN].dir;

const limit = pLimit(10);

export async function F001_uploadToFirebase() {
  const { admin } = await getFirebaseAdmin();

  Logger.section(`내신 업로드 작업을 시작합니다... ${TARGET_DIR}`);

  const entries = await fs.readdir(TARGET_DIR, { withFileTypes: true });
  const subdirectories = entries.filter((entry) => entry.isDirectory());

  if (subdirectories.length === 0) {
    Logger.warn("No subdirectories found in the input directory.");
    Logger.endSection();
    return;
  }

  let batch = admin.firestore().batch();
  let count = 0;

  let dirCount = 0;
  for (const subdir of subdirectories) {
    const subdirName = subdir.name.normalize("NFC");

    Logger.section(
      `[${String(++dirCount).padStart(4, "0")} / ${String(
        subdirectories.length
      ).padStart(4, "0")}] 폴더: ${subdirName}`
    );

    //1. 각종 파일 로드
    const bboxFilePath = path.join(TARGET_DIR, subdirName, "bbox.json");
    const answersFilePath = path.join(TARGET_DIR, subdirName, "answers.json");
    const uploadInfoFilePath = path.join(
      TARGET_DIR,
      subdirName,
      "uploadInfo.json"
    );

    if (!(await existsFile(bboxFilePath))) {
      Logger.warn(`bbox.json 파일이 없습니다: ${bboxFilePath}`);
      continue;
    }

    if (!(await existsFile(uploadInfoFilePath))) {
      Logger.warn(`uploadInfo.json 파일이 없습니다: ${uploadInfoFilePath}`);
      continue;
    }

    const bboxFile = JSON.parse(await fs.readFile(bboxFilePath, "utf8"));
    const uploadInfo = JSON.parse(await fs.readFile(uploadInfoFilePath, "utf8"));
    let answersFile = null;
    
    if (await existsFile(answersFilePath)) {
      answersFile = JSON.parse(await fs.readFile(answersFilePath, "utf8"));
    }

    // 내신은 과목 하위 폴더(예: 국어/images)를 사용할 수 있으므로 후보 경로를 모두 확인
    const imageDirCandidates = [
      path.join(TARGET_DIR, subdirName, "images"),
      path.join(TARGET_DIR, subdirName, "국어", "images"),
    ];
    let imagesPath = imageDirCandidates[0];
    for (const cand of imageDirCandidates) {
      try {
        await fs.access(cand);
        imagesPath = cand;
        break;
      } catch {}
    }
    const currentDate = new Date();

    // 1. ID 준비
    const materialId = uploadInfo.materialId;
    const examPaperId = uploadInfo.examPaperId;
    const problemIdMap = uploadInfo.problemIdMap || {};
    const passageIdMap = uploadInfo.passageIdMap || {};

    if (!materialId || !examPaperId) {
      Logger.warn(`ID가 준비되지 않았습니다: ${subdirName}`);
      continue;
    }

    const materialRef = admin.firestore().collection("materials").doc(materialId);
    const examPaperRef = admin.firestore().collection("examPapers").doc(examPaperId);

    // 2. 메타데이터 생성
    const title = subdirName;
    const shortTitle = subdirName.length > 20 ? subdirName.substring(0, 20) + "..." : subdirName;
    
    // 내신 시험 메타데이터 추출 (파일명에서)
    const metadata = {
      examType: "naesin",
      schoolName: "명지고등학교",
      grade: "1학년",
      semester: "2학기",
      examPeriod: "중간고사",
      subject: "국어",
      year: "2024",
      executionYear: "2024",
      option: "내신",
    };

    // 3. 문제 및 지문 정보 생성 (CSE 형식과 동일)
    const problemRefMap = {};
    const passageRefMap = {};
    const problemInfoMap = {};
    const passageInfoMap = {};
    const contents_raw = Object.values(
      bboxFile.bbox.reduce((acc, item) => {
        if (!acc[item.id]) acc[item.id] = item;
        return acc;
      }, {})
    );

    const problemIdMapNew = {};
    const passageIdMapNew = {};
    let pages = [];

    // 3-1. 지문 생성 (passage)
    const getProblemIdsFromPassageId = (passageId) => {
      const text = String(passageId);
      const ranges = [...text.matchAll(/(\d+)\s*~\s*(\d+)/g)];
      if (ranges.length === 0) return [];
      const ids = [];
      for (const m of ranges) {
        const start = Number(m[1]);
        const end = Number(m[2]);
        if (Number.isNaN(start) || Number.isNaN(end)) continue;
        for (let i = Math.min(start, end); i <= Math.max(start, end); i++) ids.push(String(i));
      }
      return Array.from(new Set(ids)).sort((a, b) => Number(a) - Number(b));
    };
    const passages = contents_raw.filter((box) => box.type === "passage");
    for (const box of passages) {
      const id = box.id;
      const existingPassageId = passageIdMap?.[id] || passageIdMapNew[id] || "";
      const passageRef = existingPassageId
        ? admin.firestore().collection("passages").doc(existingPassageId)
        : admin.firestore().collection("passages").doc();

      passageRefMap[id] = passageRef;
      passageIdMapNew[id] = passageRef.id;
      passageInfoMap[id] = {
        examPaperId: examPaperId,
        explanationImageURL: null,
        imageURL: null,
        problemIds: [],
        type: "main",
      };

      const inferredProblemIds = Array.isArray(box.problemIds) && box.problemIds.length > 0
        ? box.problemIds
        : getProblemIdsFromPassageId(id);

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

        index: inferredProblemIds.length > 0 ? [...inferredProblemIds].sort((a,b)=>Number(a)-Number(b))[0] : id,
        problemIds: inferredProblemIds,
      });
    }

    // 3-2. 문제 생성 (problem)
    const problems = contents_raw
      .filter((box) => box.type === "question")
      .sort((a, b) => Number(a.id) - Number(b.id));
    
    // perfectScore 계산 (score 총합)
    const perfectScore = problems.reduce((total, problem) => {
      return total + (problem.score || 1); // score가 없으면 기본값 1
    }, 0);

    for (const box of problems) {
      const id = box.id;
      const existingProblemId = problemIdMap?.[id] || problemIdMapNew[id] || "";
      const problemRef = existingProblemId
        ? admin.firestore().collection("problems").doc(existingProblemId)
        : admin.firestore().collection("problems").doc();

      problemRefMap[id] = problemRef;
      problemIdMapNew[id] = problemRef.id;

      // 정답 합치기 ("1|3" 형식)
      let answerString = "";
      if (answersFile && answersFile.answers) {
        const found = answersFile.answers.find((a) => a.id === id);
        if (found && Array.isArray(found.answer)) {
          answerString = found.answer.join("|");
        }
      }

      // 답이 없는 경우 narrative 타입으로 설정
      const hasAnswer = answerString && answerString.trim() !== "";
      const problemType = hasAnswer 
        ? (box.choiceCount === 5 ? "multipleChoice" : "multipleChoice")
        : "narrative";

      problemInfoMap[id] = {
        answer: answerString,
        audioURL: null,
        ebsCategory: { large: null, medium: null, small: null },
        ebsProblemId: null,
        ebsWrongRate: null,
        examPaperId: examPaperId,
        examPaperIds: [examPaperId],
        explanationImageURL: null,
        explanationVideoURL: null,
        explanations: [],
        imageURL: "",
        passageIds: [],
        problemNumber: 0,
        score: box.score || 1,
        type: problemType,
      };

      // 페이지 배치 (passage 우측)
      let isAdded = false;
      for (const page of pages) {
        if (page.contents[0].type !== "passage") continue;
        if (Array.isArray(page.problemIds) && page.problemIds.includes(id)) {
          page.positions[problemRef.id] = { section: "right", sectionIndex: page.contents.length - 1 };
          page.contents.push({ id: problemRef.id, type: "problem" });
          problemInfoMap[id].passageIds.push(page.passageRefId);
          isAdded = true;
          break;
        }
      }
      if (!isAdded) {
        pages.push({
          contents: [{ id: problemRef.id, type: "problem" }],
          positions: { [problemRef.id]: { section: "center", sectionIndex: 0 } },
          type: "oneColumn",
          index: id,
        });
      }
    }

    // 페이지/컨텐츠 구성 정렬 및 문제 번호 매기기
    pages = pages
      .sort((a, b) => Number(a.index) - Number(b.index))
      .map((page, index) => ({
        contents: page.contents,
        pageNumber: index + 1,
        positions: page.positions,
        type: page.type,
      }));

    const contents = pages.map((page) => page.contents).flat();

    // passage.problemIds를 페이지 구성 기반으로 순서대로 반영
    for (const page of pages) {
      const passageRefId = page.contents.find((c) => c.type === "passage")?.id;
      if (!passageRefId) continue;
      const passageOrigKey = Object.keys(passageRefMap).find((k) => passageRefMap[k].id === passageRefId);
      if (!passageOrigKey) continue;
      const orderedProblems = page.contents.filter((c) => c.type === "problem").map((c) => c.id);
      passageInfoMap[passageOrigKey].problemIds = orderedProblems;
    }
    let problemNumberCounter = 1;
    for (const content of contents) {
      if (content.type === "problem") {
        const [origId] = Object.entries(problemIdMapNew).find(([_, v]) => v === content.id) || [];
        if (origId) {
          problemInfoMap[origId].problemNumber = problemNumberCounter;
          problemNumberCounter++;
        }
      }
    }

    // 4. 이미지 업로드 (CSE 동일)
    Logger.debug(`이미지 업로드 ... ${contents_raw.length}개`);
    const tasks = contents_raw.map((box) => {
      if (box.type === "passage") {
        const ref = passageRefMap[box.id];
        const filePath1 = path.join(imagesPath, `passage_${box.id}.png`);
        const filePath2 = path.join(imagesPath, `passage-${box.id}.png`);
        const dest = `passages/${ref.id}/image.png`;
        return limit(async () => {
          const chosen = (await existsFile(filePath1)) ? filePath1 : (await existsFile(filePath2)) ? filePath2 : null;
          if (chosen) {
            const url = await uploadFileToFirebase(admin, chosen, dest, "png");
            passageInfoMap[box.id].imageURL = url;
          }
        });
      } else if (box.type === "question") {
        const ref = problemRefMap[box.id];
        const filePath1 = path.join(imagesPath, `question_${box.id}.png`);
        const filePath2 = path.join(imagesPath, `question-${box.id}.png`);
        const dest = `problems/${ref.id}/image.png`;
        return limit(async () => {
          const chosen = (await existsFile(filePath1)) ? filePath1 : (await existsFile(filePath2)) ? filePath2 : null;
          if (chosen) {
            const url = await uploadFileToFirebase(admin, chosen, dest, "png");
            problemInfoMap[box.id].imageURL = url;
          }
        });
      }
      return Promise.resolve();
    });

    await Promise.all(tasks);
    Logger.debug("이미지 업로드 완료");

    // 5. Material 생성 (SchoolExamPaperMaterial, ALS 포맷)
    // createdAt/updatedAt는 JS Date로 저장

    // 스키마에 맞는 메타데이터 구성
    const highSchoolYearNumber = Number(String(metadata.grade).replace(/[^0-9]/g, "")) || 1;
    const executionYearNumber = Number(String(metadata.executionYear).replace(/[^0-9]/g, "")) || new Date().getFullYear();

    const section = { code: metadata.subject || "국어", name: metadata.subject || "국어" };
    const subject = { code: "etc", name: "기타" };

    // 학년 -> StudentGrade 매핑
    const gradeText = String(metadata.grade || "");
    let studentGrade = null;
    if (gradeText.includes("1")) studentGrade = "high1";
    else if (gradeText.includes("2")) studentGrade = "high2";
    else if (gradeText.includes("3")) studentGrade = "high3";

    // 학기/시험기간 -> 내신 시험 타입 매핑
    let schoolExamType;
    const semesterStr = String(metadata.semester || "1");
    const examPeriodStr = String(metadata.examPeriod || "중간고사");
    if (semesterStr.includes("1") && examPeriodStr.includes("중간")) {
      schoolExamType = { type: "firstMidterm", order: 100 };
    } else if (semesterStr.includes("1") && examPeriodStr.includes("기말")) {
      schoolExamType = { type: "firstFinal", order: 200 };
    } else if (semesterStr.includes("2") && examPeriodStr.includes("중간")) {
      schoolExamType = { type: "secondMidterm", order: 300 };
    } else {
      schoolExamType = { type: "secondFinal", order: 400 };
    }

    const schoolMaterialMetadata = {
      school: {
        id: "unknown",
        address: "",
        city: "",
        district: "",
        highSchoolType: "",
        name: metadata.schoolName || "",
        // logoURL: 생략 가능 (optional)
      },
      highSchoolYear: Math.min(Math.max(highSchoolYearNumber, 1), 3),
      studentGrade: studentGrade,
      executionYear: executionYearNumber,
      section,
      subject,
      bookPublisher: null,
      schoolExamType,
    };

    const materialInfo = {
      _tag: TAG_NAESIN,
      type: "examPaper",
      subType: "school",
      schoolExamPaperVersion: "V2",

      title: title,
      shortTitle: shortTitle,
      description: `${metadata.schoolName} ${executionYearNumber}년 ${metadata.semester} ${metadata.examPeriod} ${metadata.subject} 내신`,
      embededDescriptionURL: null,
      isVisible: false,
      authority: "free",

      createdAt: currentDate,
      updatedAt: currentDate,
      addedCount: 0,

      thumbnailURL: "https://firebasestorage.googleapis.com/v0/b/giyoung.appspot.com/o/textbookTemplates%2FIx6bYkhXVU7Sn4JXUSRT%2F1731936203960_thumbnail.png?alt=media&token=e3e744e7-2b30-48aa-aebb-0b2d6da9e73a",
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

      metadata: schoolMaterialMetadata,
      contents: {
        format: "als",
        depth: 1,
        alsIds: [examPaperId],
        contents: {
          alsId: examPaperId,
          title: title,
          numberOfProblems: problems.length,
          perfectScore: perfectScore,
          hideExplanationBeforeGrade: false,
        },
      },
    };

    batch.set(materialRef, materialInfo);
    count++;

    // 6. ExamPaper 생성 (CSE 형식 동일)
    const problemCount = problems.length;
    const examPaperInfo = {
      _world: "world",
      _worldSchemaVersion: 1,

      title: title,
      shortTitle: shortTitle,

      createdAt: currentDate,

      isVisible: true,
      thumbnailURL: null,

      executionYear: Number(String(metadata.executionYear).replace(/[^0-9]/g, "")) || null,
      executionMonth: null,
      highSchoolYear: null,

      problemCount: problemCount,
      perfectScore: perfectScore,

      supervisor: "school",
      materialId: materialId,

      duration: null,

      scoreCutURL: null,

      section: { code: "etc", name: "기타" },
      subject: { code: "etc", name: "기타" },

      pages: pages,
      contents: contents,

      explanationPDFDownloadURL: null,
      explanationVideoURL: null,
    };

    batch.set(examPaperRef, examPaperInfo);
    count++;

    // 7. Problems && Passages 생성 (CSE 형식 동일)
    for (const box of contents_raw) {
      if (box.type === "passage") {
        const passageId = box.id;
        const passageRef = passageRefMap[passageId];
        batch.set(passageRef, passageInfoMap[passageId]);
        count++;
      } else if (box.type === "question") {
        const problemId = box.id;
        const problemRef = problemRefMap[problemId];
        batch.set(problemRef, problemInfoMap[problemId]);
        count++;
      }
    }

    if (count > 300) {
      await batch.commit();
      batch = admin.firestore().batch();
      count = 0;
    }

    // 9. 업로드 정보 업데이트 (id 맵 최신화 포함)
    uploadInfo.problemIdMap = { ...(uploadInfo.problemIdMap || {}), ...problemIdMapNew };
    uploadInfo.passageIdMap = { ...(uploadInfo.passageIdMap || {}), ...passageIdMapNew };
    uploadInfo.uploadedAt = currentDate;
    uploadInfo.uploadStatus = "completed";

    await fs.writeFile(
      uploadInfoFilePath,
      JSON.stringify({ ...uploadInfo }, null, 2)
    );

    Logger.info(`✅ ${subdirName} 업로드 완료`);
  }

  // 10. 배치 커밋
  if (count > 0) {
    await batch.commit();
    Logger.info(`총 ${count}개 문서 업로드 완료`);
  }

  Logger.endSection("업로드 작업 완료");
}