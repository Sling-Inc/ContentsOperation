/**
  node operation OP02_CSAT T11_operation F001
 */
import path from "path";
import { Logger } from "#operation/utils/logger.js";

import { getFirebaseAdmin } from "#operation/credentials/firebaseCredentials.js";
import {
  readDirectories,
  readFilesWithExt,
  readJSONFile,
  writeFile,
} from "#root/operation/utils/file.js";

async function checkId(PROD, DEV, collection, id, errorCondition) {
  const [prodDoc, devDoc] = await Promise.all([
    PROD.admin.firestore().collection(collection).doc(id).get(),
    DEV.admin.firestore().collection(collection).doc(id).get(),
  ]);

  if (prodDoc.exists && errorCondition(prodDoc.data())) {
    Logger.warn(`[PROD] ${collection}: ${id} 이미 존재합니다.`);
  }

  if (devDoc.exists && errorCondition(devDoc.data())) {
    Logger.warn(`[DEV] ${collection}: ${id} 이미 존재합니다.`);
  }
}

async function createId(PROD, DEV, collection, set) {
  while (true) {
    const newId = PROD.admin.firestore().collection(collection).doc().id;

    if (set.has(newId)) continue;

    const [prodDoc, devDoc] = await Promise.all([
      PROD.admin.firestore().collection(collection).doc(newId).get(),
      DEV.admin.firestore().collection(collection).doc(newId).get(),
    ]);

    if (prodDoc.exists) {
      continue;
    }

    if (devDoc.exists) {
      continue;
    }

    return newId;
  }
}

export async function F010_createIds(TARGET_DIR) {
  Logger.section("Create ids");

  const PROD = await getFirebaseAdmin("giyoung");
  const DEV = await getFirebaseAdmin("dev-giyoung");

  const materialIdSet = new Set();
  const examPaperIdSet = new Set();
  const problemIdSet = new Set();
  const passageIdSet = new Set();

  const dirs = await readDirectories(TARGET_DIR);

  for (const dir of dirs) {
    const metadataFiles = await readFilesWithExt(
      path.join(TARGET_DIR, dir),
      ".json"
    );

    for (const metadataFile of metadataFiles) {
      const metadata = await readJSONFile(metadataFile);

      if (metadata.type !== "problem") continue;
      Logger.debug(metadataFile);

      /**
       *
       * material
       *
       */
      let materialId = metadata.materialId || "";

      if (materialId) {
        await checkId(PROD, DEV, "materials", materialId, (doc) => {
          return metadata.title !== doc.title;
        });
      } else materialId = await createId(PROD, DEV, "materials", materialIdSet);

      materialIdSet.add(materialId);
      metadata.materialId = materialId;
      await writeFile(metadataFile, JSON.stringify({ ...metadata }, null, 2));

      /**
       *
       * examPaper
       *
       */
      let examPaperId = metadata.examPaperId || "";

      if (examPaperId) {
        await checkId(PROD, DEV, "examPapers", examPaperId, (doc) => {
          return metadata.title !== doc.title;
        });
      } else
        examPaperId = await createId(PROD, DEV, "examPapers", examPaperIdSet);

      examPaperIdSet.add(examPaperId);
      metadata.examPaperId = examPaperId;
      await writeFile(metadataFile, JSON.stringify({ ...metadata }, null, 2));

      /**
       *
       * problem
       *
       */
      for (const problem of Object.values(metadata.problems)) {
        let problemId = problem.problemId || "";

        if (problemId) {
          await checkId(PROD, DEV, "problems", problemId, () => true);
        } else problemId = await createId(PROD, DEV, "problems", problemIdSet);

        problemIdSet.add(problemId);
        problem.problemId = problemId;
      }

      await writeFile(metadataFile, JSON.stringify({ ...metadata }, null, 2));

      /**
       *
       * passage
       *
       */
      for (const passage of Object.values(metadata.passages)) {
        let passageId = passage.passageId || "";

        if (passageId) {
          await checkId(PROD, DEV, "passages", passageId, () => true);
        } else passageId = await createId(PROD, DEV, "passages", passageIdSet);

        passageIdSet.add(passageId);
        passage.passageId = passageId;
      }

      await writeFile(metadataFile, JSON.stringify({ ...metadata }, null, 2));
    }
  }

  Logger.endSection();
}
