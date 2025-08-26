import fs from "fs/promises";
import path from "path";
import os from "os";
import { glob } from "glob";
import { Logger } from "#root/utils/logger.js";
import { runGemini } from "#root/utils/gemini.js";

const CONCURRENCY_LIMIT = os.cpus().length;

export const LLM_MODEL = "gemini-2.5-pro";
export const LLM_PROMPT = `
# Task
당신은 대한민국의 교육 전문가이며, 정답지를 보고 정답을 추출하는데 능숙합니다.
주어진 시험지 정보와 답안지 파일을 보고, 문제별 정답을 추출해야 합니다.
주어지는 시험지 정보는 다음과 같습니다.
- metadata: 시험지의 메타 정보 (책형, 과목 등)
- structure: 문제 및 지문 정보 배열
  - id: 문제/지문의 고유 ID
  - choiceCount: (문제인 경우) 객관식 선택지 개수

# 주의사항
- 정답지에는 해당 과목 뿐 만 아니라 다른 과목의 정답까지 표로 구성되어 있을 수 있습니다. 시험지 정보의 과목명과 일치하는 정답만 추출해야 합니다.
- 대한민국 공무원 시험에는 '책형'이라는 시험지 버전 구분이 있으며, 정답지에는 같은 과목이라도 여러 책형의 정답이 있을 수 있습니다. 시험지 정보의 책형과 일치하는 정답만 추출해야 합니다.
- 문제 정답은 모두 객관식입니다.
- 문제의 정답이 복수정답일 수 있습니다. 해당 문제의 정답을 모두 추출해야 합니다.
- '모두 정답' 처리: 만약 정답이 '모두 정답'인 경우, 해당 문제의 모든 선택지를 정답으로 반환해야 합니다. (예: choiceCount가 4이면 [1, 2, 3, 4]를 반환)
`;

export const LLM_CONFIG = {
  temperature: 0.0,
  responseMimeType: "application/json",
  responseSchema: {
    type: "object",
    properties: {
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
              type: "array",
              items: {
                type: "number",
              },
              description: "해당 문제의 정답 목록 (복수 정답 가능)",
            },
          },
        },
      },
    },
  },
};

/**
 * 단일 시험지에 대한 정답 추출 로직
 */
async function processExam(
  examName,
  llmResultFile,
  answersDir,
  outputDirForExam,
  isDebug
) {
  Logger.section(`Processing exam: ${examName}`);
  try {
    await fs.mkdir(outputDirForExam, { recursive: true });

    const llmResultData = JSON.parse(await fs.readFile(llmResultFile, "utf-8"));

    // LLM에 전달할 시험지 정보만 필터링
    const examInfoForLlm = {
      metadata: llmResultData.metadata,
      structure: llmResultData.structure
        .filter((item) => item.type === "problem")
        .map(({ id, choiceCount }) => ({ id, choiceCount })),
    };

    const answerFileData = await fs.readFile(
      path.join(answersDir, `${examName}.pdf`)
    );

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
                text: `# 시험지 정보\n${JSON.stringify(
                  examInfoForLlm,
                  null,
                  2
                )}`,
              },
              {
                inlineData: {
                  mimeType: "application/pdf",
                  data: Buffer.from(answerFileData).toString("base64"),
                },
              },
            ],
          },
        ],
      },
      isDebug
    );

    const outputPath = path.join(outputDirForExam, "answers.json");
    await fs.writeFile(outputPath, JSON.stringify(result.response, null, 2));

    Logger.info(`Successfully processed and saved results to ${outputPath}`);
  } catch (error) {
    Logger.error(`Failed to process exam ${examName}: ${error.message}`);
    Logger.debug(error.stack);
  }
}

/**
 * 메인 함수
 */
async function main() {
  Logger.section("D01-CSE-02 LLM Extract Answer Start");

  const args = process.argv.slice(2);
  const isDebug = args.includes("--debug");
  if (isDebug) {
    args.splice(args.indexOf("--debug"), 1);
  }

  if (args.length < 3) {
    Logger.error(
      "Usage: node scripts/D01_postprocess/CSE/02_llmExtractAnswer.js <llmClassificationDir> <answersDir> <outputDir> [--debug]"
    );
    process.exit(1);
  }

  const [llmClassificationDir, answersDir, outputDir] = args;

  Logger.info("Arguments received:");
  Logger.info(`  - LLM Classification Dir: ${llmClassificationDir}`);
  Logger.info(`  - Answers Dir: ${answersDir}`);
  Logger.info(`  - Output Dir: ${outputDir}`);
  Logger.info(`  - Debug Mode: ${isDebug}`);
  Logger.info(`  - Concurrency Limit: ${CONCURRENCY_LIMIT}`);

  try {
    await fs.mkdir(outputDir, { recursive: true });

    const llmResultFiles = await glob(
      path.join(llmClassificationDir, "**/llmResult.json")
    );
    Logger.info(
      `Found ${llmResultFiles.length} llmResult.json files to process.`
    );

    const taskQueue = [...llmResultFiles];

    const worker = async (workerId) => {
      while (taskQueue.length > 0) {
        const llmResultFile = taskQueue.shift();
        if (!llmResultFile) continue;

        const examName = path.basename(path.dirname(llmResultFile));
        const outputDirForExam = path.join(outputDir, examName);

        Logger.info(`[Worker ${workerId}] Picked up exam: ${examName}`);
        await processExam(
          examName,
          llmResultFile,
          answersDir,
          outputDirForExam,
          isDebug
        );
      }
    };

    const workerPromises = [];
    for (let i = 1; i <= CONCURRENCY_LIMIT && i <= llmResultFiles.length; i++) {
      workerPromises.push(worker(i));
    }
    await Promise.all(workerPromises);
  } catch (error) {
    Logger.error(`An error occurred during the process: ${error.stack}`);
  } finally {
    Logger.endSection("D01-CSE-02 LLM Extract Answer Finished");
    Logger.close();
  }
}

main();
