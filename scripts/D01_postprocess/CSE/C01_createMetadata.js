import fs from "fs/promises";
import path from "path";
import { Logger } from "#root/utils/logger.js";

const GRADES = ["5급", "7급", "8급", "9급", "연구사", "지도사"];
const TAGS_경찰 = {
  간부후보: "간부후보",
  "경찰 경력채용": "경력채용",
  "경찰 공개채용 외": "경력채용",
  "경찰 특공대": "특공대",
  "경찰대 편입": "경찰대 편입",
  승진시험: "승진시험",
  "해경 공채 · 경채": null,
};

const ROUND = ["1차", "2차", "3차", "4차", "1회", "2회", "3회", "4회"];
const RECRUIT_TYPE = ["지역인재", "기술계고", "보훈청"];

/**
 * 파일 이름에서 메타데이터를 생성합니다.
 * @param {string} fileName - 파일 이름 (예: "2024년 5급 공채시험-국어")
 * @returns {{executionYear: number|null, grade: string|null}}
 */
function createMetadata(fileName) {
  const normalizedFileName = fileName.normalize("NFC");

  let executionYear = null;
  let grade = null;
  let round = null;
  let section = null;
  let option = null;
  let tag = null;
  let recruitType = null;
  let recruitSubType = null;
  let supervisor = null;
  let categories = [];

  /* executionYear */
  const yearMatch = normalizedFileName.match(/(\d{4})/);
  executionYear = yearMatch ? Number(yearMatch[1]) : null;

  /* grade */
  grade = GRADES.find((g) => normalizedFileName.includes(g)) || null;

  /* round */
  round = ROUND.find((r) => normalizedFileName.includes(r)) || null;

  const fileNameWithoutYear = normalizedFileName.replace(/(\d{4}년 )/, "");
  // PSAT
  if (fileNameWithoutYear.startsWith("PSAT")) {
    option = "PSAT";
    const keywords = fileNameWithoutYear.split(" ");

    supervisor = keywords[1];
    recruitType = `${supervisor}${grade ? ` ${grade}` : ""}`;
    tag = recruitType;
  }
  // 경찰
  else if (
    fileNameWithoutYear.startsWith("경찰") ||
    fileNameWithoutYear.startsWith("해경")
  ) {
    option = "경찰";
    supervisor = fileNameWithoutYear.startsWith("경찰") ? "경찰" : "해경";
    section =
      fileNameWithoutYear.split(" ")[fileNameWithoutYear.split(" ").length - 1];

    const match = section.match(/^(.*?)\((.*?)\)$/);
    if (match) {
      section = match[1];
      recruitSubType = match[2];
    }

    for (const [key, value] of Object.entries(TAGS_경찰)) {
      if (fileNameWithoutYear.includes(key)) {
        tag = key;
        recruitType = value;
      }
    }
  }
  // 군무원
  else if (fileNameWithoutYear.startsWith("군무원")) {
    option = "군무원";

    const keywords = fileNameWithoutYear.split(" ");
    supervisor = keywords[0];
    section = keywords[keywords.length - 1];

    recruitType =
      RECRUIT_TYPE.find((r) => fileNameWithoutYear.includes(r)) || null;
  }
  // 소방
  else if (fileNameWithoutYear.startsWith("소방")) {
    option = "소방";
  }
  // 공무원
  else {
    option = "공무원";

    const keywords = fileNameWithoutYear.split(" ");
    supervisor = keywords[0];
    section = keywords[keywords.length - 1];

    const match = section.match(/^(.*?)\((.*?)\)$/);
    if (match) {
      section = match[1];
      recruitSubType = match[2];
    }

    recruitType =
      RECRUIT_TYPE.find((r) => fileNameWithoutYear.includes(r)) || null;
  }

  return {
    categories,
    executionYear,
    grade,
    option,
    recruitSubType,
    recruitType,
    round,
    section,
    supervisor,
    tag,
  };
}

/**
 * 메인 실행 함수
 * @param {string} inputDir - 입력 디렉토리 경로
 * @param {string} outputDir - 출력 디렉토리 경로
 */
async function run(inputDir, outputDir) {
  Logger.section(`Start creating metadata from ${inputDir}`);

  try {
    const entries = await fs.readdir(inputDir, { withFileTypes: true });
    const subdirectories = entries.filter((entry) => entry.isDirectory());

    if (subdirectories.length === 0) {
      Logger.warn("No subdirectories found in the input directory.");
      return;
    }

    for (const subdir of subdirectories) {
      const subdirName = subdir.name;
      Logger.info(`Processing: ${subdirName}`);

      const metadata = createMetadata(subdirName);

      const outputSubdirPath = path.join(outputDir, subdirName);
      await fs.mkdir(outputSubdirPath, { recursive: true });

      const outputPath = path.join(outputSubdirPath, "metadata.json");
      await fs.writeFile(
        outputPath,
        JSON.stringify(metadata, null, 2),
        "utf-8"
      );

      Logger.log(`  -> Created metadata.json at ${outputPath}`);
    }
  } catch (error) {
    Logger.error("An error occurred while creating metadata:", error);
  } finally {
    Logger.endSection();
  }
}

/**
 * 스크립트 진입점
 */
function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    Logger.error(
      "Usage: node scripts/D01_postprocess/CSE/C01_createMetadata.js <input_directory> <output_directory>"
    );
    process.exit(1);
  }

  const [inputDir, outputDir] = args;
  run(inputDir, outputDir).finally(() => {
    Logger.close();
  });
}

main();
