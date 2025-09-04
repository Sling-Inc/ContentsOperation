import path from "path";
import pLimit from "p-limit";
import { Logger } from "#operation/utils/logger.js";
import {
  existsFile,
  readDirectories,
  readFilesWithExt,
  readJSONFile,
} from "#root/operation/utils/file.js";
import { uploadFileToFirebase } from "#root/operation/utils/bucket.js";
import { getFirebaseAdmin } from "#root/operation/credentials/firebaseCredentials.js";

const limit = pLimit(10);

export async function F017_updateExplanations(TARGET_DIR) {
  Logger.section("F017_updateExplanations");
  const { admin } = await getFirebaseAdmin();

  const dirs = await readDirectories(TARGET_DIR);

  for (const dir of dirs) {
    const metadataFiles = (
      await readFilesWithExt(path.join(TARGET_DIR, dir), ".json")
    ).filter((item) => path.basename(item).startsWith("metadata"));

    for (const metadataFile of metadataFiles) {
      const metadata = await readJSONFile(metadataFile);

      if (metadata.type !== "problem") continue;

      const explanationMetadataFile = path.join(
        TARGET_DIR,
        dir.replace("problem", "explanation"),
        path.basename(metadataFile)
      );

      if (!(await existsFile(explanationMetadataFile))) {
        Logger.warn(`[${dir}] explanation metadata file not found`);
        continue;
      }

      Logger.section(`[${dir}] ${path.basename(metadataFile)}`);

      const explanationMetadata = await readJSONFile(explanationMetadataFile);

      const imageTasks = [];
      const tasks = [];
      const batch = admin.firestore().batch();

      for (const [id, problem] of Object.entries(metadata.problems)) {
        if (!explanationMetadata.problems[id]) {
          Logger.warn(`[${dir}] problem: ${id} explanation metadata not found`);
          continue;
        }

        imageTasks.push(
          limit(async () => {
            const explanationImageURL = await uploadFileToFirebase(
              admin,
              explanationMetadata.problems[id].imageURL,
              `problems/${problem.problemId}/explanation.png`,
              "png"
            );

            tasks.push({
              type: "problem",
              problemId: problem.problemId,
              explanationImageURL,
            });
          })
        );
      }

      for (const [id, passage] of Object.entries(metadata.passages)) {
        if (!explanationMetadata.passages[id]) {
          Logger.warn(`[${dir}] passage: ${id} explanation metadata not found`);
          continue;
        }

        imageTasks.push(
          limit(async () => {
            const explanationImageURL = await uploadFileToFirebase(
              admin,
              explanationMetadata.passages[id].imageURL,
              `passages/${passage.passageId}/explanation.png`,
              "png"
            );

            tasks.push({
              type: "passage",
              passageId: passage.passageId,
              explanationImageURL,
            });
          })
        );
      }

      await Promise.all(imageTasks);
      Logger.debug(`imageTasks: ${imageTasks.length} done`);

      for (const task of tasks) {
        if (task.type === "problem") {
          const problemRef = admin
            .firestore()
            .collection("problems")
            .doc(task.problemId);

          batch.update(problemRef, {
            explanations: [
              {
                author: "EBS",
                imageURL: task.explanationImageURL,
              },
            ],
          });
        } else if (task.type === "passage") {
          const passageRef = admin
            .firestore()
            .collection("passages")
            .doc(task.passageId);

          batch.update(passageRef, {
            explanationImageURL: task.explanationImageURL,
          });
        }
      }

      await batch.commit();
      Logger.debug(`batch commit done`);
      Logger.endSection();
    }
  }

  Logger.endSection();
}
