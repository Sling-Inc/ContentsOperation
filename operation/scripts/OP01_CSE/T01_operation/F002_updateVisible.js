import { getFirebaseAdmin } from "#operation/credentials/firebaseCredentials.js";
import { Logger } from "#operation/utils/logger.js";

const TAG_CSE = "202508_CSE";

export async function F002_updateVisible() {
  const { admin } = await getFirebaseAdmin();

  const targets = await admin
    .firestore()
    .collection("materials")
    .where("_tag", "==", TAG_CSE)
    .get();

  let count = 0;
  let batch = admin.firestore().batch();

  for (const target of targets.docs) {
    batch.update(target.ref, {
      isVisible: true,
    });

    if (++count % 500 === 0) {
      await batch.commit();
      batch = admin.firestore().batch();
    }
  }

  await batch.commit();
}
