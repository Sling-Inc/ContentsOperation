import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { glob } from "glob";
import { Logger } from "#root/utils/logger.js";

async function main() {
  Logger.section("D01-naesin-02 Crop Images Start");
  try {
    const args = process.argv.slice(2);
    const [inputDir] = args;
    const outputDir = inputDir; // For this script, output is within the input dir structure
    const imagesDir = path.resolve(inputDir, "../A01_images_ocr/420dpi");
    Logger.info(`Using input dir: ${inputDir}`);
    Logger.info(`Using images dir: ${imagesDir}`);
    Logger.info(`Using output dir: ${outputDir}`);

    const bboxFiles = await glob(path.join(inputDir, "**/bbox.json"));
    Logger.info(`Found ${bboxFiles.length} bbox.json files.`);

    for (const bboxFile of bboxFiles) {
      const examPath = path.dirname(bboxFile);
      const examName = path.basename(examPath);
      const imageDirForExam = path.join(imagesDir, examName);
      Logger.section(`Processing Exam: ${examName}`);

      const bboxContent = JSON.parse(await fs.readFile(bboxFile, "utf-8"));
      const allAdjustedItems = bboxContent.bbox || [];

      // passage에 딸린 문제 ID들을 추출
      const passageProblemIds = new Set(
        allAdjustedItems
          .filter((item) => item.type === "passage")
          .flatMap((passage) => passage.problemIds || [])
      );

      const imagesOutputDir = path.join(examPath, "images");
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
          // Use the imagePath from the bbox item, which is now correctly resolved
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

          // CSE와 동일한 여백 처리 로직
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

          const [type, id] = uniqueId.split("-");
          const isPassage = type === "passage";
          const isPassageProblem = passageProblemIds.has(id);
          
          // passage에 딸린 문제는 더 작은 높이 사용
          const bottomPadding = isPassage ? 1000 : (isPassageProblem ? 1000 : 2000);
          const maxHeight = isPassage ? 2000 : (isPassageProblem ? 2000 : 4000);

          let paddedBuffer = await sharp(resizedBuffer)
            .extend({
              top: 140,
              bottom: bottomPadding,
              left: 140,
              right: 140,
              background: { r: 255, g: 255, b: 255, alpha: 1 },
            })
            .png()
            .toBuffer();

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

          const itemType = type.replace("problem", "question");
          const finalImagePath = path.join(imagesOutputDir, `${itemType}_${id}.png`);
          await fs.writeFile(finalImagePath, paddedBuffer);
          Logger.debug(
            `Saved stitched image for ${uniqueId} to ${finalImagePath}`
          );
        }
      }
    }
  } catch (error) {
    Logger.error(`An error occurred: ${error.stack}`);
  } finally {
    Logger.endSection("D01-naesin-02 Crop Images Finished");
    Logger.close();
  }
}

main();
