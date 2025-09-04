import { getFirebaseAdmin } from "#operation/credentials/firebaseCredentials.js";
import { Logger } from "#operation/utils/logger.js";

const TAG_NAESIN = "202501_naesin";

export async function F002_updateVisible() {
  const { admin } = await getFirebaseAdmin();

  Logger.section("내신 자료 가시성 업데이트 시작");

  const targets = await admin
    .firestore()
    .collection("materials")
    .where("_tag", "==", TAG_NAESIN)
    .get();

  Logger.info(`총 ${targets.docs.length}개의 내신 자료를 찾았습니다.`);

  let count = 0;
  let batch = admin.firestore().batch();

  for (const target of targets.docs) {
    batch.update(target.ref, {
      isVisible: true,
      updatedAt: new Date(),
    });

    if (++count % 500 === 0) {
      await batch.commit();
      batch = admin.firestore().batch();
      Logger.info(`${count}개 처리 완료`);
    }
  }

  if (count % 500 !== 0) {
    await batch.commit();
  }

  Logger.info(`총 ${count}개의 내신 자료 가시성 업데이트 완료`);
  Logger.endSection("가시성 업데이트 완료");
}