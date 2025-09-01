import fs from "fs";
import path from "path";
import {
  readDirectories,
  readFilesWithExt,
  readJSONFile,
} from "#root/operation/utils/file.js";

const FILE_NORMALIZE = true;

export async function D000_checkThumbnails(TARGET_DIR, THUMBNAIL_DIR) {
  if (FILE_NORMALIZE) {
    {
      const thumbnailPath = path.join(THUMBNAIL_DIR);
      for (const size of ["150", "640"]) {
        const thumbnailsSizePath = path.join(thumbnailPath, size);
        const thumbnailFiles = fs.readdirSync(thumbnailsSizePath);

        for (const thumbnailFileName of thumbnailFiles) {
          const originalFilePath = path.join(
            thumbnailsSizePath,
            thumbnailFileName
          );
          const normalizedName = thumbnailFileName
            .replace("1", "Ⅰ")
            .replace("2", "ⅠⅠ")
            .replace("고Ⅰ", "고1")
            .replace("고1Ⅰ", "고2")
            .replace("통합과학", "공통")
            .replace("통합사회", "공통")
            .replace("_국어.png", "_국어_공통.png")
            .replace("_수학.png", "_수학_공통.png")
            .replace("_영어.png", "_영어_공통.png")
            .replace("OoE_한국사.png", "OoE_한국사_한국사.png")
            .replace("KICE_한국사.png", "KICE_한국사_한국사.png")

            .replace("언매.png", "언어와 매체.png")
            .replace("화작.png", "화법과 작문.png")
            .replace("제ⅠⅠ외국어", "제2외국어")
            .replace("교육청", "OoE")
            .replace("평가원", "KICE")
            .replace("사회문화", "사회·문화")
            .replace("생활과윤리", "생활과 윤리")
            .replace("윤리와사상", "윤리와 사상")
            .replace("정치와법", "정치와 법")
            .replace("공업일반", "공업 일반")
            .replace("농업기초기술", "농업 기초 기술")
            .replace("상업경제", "상업 경제")

            .normalize("NFC");
          const normalizedPath = path.join(thumbnailsSizePath, normalizedName);

          if (originalFilePath !== normalizedPath) {
            fs.renameSync(originalFilePath, normalizedPath);
          }
        }
      }
    }
  }

  const dirs = await readDirectories(TARGET_DIR);

  for (const dir of dirs) {
    const metadataFiles = await readFilesWithExt(
      path.join(TARGET_DIR, dir),
      ".json"
    );

    for (const metadataFile of metadataFiles) {
      const metadata = await readJSONFile(metadataFile);
      if (metadata.type !== "problem") continue;

      const title = `${metadata.info.metadata.executionMonth}월_고${metadata.info.metadata.highSchoolYear}_${metadata.info.metadata.supervisor}_${metadata.info.metadata.section.name}_${metadata.info.metadata.subject.name}.png`;

      if (!fs.existsSync(path.join(THUMBNAIL_DIR, "150", title))) {
        console.log("150", title);
      }
      if (!fs.existsSync(path.join(THUMBNAIL_DIR, "640", title))) {
        console.log("640", title);
      }
    }
  }
}
