import { getFirebaseAdmin } from "#operation/credentials/firebaseCredentials.js";
import { Logger } from "#operation/utils/logger.js";

export async function F014_updateVisible(TAG) {
  const { admin } = await getFirebaseAdmin();
  console.log(TAG);

  const targets = await admin
    .firestore()
    .collection("materials")
    .where("_tag", "==", TAG)
    .get();

  let count = 0;
  let batch = admin.firestore().batch();

  for (const target of targets.docs) {
    batch.update(target.ref, {
      isVisible: true,
    });
    console.log(target.data().metadata.highSchoolYear, target.data().title);

    if (++count % 500 === 0) {
      await batch.commit();
      batch = admin.firestore().batch();
    }
  }

  await batch.commit();
}
