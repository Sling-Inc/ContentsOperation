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
당신은 대한민국의 고등학교 교육 전문가이며, 내신 시험 답안지를 보고 정답을 추출하는데 능숙합니다.
주어진 시험지 정보와 답안지 파일을 보고, 객관식 문제의 정답만 추출해야 합니다.
주어지는 시험지 정보는 다음과 같습니다.
- metadata: 시험지의 메타 정보 (학년, 과목, 학기, 시험기간 등)
- structure: 문제 및 지문 정보 배열
  - id: 문제/지문의 고유 ID
  - choiceCount: (문제인 경우) 객관식 선택지 개수
  - subject: 과목명
  - section: 과목 대분류 (국어, 수학, 영어, 사회탐구, 과학탐구, 제2외국어, 기타)

# 주의사항
- 답안지에는 해당 과목뿐만 아니라 다른 과목의 정답까지 표로 구성되어 있을 수 있습니다. 시험지 정보의 과목명과 일치하는 정답만 추출해야 합니다.
- 고등학교 내신 시험은 학년별, 학기별, 시험기간별로 구분되며, 답안지에는 같은 과목이라도 여러 학년/학기/시험기간의 정답이 있을 수 있습니다. 시험지 정보와 일치하는 정답만 추출해야 합니다.
- 객관식 문제만 정답을 추출합니다. 서답형(주관식) 문제는 결과에 포함하지 않습니다.
- 객관식 문제의 정답이 복수정답일 수 있습니다. 해당 문제의 정답을 모두 추출해야 합니다.
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
              description: "객관식 문제의 고유 id",
            },
            answer: {
              type: "array",
              items: {
                type: "number",
              },
              description: "객관식 문제의 정답 목록 (복수 정답 가능)",
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

    // LLM에 전달할 시험지 정보만 필터링 (객관식 문제만)
    const examInfoForLlm = {
      metadata: llmResultData.metadata,
      structure: llmResultData.structure
        .filter((item) => item.type === "problem" && item.choiceCount > 0)
        .map(({ id, choiceCount, subject, section }) => ({ id, choiceCount, subject, section })),
    };

    // 답안 PDF 파일 찾기
    let answerPdfPath = null;
    
    // 1. examName.pdf로 직접 찾기
    const directPath = path.join(answersDir, `${examName}.pdf`);
    if (await fs.access(directPath).then(() => true).catch(() => false)) {
      answerPdfPath = directPath;
    } else {
      // 2. 디렉토리 내의 모든 PDF 파일 중에서 답안 관련 파일 찾기
      const pdfFiles = await glob(path.join(answersDir, "*.pdf"));
      for (const pdfFile of pdfFiles) {
        const fileName = path.basename(pdfFile, ".pdf").toLowerCase();
        if (fileName.includes("답안") || fileName.includes("answer") || 
            fileName.includes("정답") || fileName.includes("solution")) {
          answerPdfPath = pdfFile;
          break;
        }
      }
    }
    
    if (!answerPdfPath) {
      throw new Error(`답안 PDF 파일을 찾을 수 없습니다. examName: ${examName}, answersDir: ${answersDir}`);
    }
    
    const answerFileData = await fs.readFile(answerPdfPath);

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
