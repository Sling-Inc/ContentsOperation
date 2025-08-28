import { getFirebaseAdmin } from "#operation/credentials/firebaseCredentials.js";

export async function F999_sandbox() {
  const { admin } = await getFirebaseAdmin();

  const targets = await admin
    .firestore()
    .collection("materials")
    .where("_world", "==", "CSE")
    .get();

  let batch = admin.firestore().batch();

  for (const target of targets.docs) {
    const data = target.data();
    if (data.metadata.option === "경찰" && data.title.includes("간부후보")) {
      if (data.title.includes(String(data.metadata.executionYear))) {
        console.log(data.title);

        batch.update(target.ref, {
          "metadata.executionYear": data.metadata.executionYear - 1,
        });
      }
    }
  }

  await batch.commit();
}
