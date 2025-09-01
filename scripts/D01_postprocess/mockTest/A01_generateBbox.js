import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { glob } from "glob";
import cvReadyPromise from "@techstark/opencv-js";
import { Logger } from "#root/utils/logger.js";
import { findColumnAreas } from "../_utils/findColumnAreas.js";
import { getUnionBbox } from "../_utils/getUnionBbox.js";

import {
  adjustBboxesForPage,
  saveDebugImages,
} from "../_utils/visionBboxAdjuster.js";

// =================================================================================================
// Core Logic for processing a single exam
// =================================================================================================
async function processLlmResultFile(
  llmResultFile,
  { cv, mergedResultsDir, imagesDir, outputDir, isDebug }
) {
  const examName = path.basename(path.dirname(llmResultFile));
  Logger.section(`Processing exam: ${examName}`);

  const allBlocks = [];
  let pageWidth = 0;
  const mergedJsonDirPath = path.join(mergedResultsDir, examName);
  const mergedJsonFiles = (await fs.readdir(mergedJsonDirPath))
    .filter((f) => f.endsWith(".json"))
    .sort(
      (a, b) =>
        parseInt(a.match(/(\d+)/)[1], 10) -
        parseInt(b.match(/(\d+)/)[1], 10)
    );

  for (const jsonFile of mergedJsonFiles) {
    const pageNum = parseInt(jsonFile.match(/page.(\d+).json/)[1], 10);
    const pageBlocks = JSON.parse(
      await fs.readFile(path.join(mergedJsonDirPath, jsonFile), "utf-8")
    );
    if (pageWidth === 0) {
      try {
        const imagePath = path.join(
          imagesDir,
          examName,
          `page.${pageNum}.png`
        );
        const metadata = await sharp(imagePath).metadata();
        pageWidth = metadata.width;
      } catch {
        pageWidth = 4000;
      }
    }
    allBlocks.push(...pageBlocks.map((b) => ({ ...b, pageNum })));
  }

  const llmContent = await fs.readFile(llmResultFile, "utf-8");
  const llmData = JSON.parse(llmContent);
  const structure = llmData.structure || [];
  const usedBlockIds = new Set(structure.flatMap((group) => group.ids));
  const llmUsedBlocks = allBlocks.filter((_, index) =>
    usedBlockIds.has(index)
  );
  const columnAreas = findColumnAreas(llmUsedBlocks, pageWidth);
  Logger.debug(
    `Detected ${columnAreas.length} columns for exam ${examName}.`
  );

  const blockIdMap = new Map();
  allBlocks.forEach((block, index) => {
    const centerX = (block.bbox[0] + block.bbox[2]) / 2;
    let columnId = -1;
    for (let i = 0; i < columnAreas.length; i++) {
      if (centerX >= columnAreas[i].x1 && centerX <= columnAreas[i].x2) {
        columnId = i;
        break;
      }
    }
    if (columnId === -1) {
      let minDistance = Infinity;
      for (let i = 0; i < columnAreas.length; i++) {
        const colCenterX = (columnAreas[i].x1 + columnAreas[i].x2) / 2;
        const distance = Math.abs(centerX - colCenterX);
        if (distance < minDistance) {
          minDistance = distance;
          columnId = i;
        }
      }
    }
    blockIdMap.set(index, { ...block, columnId });
  });

  const structureBySubject = structure.reduce((acc, group) => {
    const subject = group.subject || "default";
    if (!acc[subject]) acc[subject] = [];
    acc[subject].push(group);
    return acc;
  }, {});

  for (const subjectName in structureBySubject) {
    Logger.section(`Processing subject: ${subjectName}`);
    const subjectStructure = structureBySubject[subjectName];

    const resultsByPage = {};
    for (const group of subjectStructure) {
      const { id, ids, type: rawType } = group;
      if (!ids || ids.length === 0) continue;
      const itemsByPageAndColumn = {};
      for (const blockId of ids) {
        const item = blockIdMap.get(blockId);
        if (!item) continue;
        const key = `${item.pageNum}_${item.columnId}`;
        if (!itemsByPageAndColumn[key]) itemsByPageAndColumn[key] = [];
        itemsByPageAndColumn[key].push(item);
      }
      for (const key in itemsByPageAndColumn) {
        const [pageNumStr, columnIdStr] = key.split("_");
        const pageNum = parseInt(pageNumStr, 10);
        const columnId = parseInt(columnIdStr, 10);
        const itemsInGroup = itemsByPageAndColumn[key];
        if (itemsInGroup.length === 0) continue;
        if (!resultsByPage[pageNum])
          resultsByPage[pageNum] = { questions: [], passages: [] };
        const bbox = getUnionBbox(itemsInGroup.map((item) => item.bbox));
        const columnArea = columnAreas[columnId];
        if (columnArea) {
          bbox[0] = columnArea.x1;
          bbox[2] = columnArea.x2;
        }
        const type = rawType === "problem" ? "question" : rawType;
        const resultItem = {
          id,
          bbox,
          itemIds: itemsInGroup.map((item) => allBlocks.indexOf(item)),
          ...(group.score !== undefined && { score: group.score }),
          ...(group.problemIds !== undefined && {
            problemIds: group.problemIds,
          }),
        };
        if (type === "question")
          resultsByPage[pageNum].questions.push(resultItem);
        else resultsByPage[pageNum].passages.push(resultItem);
      }
    }

    let footerThreshold = 0;
    for (const pageNumStr in resultsByPage) {
      const pageResult = resultsByPage[pageNumStr];
      const bboxes = [
        ...pageResult.questions.map((q) => q.bbox),
        ...pageResult.passages.map((p) => p.bbox),
      ];
      for (const bbox of bboxes) {
        if (bbox[3] > footerThreshold) footerThreshold = bbox[3];
      }
    }
    footerThreshold += 20;
    Logger.debug(
      `Calculated footer threshold for ${examName} - ${subjectName}: ${footerThreshold}`
    );

    const allAdjustedItems = [];
    for (const pageNumStr of Object.keys(resultsByPage)) {
      const pageNum = parseInt(pageNumStr, 10);
      const pageResult = resultsByPage[pageNumStr];
      const llmItemsOnPage = [
        ...pageResult.questions.map((q) => ({
          ...q,
          type: "question",
          pageNum,
        })),
        ...pageResult.passages.map((p) => ({
          ...p,
          type: "passage",
          pageNum,
        })),
      ];
      const imagePath = path.join(
        imagesDir,
        examName,
        `page.${pageNum}.png`
      );
      try {
        await fs.access(imagePath);
        const { adjustedLlmItems, reliableComponentsForDebug, cvMats } =
          await adjustBboxesForPage(
            cv,
            imagePath,
            llmItemsOnPage,
            footerThreshold
          );
        adjustedLlmItems.forEach((item) =>
          allAdjustedItems.push({ ...item, imagePath })
        );
        if (isDebug) {
          await saveDebugImages(
            cv,
            cvMats,
            outputDir,
            `${examName}/${subjectName}`,
            pageNum,
            imagePath,
            llmItemsOnPage,
            adjustedLlmItems,
            reliableComponentsForDebug
          );
        }
        Object.values(cvMats).forEach((mat) => mat.delete());
      } catch (e) {
        Logger.warn(
          `Error processing page ${pageNum} for ${examName} - ${subjectName}: ${e.message}`
        );
      }
    }

    if (allAdjustedItems.length > 0) {
      const subjectOutputDir = path.join(outputDir, examName, subjectName);
      await fs.mkdir(subjectOutputDir, { recursive: true });

      const finalBboxData = allAdjustedItems.map((item) => ({
        id: item.id,
        bbox: item.bbox,
        type: item.type,
        pageNum: item.pageNum,
        imagePath: item.imagePath,
        ...(item.score !== undefined && { score: item.score }),
        ...(item.problemIds !== undefined && {
          problemIds: item.problemIds,
        }),
      }));

      const finalResult = {
        info: {},
        bbox: finalBboxData,
      };

      const outputJsonPath = path.join(subjectOutputDir, "bbox.json");
      await fs.writeFile(
        outputJsonPath,
        JSON.stringify(finalResult, null, 2)
      );
      Logger.info(`Saved final bbox JSON to ${outputJsonPath}`);
    } else {
      Logger.warn(
        `No items were processed for ${examName} - ${subjectName}, skipping JSON output.`
      );
    }
  }
}

// =================================================================================================
// Main Execution
// =================================================================================================

async function main() {
  Logger.section("D01-mockTest-01 Generate Bbox Start");
  try {
    const cv = await cvReadyPromise;
    const args = process.argv.slice(2);
    const [llmAnalysisDir, mergedResultsDir, imagesDir, outputDir] = args;
    const isDebug = args.includes("--debug");

    await fs.mkdir(outputDir, { recursive: true });
    const llmResultFiles = await glob(
      path.join(llmAnalysisDir, "**/llmResult.json")
    );
    Logger.info(`Found ${llmResultFiles.length} llmResult.json files.`);

    const processingPromises = llmResultFiles.map((file) =>
      processLlmResultFile(file, {
        cv,
        mergedResultsDir,
        imagesDir,
        outputDir,
        isDebug,
      })
    );
    await Promise.all(processingPromises);
  } catch (error) {
    Logger.error(`An error occurred: ${error.stack}`);
  } finally {
    Logger.endSection("D01-mockTest-01 Generate Bbox Finished");
    Logger.close();
  }
}

main();