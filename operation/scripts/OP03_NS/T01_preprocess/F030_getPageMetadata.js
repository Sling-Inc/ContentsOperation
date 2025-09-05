import fs from "fs/promises";
import path from "path";
import pLimit from "p-limit";
import { PDFDocument } from "pdf-lib";

import {
  existsFile,
  readDirectories,
  readFilesWithExtR,
} from "#operation/utils/file.js";
import { runGemini } from "#operation/utils/gemini.js";

import { STANDARD } from "./standardName.js";

import { Logger } from "#operation/utils/logger.js";

const limit = pLimit(10);

const LLM_MODEL = "gemini-2.5-flash";
const PROMPT = `
# Role
  당신은 대한민국 교육 전문가이자, 시험지를 분석하는 AI입니다.
  
# Task
  당신에게 학교 이름과 시험 자료 파일 경로와 pdf 파일이 주어집니다.
  주어진 경로와 pdf 파일을 확인하고, pdf 파일의 각 페이지 별 정보를 추출하여야 합니다.
  
# 주의사항
  - pdf에 정보가 없는 경우, 파일 경로의 데이터를 사용하세요.
  - 모든 페이지에 대해 확인하고, 반드시 pdf의 페이지 수와 같은 결과를 반환하세요. 
  - subject 등 페이지에 관한 정보는 연속적일 확률이 매우 높습니다.
  - 판단이 불가능한 경우 pageType을 unknown으로 설정해야 합니다.
    - 식별이 되지 않는 경우라도 결과를 반환하지 않으면 절대 안됩니다.

# 학교 이름
 {{schoolName}}

# 파일 경로
  {{pdfPath}}
`;

const config = {
  responseMimeType: "application/json",
  responseSchema: {
    type: "object",
    required: ["pages"],
    properties: {
      pages: {
        type: "array",
        items: {
          type: "object",
          properties: {
            pageNumber: {
              description: `
페이지의 번호
* pdf 전체 파일의 페이지 번호, 1부터 시작합니다.
* 페이지 내 아래 영역의 페이지 번호 등을 절대 사용하지 마세요. 오직 실제 파일의 몇번째 페이지인지만 반환하세요.`,
              type: "integer",
              nullable: false,
            },

            pageType: {
              description: `
페이지의 타입
* 시험지의 경우 problem 
* 답안지의 경우 answer 
** 답안지란, 문제번호 정보와 정답이 주어진 페이지를 의미합니다.
** 파일 이름이 문항정보표의 경우, answer일 경우가 매우 높습니다.
* 문제 내용은 하나도 없고, 정답이 주어지지 않았으며, 오직 학생이 시험 중 서술형 답안을 쓰는 페이지의 경우 answerSheet
* 시험지와 답안지가 함께 있는 경우 problemAnswer 
* 백지 등 판단이 안되는 경우 unknown`,
              type: "string",
              nullable: false,
              format: "enum",
              enum: [
                "problem",
                "answer",
                "answerSheet",
                "problemAnswer",
                "unknown",
              ],
            },

            reason: {
              description: `
페이지 pageType의 unknown 타입 결정 이유
* 페이지의 pageType을 unknown으로 결정한 이유를 반환합니다.
* 나머지 pageType일 경우 비워두세요.`,
              type: "string",
            },

            year: {
              description: `
페이지의 년도
* 2020, 2021, 2022, 2023, 2024, 2025 중 하나
* 판단이 불가능한 경우 unknown`,
              type: "string",
              nullable: false,
              format: "enum",
              enum: ["2020", "2021", "2022", "2023", "2024", "2025", "unknown"],
            },

            term: {
              description: `
페이지의 학기
* 1학기 중간고사는 0 
* 1학기 기말고사는 1 
* 2학기 중간고사는 2 
* 2학기 기말고사는 3
* 판단이 불가능한 경우 unknown`,
              type: "string",
              nullable: false,
              format: "enum",
              enum: ["0", "1", "2", "3", "unknown"],
            },

            grade: {
              description: `
페이지의 학년
* 중학교, 고등학교 모두 1,2,3 중 하나입니다.
* 판단이 불가능한 경우 unknown`,
              type: "string",
              nullable: false,
              format: "enum",
              enum: ["1", "2", "3", "unknown"],
            },

            subject: {
              description: `
페이지의 주제
* 정보, 일본어 등 시험이 치뤄 진 실제 subject를 명입니다.
** 절대 지문이나 문제의 내용으로 subject를 판단하지 마세요. subject는 오직 페이지의 헤더 등 시험지/답안지에서 문제/지문 외 별도로 제공되는 추가 데이터에서만 식별 가능합니다.
** pageType이 answer일 경우, 한 페이지에 여러 시험의 정답이 있는 경우만 해당 시험의 subject를 정보를 전부 반환해야 합니다.
*** 파일 이름(경로가 아닙니다)에 시험의 subject이 여러개 또는 subject를 정보가 없는 파일만 이럴 경우가 있습니다.
** pageType이 answer가 아닐 경우 반드시 1개의 subject를만 있어야 합니다.
subject를 중복으로 식별하지 마세요.
* 괄호 - 숫자는 무시하세요. ex) 생명과학I(3) 에서 (3)은 무시하세요.
* subject에 I, Ⅱ 등의 숫자 문자 또는 숫자가 있는 경우는 1, 2 숫자로 바꾸어야 합니다, 
  * ex) 수학Ⅱ -> 수학2, 물리I -> 물리1
* enum 내 값으로 판단이 가능한 경우는 unknown으로 설정하세요.
다음은 자주 실수가 발생하는 경우입니다. 잘 확인하세요.
* 생활로 시작한다고 생활과 과학으로 판단해서는 안 됩니다.
* 국어 시험이지만, 지문의 내용이 과학 관련 이야기라고 과학으로 절대 식별하지 마세요.
* 정답지가 아닌 시험지는 무조건 하나의 subject에만 매칭됩니다 절대 두개 이상의 subject에 매칭되지 않습니다.
* 영어Ⅱ 시험지는 subject가 "영어"입니다.

다음은 주제와 동의어 사전 정보입니다. (subject - 동의어 list로 되어 있으며, 만약 subject명이 동의어 중 하나라면 그 subject key 를 사용하세요.)
* 동의어 사전 등으로도 subject를 정확히 알 수 없다면 unknown으로 설정하세요.
${JSON.stringify(
  Object.fromEntries(
    Object.entries(STANDARD).map(([key, value]) => [key, value.synonym])
  ),
  null,
  2
)}`,
              type: "array",
              items: {
                type: "string",
                nullable: false,
                format: "enum",
                enum: [...Object.keys(STANDARD), "unknown"],
              },
            },
          },
        },
      },
    },
  },
  temperature: 0,
};

/**
 * 페이지 메타데이터를 가져오는 스크립트
 */
export async function F030_getPageMetadata(TARGET_DIR) {
  Logger.section("F030_getPageMetadata 실행");

  const schoolPaths = await readDirectories(TARGET_DIR, { fullPath: true });

  for (const schoolPath of schoolPaths) {
    const school = path.basename(schoolPath).normalize("NFC");

    const pdfFilePaths = await readFilesWithExtR(schoolPath, {
      extensions: [".pdf", ".PDF"],
      fullPath: false,
    });

    const resultPath = path.join(schoolPath, "__pdfMetadata.json");

    Logger.section(
      `[${school}] 페이지 메타데이터 추출 시작, pdf 파일 ${pdfFilePaths.length}개`
    );

    const tasks = [];
    const results = [];

    Logger.startProgress(`[ ${school}] ... (0/${pdfFilePaths.length})]`);
    for (const pdfFilePath of pdfFilePaths) {
      tasks.push(
        limit(async () => {
          const fullPdfPath = path.join(schoolPath, pdfFilePath);
          const pdfFileData = await fs.readFile(fullPdfPath);

          try {
            await PDFDocument.load(pdfFileData);
          } catch (error) {
            Logger.warn(
              `[${school}] PDF 파일(${pdfFilePath})을 열 수 없어 건너뜁니다. 파일이 손상되었거나 암호화되었을 수 있습니다.`
            );
            return; // 유효하지 않은 파일은 건너뜁니다.
          }

          const result = await runGemini(
            {
              model: LLM_MODEL,
              config: config,
              contents: [
                {
                  role: "user",
                  parts: [
                    {
                      text: PROMPT.replace("{{schoolName}}", school).replace(
                        "{{pdfPath}}",
                        pdfFilePath
                      ),
                    },

                    {
                      inlineData: {
                        mimeType: "application/pdf",
                        data: Buffer.from(pdfFileData).toString("base64"),
                      },
                    },
                  ],
                },
              ],
            },
            false,
            { LogMessage: pdfFilePath }
          );

          results.push({
            filePath: pdfFilePath,
            result: result.response,
          });
          Logger.updateProgress(
            `[ ${school}] ... (${results.length}/${pdfFilePaths.length})]`
          );
        })
      );
    }

    await Promise.all(tasks);
    Logger.endProgress();

    fs.writeFile(
      path.join(schoolPath, "__pdfMetadata.json"),
      JSON.stringify(results, null, 2)
    );

    Logger.debug(
      `[${school}] 페이지 메타데이터 추출 완료, 파일 경로 ${resultPath}`
    );
    Logger.endSection();
  }

  Logger.endSection();
}
