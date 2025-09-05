import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

import { Logger } from "#operation/utils/logger.js";

dotenv.config();

const LLM_RETRY_COUNT = 3;
const LLM_RETRY_DELAY = 1000;

const GEMINI_API_KEY = process.env.GOOGLE_API_KEY;
const genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

export async function runGemini(
  /** @type {import("@google/genai").GenerateContentParameters} */ generateContentParameters,
  isDebug = false,
  config = {}
) {
  const { LogMessage } = config;
  if (isDebug) Logger.section("LLM 요청 수행...");

  if (isDebug) {
    try {
      const promptTokenCount = await genAI.models.countTokens({
        model: generateContentParameters.model,
        contents: generateContentParameters.contents,
      });
      Logger.debug(`* 모델: ${generateContentParameters.model}`);
      Logger.debug(`* 프롬프트 토큰 수: ${promptTokenCount.totalTokens}`);
    } catch (error) {
      Logger.warn(`[${LogMessage}] 토큰 사용량 조회 실패:\n ${error.message}`);
    }
  }

  let totalTime = 0;
  let LLMResponse = null;
  let response = null;

  for (let i = 1; i <= LLM_RETRY_COUNT; i++) {
    const startTime = Date.now();

    try {
      LLMResponse = await genAI.models.generateContent(
        generateContentParameters
      );

      if (isDebug) {
        Logger.info(`[${i}/${LLM_RETRY_COUNT}] LLM 요청 성공 `);
      }
      totalTime += Date.now() - startTime;
      const responseText = LLMResponse?.candidates[0]?.content?.parts[0]?.text;
      response = parseLlmJsonResponse(responseText);
      break;
    } catch (error) {
      Logger.warn(
        `[${i}/${LLM_RETRY_COUNT}]${
          LogMessage ? `[${LogMessage}]` : ""
        } LLM 요청 실패:\n ${error.message}`
      );

      if (i === LLM_RETRY_COUNT) throw error;

      await new Promise((resolve) => setTimeout(resolve, LLM_RETRY_DELAY));
    }
  }

  if (isDebug) {
    Logger.section(`Summary`, "debug");
    Logger.debug(`* 응답 시간: ${Math.floor(totalTime / 1000)}s`);
    Logger.debug("* 토큰 사용량");

    for (const item of LLMResponse.usageMetadata?.promptTokensDetails) {
      Logger.debug(`    입력 토큰: ${item.tokenCount} (${item.modality})`);
    }

    Logger.debug(
      `    출력 토큰: ${LLMResponse.usageMetadata?.candidatesTokenCount}`
    );
    Logger.debug(
      `      총 토큰: ${LLMResponse.usageMetadata?.totalTokenCount}`
    );

    Logger.endSection();
    Logger.endSection();
  }

  return {
    response: response,
    tokenUsage: LLMResponse.usageMetadata?.totalTokenCount,
    timeUsage: totalTime,
  };
}

/**
 * Extracts and parses a JSON string from an LLM response that might be wrapped in markdown.
 * @param {string} rawResponse - The raw text response from the LLM.
 * @returns {Object} The parsed JSON object.
 * @throws {SyntaxError} If JSON parsing fails after cleanup.
 */
function parseLlmJsonResponse(rawResponse) {
  const jsonMatch = rawResponse.match(/```(json)?\s*([\s\S]*?)\s*```/);
  const jsonString = jsonMatch ? jsonMatch[2].trim() : rawResponse.trim();

  return JSON.parse(jsonString);
}
