import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import os from 'os';
import { fileURLToPath } from 'url';
import { Logger } from '#root/utils/logger.js';
import {
  mergeLayoutAndOcr,
  visualizeMergedLayout,
} from '#root/utils/layoutProcessor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONCURRENCY_LIMIT = os.cpus().length;

async function findJsonFiles(dir) {
  const allFiles = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      allFiles.push(...(await findJsonFiles(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      allFiles.push(fullPath);
    }
  }
  return allFiles;
}

async function processFilePair(
  layoutJsonPath,
  ocrJsonPath,
  ocrImagePath,
  outputJsonPath,
  isDebug,
  examType
) {
  try {
    Logger.info(`Processing: ${path.basename(layoutJsonPath)}`);

    // A03에서 생성된 새로운 구조의 JSON 읽기
    const layoutJsonContent = JSON.parse(
      await fs.readFile(layoutJsonPath, 'utf-8')
    );
    const layoutData = layoutJsonContent.results;
    const layoutDimensions = {
      width: layoutJsonContent.metadata.width,
      height: layoutJsonContent.metadata.height,
    };

    const ocrData = JSON.parse(await fs.readFile(ocrJsonPath, 'utf-8'));
    const ocrMeta = await sharp(ocrImagePath).metadata();
    const ocrDimensions = { width: ocrMeta.width, height: ocrMeta.height };

    // Bbox 너비 검증 로직 (기존과 동일)
    if (examType === 'mockTest' || examType === 'CSE') {
      const pageWidthThreshold = layoutDimensions.width / 2;
      for (const block of layoutData) {
        const bbox = block.bbox;
        const bboxWidth = bbox[2] - bbox[0];
        if (bboxWidth > pageWidthThreshold) {
          Logger.warn(
            `[Validation] Wide bbox found in ${path.relative(
              process.cwd(),
              layoutJsonPath
            )} | ` +
              `Width: ${bboxWidth} > Threshold: ${pageWidthThreshold.toFixed(
                0
              )} (Page Width: ${layoutDimensions.width})`
          );
        }
      }
    }

    const mergedData = mergeLayoutAndOcr(
      layoutData,
      ocrData.fullTextAnnotation,
      layoutDimensions,
      ocrDimensions
    );

    await fs.mkdir(path.dirname(outputJsonPath), { recursive: true });
    await fs.writeFile(outputJsonPath, JSON.stringify(mergedData, null, 2));

    if (isDebug) {
      Logger.debug(
        `Visualizing merged layout for ${path.basename(layoutJsonPath)}...`
      );
      const visualizedBuffer = await visualizeMergedLayout(
        ocrImagePath,
        mergedData
      );
      if (visualizedBuffer) {
        const outputImagePath = outputJsonPath.replace('.json', '.png');
        await fs.writeFile(outputImagePath, visualizedBuffer);
      }
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      Logger.error(
        `Image file not found for ${path.basename(layoutJsonPath)}. Skipping.`
      );
    } else {
      Logger.error(
        `Failed to process ${path.basename(layoutJsonPath)}: ${error.message}`
      );
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const examTypeIndex = args.findIndex((arg) => arg === '--examType');
  let examType = 'default';
  if (examTypeIndex !== -1 && args[examTypeIndex + 1]) {
    examType = args[examTypeIndex + 1];
    args.splice(examTypeIndex, 2);
  }

  const isDebug = args.includes('--debug');
  if (isDebug) {
    const debugIndex = args.indexOf('--debug');
    args.splice(debugIndex, 1);
  }

  // layoutImageDir 인자 제거, 필요 인자 수 4개로 변경
  if (args.length < 4) {
    console.error(
      'Usage: node scripts/C01_mergeResults <layoutJsonDir> <ocrJsonDir> <ocrImageDir> <outputDir> [--debug] [--examType <type>]'
    );
    process.exit(1);
  }

  const [layoutJsonDir, ocrJsonDir, ocrImageDir, outputDir] = args;

  const rootDir = path.resolve(__dirname, '..', '..');
  const absLayoutJsonDir = path.resolve(rootDir, layoutJsonDir);
  const absOcrJsonDir = path.resolve(rootDir, ocrJsonDir);
  const absOcrImageDir = path.resolve(rootDir, ocrImageDir);
  const absOutputDir = path.resolve(rootDir, outputDir);

  Logger.section('Starting OCR and Layout Merge Process');
  if (isDebug)
    Logger.info('Debug mode enabled: Visualization images will be generated.');
  Logger.info(`Exam type set to: ${examType}`);

  try {
    const layoutFiles = await findJsonFiles(absLayoutJsonDir);
    Logger.info(`Found ${layoutFiles.length} layout JSON files.`);

    const taskQueue = [...layoutFiles];

    const worker = async () => {
      while (taskQueue.length > 0) {
        const layoutJsonPath = taskQueue.shift();
        if (!layoutJsonPath) continue;

        const relativePath = path.relative(absLayoutJsonDir, layoutJsonPath);
        const ocrJsonPath = path.join(absOcrJsonDir, relativePath);

        const imageName = path.basename(relativePath, '.json');
        const subDir = path.dirname(relativePath);
        // layoutImagePath 제거
        const ocrImagePath = path.join(
          absOcrImageDir,
          subDir,
          `${imageName}.png`
        );

        const outputJsonPath = path.join(absOutputDir, relativePath);

        if (await fs.access(ocrJsonPath).then(() => true).catch(() => false)) {
          await processFilePair(
            layoutJsonPath,
            ocrJsonPath,
            ocrImagePath, // layoutImagePath 제거
            outputJsonPath,
            isDebug,
            examType
          );
        } else {
          Logger.warn(
            `Matching OCR file not found for ${layoutJsonPath}, skipping.`
          );
        }
      }
    };

    const workerPromises = [];
    for (let i = 0; i < CONCURRENCY_LIMIT && i < layoutFiles.length; i++) {
      workerPromises.push(worker());
    }
    await Promise.all(workerPromises);
  } catch (error) {
    Logger.error(`An error occurred: ${error.message}`);
    Logger.debug(error.stack);
  } finally {
    Logger.endSection('Finished all merge processing.');
    Logger.close();
  }
}

main();
