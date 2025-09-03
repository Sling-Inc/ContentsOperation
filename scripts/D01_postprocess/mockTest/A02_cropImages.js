import fs from "fs/promises";
import path from "path";
import os from "os";
import sharp from "sharp";
import { glob } from "glob";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { Logger } from "#root/utils/logger.js";

const CONCURRENCY_LIMIT = os.cpus().length;

const CONFIG = {
  IMAGE_RESIZE_WIDTH: 1720,
  PADDING: {
    TOP: 140,
    HORIZONTAL: 140,
    BOTTOM_MATH: 3000,
    BOTTOM_DEFAULT: 2000,
    BOTTOM_PASSAGE: 1000,
  },
  MAX_HEIGHT: {
    MATH: 5000,
    DEFAULT: 4000,
    PASSAGE: 2000,
  },
  NUMBER_SEARCH_AREA: {
    TOP: 100, // px from top of cropped bbox
    LEFT: 280, // px from left of cropped bbox
  },
};

function getVerticesBox(vertices) {
  const xCoords = vertices.map((v) => v.x);
  const yCoords = vertices.map((v) => v.y);
  return [
    Math.min(...xCoords),
    Math.min(...yCoords),
    Math.max(...xCoords),
    Math.max(...yCoords),
  ];
}

function isSymbolInBbox(symbol, bbox) {
  const [bx1, by1, bx2, by2] = bbox;
  const [sx1, sy1, sx2, sy2] = getVerticesBox(symbol.boundingBox.vertices);
  return sx1 < bx2 && sx2 > bx1 && sy1 < by2 && sy2 > by1;
}

async function eraseItemNumber(
  cropBuffer,
  item,
  ocrDataForPage,
  { isFirstItem, uniqueId, examName, subjectName }
) {
  if (!ocrDataForPage?.fullTextAnnotation) {
    return cropBuffer;
  }

  const allSymbolsOnPage =
    ocrDataForPage.fullTextAnnotation.pages[0].blocks
      .flatMap((b) => b.paragraphs)
      .flatMap((p) => p.words)
      .flatMap((w) => w.symbols) || [];

  const symbolsInBbox = allSymbolsOnPage
    .filter((s) => isSymbolInBbox(s, item.bbox))
    .sort((a, b) => {
      const [ax1] = getVerticesBox(a.boundingBox.vertices);
      const [bx1] = getVerticesBox(b.boundingBox.vertices);
      if (Math.abs(ax1 - bx1) > 5) return ax1 - bx1;
      const [, ay1] = getVerticesBox(a.boundingBox.vertices);
      const [, by1] = getVerticesBox(b.boundingBox.vertices);
      return ay1 - by1;
    });

  const targetIdStr = String(item.id);
  let matchedSymbols = [];

  const topLeftAreaSymbols = symbolsInBbox.filter((s) => {
    const [symbolX1, symbolY1] = getVerticesBox(s.boundingBox.vertices);
    const isWithinTop = symbolY1 - item.bbox[1] < CONFIG.NUMBER_SEARCH_AREA.TOP;
    const isWithinLeft =
      symbolX1 - item.bbox[0] < CONFIG.NUMBER_SEARCH_AREA.LEFT;
    return isWithinTop && isWithinLeft;
  });

  for (let i = 0; i < topLeftAreaSymbols.length; i++) {
    const firstSymbol = topLeftAreaSymbols[i];
    const firstSymbolText = firstSymbol.text;
    const targetWithDot = `${targetIdStr}.`;

    if (
      targetIdStr.startsWith(firstSymbolText) ||
      targetWithDot.startsWith(firstSymbolText)
    ) {
      let potentialMatch = [firstSymbol];
      let potentialText = firstSymbolText;

      for (let j = i + 1; j < topLeftAreaSymbols.length; j++) {
        const prevSymbol = potentialMatch[potentialMatch.length - 1];
        const currentSymbol = topLeftAreaSymbols[j];
        const [, py1, , py2] = getVerticesBox(prevSymbol.boundingBox.vertices);
        const [cx1, cy1] = getVerticesBox(currentSymbol.boundingBox.vertices);
        const [, , px2] = getVerticesBox(prevSymbol.boundingBox.vertices);

        const isSameLine = Math.abs(py1 - cy1) < (py2 - py1) / 2;
        const isAdjacent = cx1 - px2 < (py2 - py1) * 2;

        const nextText = potentialText + currentSymbol.text;
        if (
          isSameLine &&
          isAdjacent &&
          (targetIdStr.startsWith(nextText) ||
            targetWithDot.startsWith(nextText))
        ) {
          potentialText = nextText;
          potentialMatch.push(currentSymbol);
        } else if (isSameLine && isAdjacent) {
          break;
        }
      }

      if (potentialText === targetIdStr || potentialText === targetWithDot) {
        matchedSymbols = potentialMatch;
        break;
      }
    }
  }

  if (matchedSymbols.length > 0) {
    const { width: bufferWidth, height: bufferHeight } = await sharp(
      cropBuffer
    ).metadata();
    const allVertices = matchedSymbols.flatMap((s) => s.boundingBox.vertices);
    const [nx1, ny1, nx2, ny2] = getVerticesBox(allVertices);

    const padding = 2;
    const overlayLeft = Math.max(0, Math.round(nx1 - item.bbox[0]) - padding);
    const overlayTop = Math.max(0, Math.round(ny1 - item.bbox[1]) - padding);
    const overlayWidth = Math.round(nx2 - nx1) + padding * 2;
    const overlayHeight = Math.round(ny2 - ny1) + padding * 2;

    if (
      overlayWidth > 0 &&
      overlayHeight > 0 &&
      overlayLeft < bufferWidth &&
      overlayTop < bufferHeight
    ) {
      const whiteRect = await sharp({
        create: {
          width: Math.min(overlayWidth, bufferWidth - overlayLeft),
          height: Math.min(overlayHeight, bufferHeight - overlayTop),
          channels: 4,
          background: { r: 255, g: 255, b: 255, alpha: 1 },
        },
      })
        .png()
        .toBuffer();

      return sharp(cropBuffer)
        .composite([{ input: whiteRect, left: overlayLeft, top: overlayTop }])
        .toBuffer();
    }
  } else if (isFirstItem) {
    let symbolHint = "";
    if (symbolsInBbox.length > 0) {
      symbolHint = `. First symbols found: '${symbolsInBbox
        .slice(0, 2)
        .map((s) => s.text)
        .join("")}'`;
    } else {
      symbolHint = ". No symbols found in bbox.";
    }
    Logger.warn(
      `Could not find matching number for item ${uniqueId} (ID: ${targetIdStr}) in ${examName}/${subjectName}${symbolHint}`
    );
  }

  return cropBuffer;
}

async function createFinalImage(
  buffers,
  { isMath, isPassageProblem, isExplanation }
) {
  const metadatas = await Promise.all(buffers.map((b) => sharp(b).metadata()));
  const maxWidth = Math.max(...metadatas.map((m) => m.width));
  const totalHeight = metadatas.reduce((sum, m) => sum + m.height, 0);

  const compositeOperations = buffers.map((buffer, i) => ({
    input: buffer,
    top: metadatas.slice(0, i).reduce((sum, m) => sum + m.height, 0),
    left: 0,
  }));

  const stitchedBuffer = await sharp({
    create: {
      width: maxWidth,
      height: totalHeight,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite(compositeOperations)
    .png()
    .toBuffer();

  const trimmedBuffer = await sharp(stitchedBuffer).trim().toBuffer();
  const { width: trimmedWidth } = await sharp(trimmedBuffer).metadata();

  const extendedBuffer = await sharp(trimmedBuffer)
    .extend({
      right: Math.max(0, maxWidth - trimmedWidth),
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .toBuffer();

  const resizedBuffer = await sharp(extendedBuffer)
    .resize({ width: CONFIG.IMAGE_RESIZE_WIDTH })
    .png()
    .toBuffer();

  let bottomPadding;
  let maxHeight;

  if (isExplanation) {
    bottomPadding = 500;
    maxHeight = null;
  } else if (isPassageProblem) {
    bottomPadding = CONFIG.PADDING.BOTTOM_PASSAGE;
    maxHeight = CONFIG.MAX_HEIGHT.PASSAGE;
  } else if (isMath) {
    bottomPadding = CONFIG.PADDING.BOTTOM_MATH;
    maxHeight = 5000;
  } else {
    bottomPadding = CONFIG.PADDING.BOTTOM_DEFAULT;
    maxHeight = 4000;
  }

  let paddedBuffer = await sharp(resizedBuffer)
    .extend({
      top: CONFIG.PADDING.TOP,
      bottom: bottomPadding,
      left: CONFIG.PADDING.HORIZONTAL,
      right: CONFIG.PADDING.HORIZONTAL,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .png()
    .toBuffer();

  if (maxHeight) {
    const metadata = await sharp(paddedBuffer).metadata();
    if (metadata.height < maxHeight) {
      paddedBuffer = await sharp(paddedBuffer)
        .extend({
          bottom: maxHeight - metadata.height,
          background: { r: 255, g: 255, b: 255, alpha: 1 },
        })
        .png()
        .toBuffer();
    }
  }

  return paddedBuffer;
}

async function processBboxFile(bboxFile, { ocrDir }) {
  const subjectPath = path.dirname(bboxFile);
  const subjectName = path.basename(subjectPath);
  const examPath = path.dirname(subjectPath);
  const examName = path.basename(examPath);
  const isExplanation = examName.startsWith("explanation");

  const bboxContent = JSON.parse(await fs.readFile(bboxFile, "utf-8"));
  const allItems = bboxContent.bbox || [];

  const passageProblemIds = new Set(
    allItems
      .filter((item) => item.type === "passage")
      .flatMap((passage) => passage.problemIds)
  );

  const imagesOutputDir = path.join(subjectPath, "images");
  await fs.mkdir(imagesOutputDir, { recursive: true });

  const itemsById = allItems.reduce((acc, item) => {
    const uniqueId = `${item.type}-${item.id}`;
    if (!acc[uniqueId]) acc[uniqueId] = [];
    acc[uniqueId].push(item);
    return acc;
  }, {});

  const ocrDataCache = {};

  for (const uniqueId in itemsById) {
    const items = itemsById[uniqueId].sort((a, b) => {
      if (a.pageNum !== b.pageNum) {
        return a.pageNum - b.pageNum;
      }
      if (a.bbox[0] !== b.bbox[0]) {
        return a.bbox[0] - b.bbox[0];
      }
      return a.bbox[1] - b.bbox[1];
    });
    const cropBuffers = [];

    for (const [index, item] of items.entries()) {
      try {
        const [x1, y1, x2, y2] = item.bbox;
        const imagePath = item.imagePath;
        await fs.access(imagePath);

        let cropBuffer = await sharp(imagePath)
          .extract({
            left: Math.round(x1),
            top: Math.round(y1),
            width: Math.round(x2 - x1),
            height: Math.round(y2 - y1) + 2,
          })
          .png()
          .toBuffer();

        const ocrFileName = `${path.basename(imagePath, ".png")}.json`;
        const ocrFilePath = path.join(ocrDir, examName, ocrFileName);

        if (!ocrDataCache[ocrFilePath]) {
          try {
            await fs.access(ocrFilePath);
            ocrDataCache[ocrFilePath] = JSON.parse(
              await fs.readFile(ocrFilePath, "utf-8")
            );
          } catch (e) {
            ocrDataCache[ocrFilePath] = null;
          }
        }

        const ocrDataForPage = ocrDataCache[ocrFilePath];
        cropBuffer = await eraseItemNumber(cropBuffer, item, ocrDataForPage, {
          isFirstItem: index === 0,
          uniqueId,
          examName,
          subjectName,
        });

        cropBuffers.push(cropBuffer);
      } catch (e) {
        Logger.warn(
          `Could not process image for item ${uniqueId}: ${e.message}`
        );
      }
    }

    if (cropBuffers.length > 0) {
      const finalImageBuffer = await createFinalImage(cropBuffers, {
        isMath: subjectName === "수학",
        isPassageProblem: passageProblemIds.has(uniqueId.split("-")[1]),
        isExplanation,
      });
      const finalImagePath = path.join(imagesOutputDir, `${uniqueId}.png`);
      await fs.writeFile(finalImagePath, finalImageBuffer);
    }
  }
}

async function main() {
  Logger.section("D01-mockTest-02 Crop Images Start");
  try {
    const argv = yargs(hideBin(process.argv))
      .usage("Usage: $0 <inputDir> <ocrDir> [options]")
      .command(
        "$0 <inputDir> <ocrDir>",
        "Crop images based on bbox.json files",
        (yargs) => {
          yargs
            .positional("inputDir", {
              describe: "Directory containing the bbox.json files",
              type: "string",
            })
            .positional("ocrDir", {
              describe: "Directory containing the OCR JSON results",
              type: "string",
            });
        }
      )
      .option("targetFile", {
        alias: "t",
        describe:
          "Path to a text file containing a list of specific exam folder names to process (one per line)",
        type: "string",
      })
      .demandCommand(2, "You must provide both <inputDir> and <ocrDir>.")
      .help().argv;

    const { inputDir, ocrDir, targetFile } = argv;

    let targetExams = null;
    if (targetFile) {
      try {
        const fileContent = await fs.readFile(targetFile, "utf-8");
        targetExams = fileContent
          .split(/\r?\n/)
          .filter((line) => line.trim() !== "");
        Logger.info(
          `Loaded ${targetExams.length} target exam names from ${targetFile}`
        );
      } catch (error) {
        Logger.error(
          `Failed to read target file at ${targetFile}: ${error.message}`
        );
        process.exit(1);
      }
    }

    let bboxFiles = await glob(path.join(inputDir, "**/**/bbox.json"));

    if (targetExams) {
      bboxFiles = bboxFiles.filter((file) => {
        const examName = path.basename(path.dirname(path.dirname(file))).normalize();
        return targetExams.some((target) => target.normalize() === examName);
      });
      Logger.info(
        `Filtered to ${bboxFiles.length} files based on target list.`
      );
    }

    if (bboxFiles.length === 0) {
      Logger.warn("No matching bbox.json files found to process.");
      return;
    }

    Logger.info(`Found ${bboxFiles.length} bbox.json files to process.`);

    const taskQueue = [...bboxFiles];

    const worker = async () => {
      while (taskQueue.length > 0) {
        const bboxFile = taskQueue.shift();
        if (!bboxFile) continue;

        const examName = path.basename(path.dirname(path.dirname(bboxFile)));
        const subjectName = path.basename(path.dirname(bboxFile));
        Logger.info(`[Worker] Processing: ${examName}/${subjectName}`);
        await processBboxFile(bboxFile, { ocrDir });
      }
    };

    const workerPromises = [];
    for (let i = 0; i < CONCURRENCY_LIMIT && i < bboxFiles.length; i++) {
      workerPromises.push(worker());
    }
    await Promise.all(workerPromises);
  } catch (error) {
    Logger.error(`An error occurred: ${error.stack}`);
  } finally {
    Logger.endSection("D01-mockTest-02 Crop Images Finished");
    Logger.close();
  }
}

main();
