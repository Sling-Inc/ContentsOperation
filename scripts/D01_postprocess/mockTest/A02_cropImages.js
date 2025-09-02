import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { glob } from "glob";
import { Logger } from "#root/utils/logger.js";

async function processBboxFile(bboxFile, { imagesDir, outputDir }) {
  const subjectPath = path.dirname(bboxFile);
  const subjectName = path.basename(subjectPath);
  const examPath = path.dirname(subjectPath);
  const examName = path.basename(examPath);
  Logger.section(`Processing Exam: ${examName}, Subject: ${subjectName}`);

  const bboxContent = JSON.parse(await fs.readFile(bboxFile, "utf-8"));
  const allAdjustedItems = bboxContent.bbox || [];

  const passages = allAdjustedItems.filter((item) => item.type === "passage");
  const passageProblems = passages.map((passage) => passage.problemIds).flat();

  const imagesOutputDir = path.join(subjectPath, "images");
  await fs.mkdir(imagesOutputDir, { recursive: true });

  const itemsById = allAdjustedItems.reduce((acc, item) => {
    const uniqueId = `${item.type}-${item.id}`;
    if (!acc[uniqueId]) acc[uniqueId] = [];
    acc[uniqueId].push(item);
    return acc;
  }, {});

  for (const uniqueId in itemsById) {
    const items = itemsById[uniqueId].sort((a, b) => a.pageNum - b.pageNum);
    const cropBuffers = [];
    for (const item of items) {
      const [x1, y1, x2, y2] = item.bbox;
      const imagePath = item.imagePath;
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
          `Could not crop image ${imagePath} for item ${uniqueId}: ${e.message}`
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
        .resize({ width: 1720 })
        .png()
        .toBuffer();

      let paddedBuffer = await sharp(resizedBuffer)
        .extend({
          top: 140,
          bottom: passageProblems.includes(uniqueId) ? 1000 : 2000,
          left: 140,
          right: 140,
          background: { r: 255, g: 255, b: 255, alpha: 1 },
        })
        .png()
        .toBuffer();

      const metadata = await sharp(paddedBuffer).metadata();
      const maxHeight = passageProblems.includes(uniqueId) ? 2000 : 4000;
      if (metadata.height < maxHeight) {
        paddedBuffer = await sharp(paddedBuffer)
          .extend({
            bottom: maxHeight - metadata.height,
            background: { r: 255, g: 255, b: 255, alpha: 1 },
          })
          .png()
          .toBuffer();
      }

      const finalImagePath = path.join(imagesOutputDir, `${uniqueId}.png`);
      await fs.writeFile(finalImagePath, paddedBuffer);
      Logger.debug(`Saved stitched image for ${uniqueId} to ${finalImagePath}`);
    }
  }
}

async function main() {
  Logger.section("D01-mockTest-02 Crop Images Start");
  try {
    const args = process.argv.slice(2);
    const [inputDir] = args;
    const outputDir = inputDir;
    const imagesDir = path.resolve(inputDir, "../../B01_images_ocr_420dpi");
    Logger.info(`Using input dir: ${inputDir}`);
    Logger.info(`Using images dir: ${imagesDir}`);
    Logger.info(`Using output dir: ${outputDir}`);

    const bboxFiles = await glob(path.join(inputDir, "**/**/bbox.json"));
    Logger.info(`Found ${bboxFiles.length} bbox.json files.`);

    const processingPromises = bboxFiles.map((file) =>
      processBboxFile(file, { imagesDir, outputDir })
    );
    await Promise.all(processingPromises);
  } catch (error) {
    Logger.error(`An error occurred: ${error.stack}`);
  } finally {
    Logger.endSection("D01-mockTest-02 Crop Images Finished");
    Logger.close();
  }
}

main();
