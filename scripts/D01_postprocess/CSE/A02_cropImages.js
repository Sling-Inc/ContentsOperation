import fs from "fs/promises";
import path from "path";
import os from "os";
import sharp from "sharp";
import { glob } from "glob";
import { Logger } from "#root/utils/logger.js";

const CONCURRENCY_LIMIT = os.cpus().length;

async function processExam(bboxFile, imagesDir, inputDir) {
  const examName = path.basename(path.dirname(bboxFile));
  Logger.section(`Processing exam: ${examName}`);

  try {
    const bboxContent = JSON.parse(await fs.readFile(bboxFile, "utf-8"));
    const allItems = bboxContent.bbox || [];

    const imagesOutputDir = path.join(inputDir, examName, "images");
    await fs.mkdir(imagesOutputDir, { recursive: true });

    const itemsById = allItems.reduce((acc, item) => {
      if (!acc[item.id]) acc[item.id] = [];
      acc[item.id].push(item);
      return acc;
    }, {});

    for (const id in itemsById) {
      const items = itemsById[id].sort((a, b) => a.pageNum - b.pageNum);
      const cropBuffers = [];
      for (const item of items) {
        const [x1, y1, x2, y2] = item.bbox;
        const imagePath = path.join(
          imagesDir,
          examName,
          `page.${item.pageNum}.png`
        );
        try {
          await fs.access(imagePath);
          const cropBuffer = await sharp(imagePath)
            .extract({
              left: Math.round(x1),
              top: Math.round(y1),
              width: Math.round(x2 - x1),
              height: Math.round(y2 - y1) + 2,
            })
            .png()
            .toBuffer();
          cropBuffers.push(cropBuffer);
        } catch (e) {
          Logger.warn(
            `Could not crop image ${imagePath} for item ${id}: ${e.message}`
          );
        }
      }

      if (cropBuffers.length > 0) {
        const metadatas = await Promise.all(
          cropBuffers.map((b) => sharp(b).metadata())
        );
        const maxWidth = Math.max(...metadatas.map((m) => m.width));
        const totalHeight = metadatas.reduce((sum, m) => sum + m.height, 0);

        const compositeOperations = [];
        let currentHeight = 0;
        for (let i = 0; i < cropBuffers.length; i++) {
          compositeOperations.push({
            input: cropBuffers[i],
            top: currentHeight,
            left: 0,
          });
          currentHeight += metadatas[i].height;
        }

        const finalImageBuffer = await sharp({
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
        const itemType = items[0].type.replace("problem", "question");
        const finalImagePath = path.join(
          imagesOutputDir,
          `${itemType}_${id}.png`
        );
        await fs.writeFile(finalImagePath, finalImageBuffer);
        Logger.debug(`Saved stitched image for ${id} to ${finalImagePath}`);
      }
    }
  } catch (error) {
    Logger.error(`Failed to process exam ${examName}: ${error.message}`);
    Logger.debug(error.stack);
  }
}

async function main() {
  Logger.section("D01-CSE-02 Crop Images Start");
  try {
    const args = process.argv.slice(2);
    const [inputDir, imagesDir] = args;

    Logger.info(`  - Concurrency Limit: ${CONCURRENCY_LIMIT}`);

    const bboxFiles = await glob(path.join(inputDir, "**/bbox.json"));
    Logger.info(`Found ${bboxFiles.length} bbox.json files.`);

    const taskQueue = [...bboxFiles];

    const worker = async (workerId) => {
      while (taskQueue.length > 0) {
        const bboxFile = taskQueue.shift();
        if (!bboxFile) continue;

        const examName = path.basename(path.dirname(bboxFile));
        Logger.info(`[Worker ${workerId}] Picked up exam: ${examName}`);
        await processExam(bboxFile, imagesDir, inputDir);
      }
    };

    const workerPromises = [];
    for (let i = 1; i <= CONCURRENCY_LIMIT && i <= bboxFiles.length; i++) {
      workerPromises.push(worker(i));
    }
    await Promise.all(workerPromises);
  } catch (error) {
    Logger.error(`An error occurred: ${error.stack}`);
  } finally {
    Logger.endSection("D01-CSE-02 Crop Images Finished");
    Logger.close();
  }
}

main();
