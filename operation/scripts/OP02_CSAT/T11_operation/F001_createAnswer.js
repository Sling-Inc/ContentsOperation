import fs from "fs/promises";
import os from "os";
import path from "path";
import { readDirectories, existsFile } from "#operation/utils/file.js";
import { Logger } from "#operation/utils/logger.js";
import { runGemini } from "#operation/utils/gemini.js";

const CONCURRENCY_LIMIT = os.cpus().length;

export const LLM_MODEL = "gemini-2.5-pro";
export const LLM_PROMPT = `
# Task
당신은 대한민국의 교육 전문가이며, 정답지를 보고 정답을 추출하는데 능숙합니다.
주어진 시험지 과목 array 정보와 답안지 이미지 파일을 보고, 각 과목별로 문제별 정답을 추출해야 합니다.

# 주의사항
- 정답지에는 해당 과목 뿐 만 아니라 다른 과목의 정답까지 구성되어 있을 수 있습니다. 시험지 정보의 과목명의 정답만 추출해야 합니다.
- 특정 과목은 문제가 1번부터 시작하지 않을 수 있습니다.
- 수학 관련 과목을 제외한 과목들의 정답은 모두 객관식이며, 1 부터 5 사이의 숫자입니다.
- 수학 관련 과목의 일부 정답은 주관식이며, 정수입니다.
`;

export const LLM_CONFIG = {
  temperature: 0.0,
  responseMimeType: "application/json",
  responseSchema: {
    type: "array",
    items: {
      type: "object",
      required: ["subject", "answers"],
      properties: {
        subject: {
          type: "string",
          description: "주어진 과목",
        },
        answers: {
          type: "array",
          items: {
            type: "object",
            required: ["id", "answer"],
            properties: {
              id: {
                type: "string",
                description: "문제의 고유 id",
              },
              answer: {
                type: "number",
                description: "해당 문제의 정답",
              },
            },
          },
        },
      },
    },
  },
};

async function processExam(info) {
  const { id, subjects, answerFilePath, outputFilePath, isDebug } = info;

  Logger.debug(`Processing exam: ${id}`);
  try {
    const answerFileData = await fs.readFile(path.join(answerFilePath));

    const result = await runGemini(
      {
        model: LLM_MODEL,
        config: LLM_CONFIG,
        contents: [
          {
            role: "user",
            parts: [
              { text: LLM_PROMPT },
              {
                text: `# 시험지 정보\n${JSON.stringify(subjects, null, 2)}`,
              },
              {
                inlineData: {
                  mimeType: "image/png",
                  data: Buffer.from(answerFileData).toString("base64"),
                },
              },
            ],
          },
        ],
      },
      isDebug
    );

    const outputPath = path.join(outputFilePath, "answers.json");
    await fs.writeFile(outputPath, JSON.stringify(result.response, null, 2));

    Logger.info(`Successfully processed and saved results to ${outputPath}`);
  } catch (error) {
    Logger.error(`Failed to process exam ${id}: ${error.message}`);
    Logger.debug(error.stack);
  }
}

export async function F001_createAnswer(TARGET_DIR, ANSWERS_DIR) {
  const dirs = await readDirectories(TARGET_DIR);

  const taskQueue = [];

  for (const dir of dirs) {
    const [type, year, month, grade, supervisor, section, subject] =
      dir.split("_");

    if (type !== "problem") continue;

    const answerFileName = `${year}_${month}_${grade}_${supervisor}_${section}.png`;

    if (!existsFile(path.join(ANSWERS_DIR, answerFileName))) {
      Logger.error(`${answerFileName} not found`);
      continue;
    }

    const subDirs = (await readDirectories(path.join(TARGET_DIR, dir))).map(
      (item) =>
        item === "default" ? (subject === "공통" ? section : subject) : item
    );

    taskQueue.push({
      id: dir,
      subjects: subDirs,
      answerFilePath: path.join(ANSWERS_DIR, answerFileName),
      outputFilePath: path.join(TARGET_DIR, dir),
      isDebug: false,
    });
  }

  const worker = async (workerId) => {
    while (taskQueue.length > 0) {
      const llmInfo = taskQueue.shift();
      if (!llmInfo) continue;

      Logger.info(`[Worker ${workerId}] Picked up exam: ${llmInfo.id}`);
      await processExam(llmInfo);
    }
  };

  const workerPromises = [];
  for (let i = 1; i <= CONCURRENCY_LIMIT && i <= taskQueue.length; i++) {
    workerPromises.push(worker(i));
  }
  await Promise.all(workerPromises);
}
