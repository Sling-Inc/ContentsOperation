import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { glob } from "glob";
import cvReadyPromise from "@techstark/opencv-js";
import { Logger } from "#root/utils/logger.js";

// =================================================================================================
// Helper Functions
// =================================================================================================

function findColumnAreas(blocks, pageWidth) {
  if (blocks.length < 5) return [{ x1: 0, x2: pageWidth }];
  let columnAreas = [];
  for (const block of blocks) {
    const [blockX1, , blockX2] = block.bbox;
    const overlappingIndices = [];
    for (let i = 0; i < columnAreas.length; i++) {
      if (Math.max(blockX1, columnAreas[i].x1) < Math.min(blockX2, columnAreas[i].x2)) {
        overlappingIndices.push(i);
      }
    }
    if (overlappingIndices.length === 0) {
      columnAreas.push({ x1: blockX1, x2: blockX2 });
    } else {
      let mergedX1 = blockX1;
      let mergedX2 = blockX2;
      for (const index of overlappingIndices) {
        mergedX1 = Math.min(mergedX1, columnAreas[index].x1);
        mergedX2 = Math.max(mergedX2, columnAreas[index].x2);
      }
      for (let i = overlappingIndices.length - 1; i >= 0; i--) {
        columnAreas.splice(overlappingIndices[i], 1);
      }
      columnAreas.push({ x1: mergedX1, x2: mergedX2 });
    }
  }
  return columnAreas.sort((a, b) => a.x1 - b.x1);
}

function getUnionBbox(bboxes) {
  if (!bboxes || bboxes.length === 0) return [0, 0, 0, 0];
  const x1 = Math.min(...bboxes.map((b) => b[0]));
  const y1 = Math.min(...bboxes.map((b) => b[1]));
  const x2 = Math.max(...bboxes.map((b) => b[2]));
  const y2 = Math.max(...bboxes.map((b) => b[3]));
  return [x1, y1, x2, y2];
}

function calculateOverlapRatio(candidateBox, llmBox) {
  const [x1A, y1A, x2A, y2A] = candidateBox;
  const [x1B, y1B, x2B, y2B] = llmBox;
  const xA = Math.max(x1A, x1B);
  const yA = Math.max(y1A, y1B);
  const xB = Math.min(x2A, x2B);
  const yB = Math.min(y2A, y2B);
  const intersectionArea = Math.max(0, xB - xA) * Math.max(0, yB - yA);
  const boxAArea = (x2A - x1A) * (y2A - y1A);
  return boxAArea === 0 ? 0 : intersectionArea / boxAArea;
}

function boxesOverlap(boxA, boxB) {
  const [x1A, y1A, x2A, y2A] = boxA;
  const [x1B, y1B, x2B, y2B] = boxB;
  if (x2A < x1B || x2B < x1A) return false;
  if (y2A < y1B || y2B < y1A) return false;
  return true;
}

async function visualizeBboxes(imagePath, items) {
  const image = sharp(imagePath);
  const { width, height } = await image.metadata();
  const colors = { question: "rgba(255, 0, 0, 0.5)", passage: "rgba(0, 0, 255, 0.5)" };
  const svgElements = items.map((item) => {
      const [x1, y1, x2, y2] = item.bbox;
      const color = colors[item.type] || "rgba(0, 255, 0, 0.5)";
      return `<rect x="${x1}" y="${y1}" width="${x2 - x1}" height="${y2 - y1}" style="fill:${color};stroke:black;stroke-width:2;" /><text x="${x1 + 5}" y="${y1 + 20}" font-family="Arial" font-size="16" fill="white">${item.id}</text>`;
    }).join("");
  const svgOverlay = `<svg width="${width}" height="${height}">${svgElements}</svg>`;
  return image.composite([{ input: Buffer.from(svgOverlay) }]).png().toBuffer();
}

// =================================================================================================
// Core Logic
// =================================================================================================

async function adjustBboxesForPage(cv, imagePath, llmItemsOnPage, footerThreshold) {
  const { data, info } = await sharp(imagePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const src = new cv.Mat(info.height, info.width, cv.CV_8UC4);
  src.data.set(data);
  const gray = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  const binary = new cv.Mat();
  cv.threshold(gray, binary, 0, 255, cv.THRESH_OTSU | cv.THRESH_BINARY_INV);

  if (footerThreshold > 0 && footerThreshold < info.height) {
    cv.rectangle(binary, new cv.Point(0, footerThreshold), new cv.Point(info.width, info.height), new cv.Scalar(0), -1);
  }

  const labels = new cv.Mat();
  const stats = new cv.Mat();
  const centroids = new cv.Mat();
  const nLabels = cv.connectedComponentsWithStats(binary, labels, stats, centroids, 8, cv.CV_32S);

  const reliableComponents = [];
  for (let i = 1; i < nLabels; i++) {
    const w = stats.intPtr(i)[2];
    const h = stats.intPtr(i)[3];
    if (w < info.width / 5 && h < info.height / 5) continue;
    const x = stats.intPtr(i)[0];
    const y = stats.intPtr(i)[1];
    reliableComponents.push([x, y, x + w, y + h]);
  }

  const potentialAdjustments = llmItemsOnPage.map(llmItem => {
    const overlappingComponents = reliableComponents.filter(compBox => calculateOverlapRatio(compBox, llmItem.bbox) > 0.7 && calculateOverlapRatio(compBox, llmItem.bbox) < 1);
    const potentialBbox = overlappingComponents.length > 0 ? getUnionBbox([llmItem.bbox, ...overlappingComponents]) : llmItem.bbox;
    return { ...llmItem, potentialBbox, originalBbox: llmItem.bbox, overlappingComponents };
  });

  const adjustedLlmItems = [];
  const reliableComponentsForDebug = [];
  for (let i = 0; i < potentialAdjustments.length; i++) {
    const currentItem = potentialAdjustments[i];
    let collision = false;
    if (currentItem.overlappingComponents.length > 0) {
      for (let j = 0; j < potentialAdjustments.length; j++) {
        if (i === j) continue;
        if (boxesOverlap(currentItem.potentialBbox, potentialAdjustments[j].potentialBbox)) {
          collision = true;
          break;
        }
      }
    }
    if (!collision && currentItem.overlappingComponents.length > 0) {
      adjustedLlmItems.push({ ...currentItem, bbox: currentItem.potentialBbox });
      reliableComponentsForDebug.push(...currentItem.overlappingComponents);
    } else {
      adjustedLlmItems.push({ ...currentItem, bbox: currentItem.originalBbox });
    }
  }

  const cvMats = { src, gray, binary, labels, stats, centroids };
  return { adjustedLlmItems, reliableComponentsForDebug, cvMats };
}

async function saveDebugImages(cv, cvMats, outputDir, examName, pageNum, imagePath, llmItemsOnPage, adjustedLlmItems, reliableComponentsForDebug) {
  const debugOutputDir = path.join(outputDir, examName, "debug");
  await fs.mkdir(debugOutputDir, { recursive: true });

  const beforeImageBuffer = await visualizeBboxes(imagePath, llmItemsOnPage);
  const beforeImagePath = path.join(debugOutputDir, `page.${pageNum}_before.png`);
  await fs.writeFile(beforeImagePath, beforeImageBuffer);
  Logger.debug(`Saved 'before' visualization to ${beforeImagePath}`);

  const afterImageBuffer = await visualizeBboxes(imagePath, adjustedLlmItems);
  const afterImagePath = path.join(debugOutputDir, `page.${pageNum}_after.png`);
  await fs.writeFile(afterImagePath, afterImageBuffer);
  Logger.debug(`Saved 'after' visualization to ${afterImagePath}`);

  const reliableCompImage = new cv.Mat(cvMats.binary.rows, cvMats.binary.cols, cv.CV_8UC1, new cv.Scalar(0));
  for (const box of reliableComponentsForDebug) {
    cv.rectangle(reliableCompImage, new cv.Point(box[0], box[1]), new cv.Point(box[2], box[3]), new cv.Scalar(255), 2);
  }
  const reliableCompPath = path.join(debugOutputDir, `page.${pageNum}_reliable_components.png`);
  await sharp(Buffer.from(reliableCompImage.data), { raw: { width: reliableCompImage.cols, height: reliableCompImage.rows, channels: 1 } }).png().toFile(reliableCompPath);
  Logger.debug(`Saved reliable components to ${reliableCompPath}`);
  reliableCompImage.delete();
}

async function main() {
  Logger.section("D01-mockTest-01 Generate Bbox Start");
  try {
    const cv = await cvReadyPromise;
    const args = process.argv.slice(2);
    const [llmAnalysisDir, mergedResultsDir, imagesDir, outputDir] = args;
    const isDebug = args.includes("--debug");

    await fs.mkdir(outputDir, { recursive: true });
    const llmResultFiles = await glob(path.join(llmAnalysisDir, "**/llmResult.json"));
    Logger.info(`Found ${llmResultFiles.length} llmResult.json files.`);

    for (const llmResultFile of llmResultFiles) {
      const examName = path.basename(path.dirname(llmResultFile));
      Logger.section(`Processing exam: ${examName}`);

      const allBlocks = [];
      let pageWidth = 0;
      const mergedJsonDirPath = path.join(mergedResultsDir, examName);
      const mergedJsonFiles = (await fs.readdir(mergedJsonDirPath)).filter((f) => f.endsWith(".json")).sort((a, b) => parseInt(a.match(/(\d+)/)[1], 10) - parseInt(b.match(/(\d+)/)[1], 10));
      
      for (const jsonFile of mergedJsonFiles) {
        const pageNum = parseInt(jsonFile.match(/page.(\d+).json/)[1], 10);
        const pageBlocks = JSON.parse(await fs.readFile(path.join(mergedJsonDirPath, jsonFile), "utf-8"));
        if (pageWidth === 0) {
            try {
                const imagePath = path.join(imagesDir, examName, `page.${pageNum}.png`);
                const metadata = await sharp(imagePath).metadata();
                pageWidth = metadata.width;
            } catch { pageWidth = 4000; }
        }
        allBlocks.push(...pageBlocks.map(b => ({...b, pageNum})))
      }

      const llmContent = await fs.readFile(llmResultFile, "utf-8");
      const llmData = JSON.parse(llmContent);
      const structure = llmData.structure || [];
      const usedBlockIds = new Set(structure.flatMap((group) => group.ids));
      const llmUsedBlocks = allBlocks.filter((_, index) => usedBlockIds.has(index));
      const columnAreas = findColumnAreas(llmUsedBlocks, pageWidth);
      Logger.debug(`Detected ${columnAreas.length} columns for exam ${examName}.`);

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

      const resultsByPage = {};
      for (const group of structure) {
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
          if (!resultsByPage[pageNum]) resultsByPage[pageNum] = { questions: [], passages: [] };
          const bbox = getUnionBbox(itemsInGroup.map(item => item.bbox));
          const columnArea = columnAreas[columnId];
          if (columnArea) {
            bbox[0] = columnArea.x1;
            bbox[2] = columnArea.x2;
          }
          const type = rawType === "problem" ? "question" : rawType;
          const resultItem = { id, bbox, itemIds: itemsInGroup.map(item => allBlocks.indexOf(item)) };
          if (type === "question") resultsByPage[pageNum].questions.push(resultItem);
          else resultsByPage[pageNum].passages.push(resultItem);
        }
      }

      let footerThreshold = 0;
      for (const pageNumStr in resultsByPage) {
        const pageResult = resultsByPage[pageNumStr];
        const bboxes = [...pageResult.questions.map(q => q.bbox), ...pageResult.passages.map(p => p.bbox)];
        for (const bbox of bboxes) {
          if (bbox[3] > footerThreshold) footerThreshold = bbox[3];
        }
      }
      footerThreshold += 20;
      Logger.debug(`Calculated footer threshold for ${examName}: ${footerThreshold}`);

      const allAdjustedItems = [];
      for (const pageNumStr of Object.keys(resultsByPage)) {
        const pageNum = parseInt(pageNumStr, 10);
        const pageResult = resultsByPage[pageNum];
        const llmItemsOnPage = [
          ...pageResult.questions.map((q) => ({ ...q, type: "question", pageNum })),
          ...pageResult.passages.map((p) => ({ ...p, type: "passage", pageNum })),
        ];
        const imagePath = path.join(imagesDir, examName, `page.${pageNum}.png`);
        try {
          await fs.access(imagePath);
          const { adjustedLlmItems, reliableComponentsForDebug, cvMats } = await adjustBboxesForPage(cv, imagePath, llmItemsOnPage, footerThreshold);
          adjustedLlmItems.forEach(item => allAdjustedItems.push({ ...item, imagePath }));
          if (isDebug) {
            await saveDebugImages(cv, cvMats, outputDir, examName, pageNum, imagePath, llmItemsOnPage, adjustedLlmItems, reliableComponentsForDebug);
          }
          Object.values(cvMats).forEach(mat => mat.delete());
        } catch (e) {
          Logger.warn(`Error processing page ${pageNum} for ${examName}: ${e.message}`);
        }
      }

      if (allAdjustedItems.length > 0) {
        const examOutputDir = path.join(outputDir, examName);
        await fs.mkdir(examOutputDir, { recursive: true });

        const finalBboxData = allAdjustedItems.map(item => ({
          id: item.id,
          bbox: item.bbox,
          type: item.type,
          pageNum: item.pageNum,
          imagePath: item.imagePath,
        }));

        const finalResult = {
          info: {},
          bbox: finalBboxData,
        };

        const outputJsonPath = path.join(examOutputDir, 'bbox.json');
        await fs.writeFile(outputJsonPath, JSON.stringify(finalResult, null, 2));
        Logger.info(`Saved final bbox JSON to ${outputJsonPath}`);
      } else {
         Logger.warn(`No items were processed for ${examName}, skipping JSON output.`);
      }
    }
  } catch (error) {
    Logger.error(`An error occurred: ${error.stack}`);
  } finally {
    Logger.endSection("D01-mockTest-01 Generate Bbox Finished");
    Logger.close();
  }
}

main();
