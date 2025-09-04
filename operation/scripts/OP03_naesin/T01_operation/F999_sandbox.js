import { getFirebaseAdmin } from "#operation/credentials/firebaseCredentials.js";
import { Logger } from "#operation/utils/logger.js";

const TAG_NAESIN = "202501_naesin";

export async function F999_sandbox() {
  const { admin } = await getFirebaseAdmin();

  Logger.section("내신 자료 샌드박스 작업 시작");

  const targets = await admin
    .firestore()
    .collection("materials")
    .where("_tag", "==", TAG_NAESIN)
    .get();

  Logger.info(`총 ${targets.docs.length}개의 내신 자료를 찾았습니다.`);

  let batch = admin.firestore().batch();
  let count = 0;

  for (const target of targets.docs) {
    const data = target.data();
    
    // 여기에 필요한 샌드박스 로직을 추가하세요
    // 예: 특정 조건에 맞는 자료들을 수정하거나 조회하는 작업
    
    Logger.debug(`처리 중: ${data.title}`);
    count++;
  }

  if (count > 0) {
    await batch.commit();
    Logger.info(`총 ${count}개 자료 처리 완료`);
  } else {
    Logger.info("처리할 자료가 없습니다.");
  }

  Logger.endSection("샌드박스 작업 완료");
}