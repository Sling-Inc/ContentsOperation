import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import os from "os";
import { fileURLToPath } from "url";
import { Logger } from "#root/utils/logger.js";
import { runGemini } from "#root/utils/gemini.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONCURRENCY_LIMIT = os.cpus().length;

async function analyzeExamSet(
  mergedJsonDir,
  highResImageDir,
  outputDir,
  isDebug,
  config
) {
  Logger.log(`Analyzing exam set: ${path.basename(mergedJsonDir)}`);

  const { LLM_MODEL, LLM_PROMPT, LLM_CONFIG } = config;

  // 1. 데이터 취합 및 정렬
  const jsonFiles = (await fs.readdir(mergedJsonDir)).filter((f) =>
    f.endsWith(".json")
  );
  jsonFiles.sort((a, b) => {
    const numA = parseInt(a.match(/page\.(\d+)\.json/)[1], 10);
    const numB = parseInt(b.match(/page\.(\d+)\.json/)[1], 10);
    return numA - numB;
  });

  if (jsonFiles.length === 0) {
    Logger.warn("No JSON files found in this directory, skipping.");
    return;
  }

  // 2. 데이터 가공 (id, page 추가)
  let blockIdCounter = 0;
  const allBlocks = [];
  for (const jsonFile of jsonFiles) {
    const pageNum = parseInt(jsonFile.match(/page\.(\d+)\.json/)[1], 10);
    const pageBlocks = JSON.parse(
      await fs.readFile(path.join(mergedJsonDir, jsonFile), "utf-8")
    );

    for (const block of pageBlocks) {
      allBlocks.push({
        id: blockIdCounter++,
        page: pageNum,
        position: block.bbox, // [x1, y1, x2, y2]
        text: block.text,
      });
    }
  }
  Logger.info(
    `Total ${allBlocks.length} blocks from ${jsonFiles.length} pages prepared for LLM.`
  );

  // 3. LLM 호출
  const result = await runGemini(
    {
      model: LLM_MODEL,
      config: LLM_CONFIG,
      contents: [
        {
          role: "user",
          parts: [
            { text: LLM_PROMPT },
            { text: JSON.stringify(allBlocks, null, 2) },
          ],
        },
      ],
    },
    isDebug
  );

  // 4. 결과 저장
  const llmResultPath = path.join(outputDir, "llmResult.json");
  await fs.mkdir(outputDir, { recursive: true });

  try {
    const llmResult = result.response; // Full response object
    const structure = llmResult.structure || []; // Use structure array, fallback to empty array

    await fs.writeFile(llmResultPath, JSON.stringify(llmResult, null, 2));
    Logger.notice(`LLM analysis result saved to: ${llmResultPath}`);

    // 5. (디버그 모드) 시각화
    if (isDebug) {
      Logger.log("Visualizing LLM results...");

      const COLORS = [
        "#FF0000",
        "#00FF00",
        "#0000FF",
        "#FFFF00",
        "#FF00FF",
        "#00FFFF",
        "#800000",
        "#008000",
        "#000080",
      ];

      const blocksByPage = allBlocks.reduce((acc, block) => {
        if (!acc[block.page]) acc[block.page] = [];
        acc[block.page].push(block);
        return acc;
      }, {});

      for (const pageNum in blocksByPage) {
        const imagePath = path.join(highResImageDir, `page.${pageNum}.png`);
        const outputPath = path.join(outputDir, `page.${pageNum}.png`);
        Logger.info(`Visualizing page ${pageNum}...`);

        const image = sharp(imagePath);
        const metadata = await image.metadata();
        const svgElements = [];

        structure.forEach((item, index) => {
          const color = COLORS[index % COLORS.length];
          for (const blockId of item.ids) {
            const block = allBlocks.find(
              (b) => b.id === blockId && b.page == pageNum
            );
            if (!block) continue;

            const [x1, y1, x2, y2] = block.position;
            const width = x2 - x1;
            const height = y2 - y1;
            svgElements.push(
              `<rect x="${x1}" y="${y1}" width="${width}" height="${height}" style="fill:${color}40; stroke:${color}; stroke-width:3" />`
            );
          }
        });

        const svgOverlay = `<svg width="${metadata.width}" height="${
          metadata.height
        }">${svgElements.join("")}</svg>`;
        await image
          .composite([{ input: Buffer.from(svgOverlay) }])
          .toFile(outputPath);
      }
      Logger.info(`Visualization saved in: ${outputDir}`);
      Logger.endSection();
    }
  } catch (error) {
    Logger.error(
      "Failed to process LLM response. Saving raw text for inspection."
    );
    const rawResponse =
      typeof result.response === "string"
        ? result.response
        : JSON.stringify(result.response);
    await fs.writeFile(
      path.join(outputDir, "llmResult_error.txt"),
      rawResponse
    );
    console.error(error);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const examTypeIndex = args.findIndex((arg) => arg === "--examType");
  let examType = "default";
  if (examTypeIndex !== -1 && args[examTypeIndex + 1]) {
    examType = args[examTypeIndex + 1];
    args.splice(examTypeIndex, 2);
  }

  const isDebug = args.includes("--debug");
  if (isDebug) {
    const debugIndex = args.indexOf("--debug");
    args.splice(debugIndex, 1);
  }

  if (args.length < 3) {
    console.error(
      "Usage: node scripts/C02_llmClassification <mergedJsonBaseDir> <highResImageBaseDir> <outputBaseDir> [--debug] [--examType <type>]"
    );
    process.exit(1);
  }
  const [mergedJsonBaseDir, highResImageBaseDir, outputBaseDir] = args;

  // Dynamically import config based on examType
  let config;
  if (examType === "mockTest") {
    config = await import("./config_mockTest.js");
  } else if (examType === "CSE") {
    config = await import("./config_CSE.js");
  } else if (examType === "naesin") {
    config = await import("./config_naesin.js");
  } else {
    config = await import("./config.js");
  }

  const rootDir = path.resolve(__dirname, "..", "..");
  const absMergedJsonBaseDir = path.resolve(rootDir, mergedJsonBaseDir);
  const absHighResImageBaseDir = path.resolve(rootDir, highResImageBaseDir);
  const absOutputBaseDir = path.resolve(rootDir, outputBaseDir);

  Logger.section(
    `Starting LLM analysis for all exams in: ${absMergedJsonBaseDir}`
  );
  Logger.info(`Concurrency limit set to: ${CONCURRENCY_LIMIT}`);
  if (isDebug)
    Logger.info("Debug mode enabled: Visualization images will be generated.");
  Logger.info(`Using exam type: ${examType}`);

  try {
    const subDirs = (
      await fs.readdir(absMergedJsonBaseDir, { withFileTypes: true })
    )
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name);

    const taskQueue = [...subDirs];

    const worker = async (workerId) => {
      while (taskQueue.length > 0) {
        const examName = taskQueue.shift();
        if (!examName) continue;

        Logger.info(`[Worker ${workerId}] Picked up exam: ${examName}`);
        const mergedJsonDir = path.join(absMergedJsonBaseDir, examName);
        const highResImageDir = path.join(absHighResImageBaseDir, examName);
        const outputDir = path.join(absOutputBaseDir, examName);

        try {
          await analyzeExamSet(
            mergedJsonDir,
            highResImageDir,
            outputDir,
            isDebug,
            config
          );
        } catch (workerError) {
          Logger.error(
            `[Worker ${workerId}] Failed to process ${examName}: ${workerError.message}`
          );
        }
      }
    };

    const workerPromises = [];
    for (let i = 1; i <= CONCURRENCY_LIMIT && i <= subDirs.length; i++) {
      workerPromises.push(worker(i));
    }
    await Promise.all(workerPromises);
  } catch (error) {
    Logger.error(`An error occurred during batch processing: ${error.message}`);
    Logger.debug(error.stack);
  } finally {
    Logger.endSection("Finished all LLM analysis.");
    Logger.close();
  }
}

main();
