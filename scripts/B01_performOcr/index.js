import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { fileURLToPath } from 'url';
import { Logger } from '#root/utils/logger.js';
import { performGoogleDocumentOCR, visualizeOcrResults } from '#root/utils/cloudVision.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONCURRENCY_LIMIT = os.cpus().length;

async function processImageDirectory(imageDir, outputDir, isDebug) {
  const imageFiles = (await fs.readdir(imageDir)).filter(f => /\.(png|jpg|jpeg)$/i.test(f));
  if (imageFiles.length === 0) {
    Logger.warn(`No image files found in ${imageDir}`);
    return;
  }

  await fs.mkdir(outputDir, { recursive: true });
  
  const taskQueue = [...imageFiles];
  let processedCount = 0;

  const worker = async (workerId) => {
    while (taskQueue.length > 0) {
      const imageFile = taskQueue.shift();
      if (!imageFile) continue;

      processedCount++;
      const imagePath = path.join(imageDir, imageFile);
      const baseName = path.basename(imageFile, path.extname(imageFile));
      const outputJsonPath = path.join(outputDir, `${baseName}.json`);
      
      Logger.info(`[Worker ${workerId}] Processing ${processedCount}/${imageFiles.length}: ${imageFile}`);

      try {
        const imageBuffer = await fs.readFile(imagePath);
        const ocrResult = await performGoogleDocumentOCR(imageBuffer);

        if (ocrResult) {
          await fs.writeFile(outputJsonPath, JSON.stringify(ocrResult, null, 2));

          if (isDebug) {
            Logger.debug(`[Worker ${workerId}] Visualizing OCR for ${imageFile}...`);
            const visualizedBuffer = await visualizeOcrResults(imageBuffer, ocrResult);
            if (visualizedBuffer) {
              const outputImagePath = path.join(outputDir, `${baseName}.png`);
              await fs.writeFile(outputImagePath, visualizedBuffer);
            }
          }
        } else {
          Logger.warn(`OCR returned no result for ${imageFile}`);
        }
      } catch (workerError) {
        Logger.error(`[Worker ${workerId}] Failed to process ${imageFile}: ${workerError.message}`);
      }
    }
  };

  const workerPromises = [];
  for (let i = 1; i <= CONCURRENCY_LIMIT && i <= imageFiles.length; i++) {
    workerPromises.push(worker(i));
  }
  await Promise.all(workerPromises);
}

async function main() {
  const args = process.argv.slice(2);
  const examTypeIndex = args.findIndex(arg => arg === '--examType');
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

  if (args.length < 2) {
    console.error('Usage: node scripts/B01_performOcr <inputBaseDir> <outputBaseDir> [--debug] [--examType <type>]');
    process.exit(1);
  }

  const [inputBaseDir, outputBaseDir] = args;
  
  const rootDir = path.resolve(__dirname, '..', '..');
  const absoluteInputBaseDir = path.resolve(rootDir, inputBaseDir);
  const absoluteOutputBaseDir = path.resolve(rootDir, outputBaseDir);

  Logger.section(`Starting OCR processing for base directory: ${absoluteInputBaseDir}`);
  Logger.info(`Concurrency limit set to: ${CONCURRENCY_LIMIT}`);
  if (isDebug) Logger.info('Debug mode enabled: Visualization images will be generated.');
  if (examType !== 'default') Logger.info(`Exam type set to: ${examType}`);

  try {
    const subDirs = await fs.readdir(absoluteInputBaseDir, { withFileTypes: true });
    for (const dirent of subDirs) {
      if (dirent.isDirectory()) {
        const subDirName = dirent.name;
        Logger.section(`Processing sub-directory: ${subDirName}`);
        const inputDir = path.join(absoluteInputBaseDir, subDirName);
        const outputDir = path.join(absoluteOutputBaseDir, subDirName);
        // Note: examType is parsed but not used yet.
        await processImageDirectory(inputDir, outputDir, isDebug);
        Logger.endSection(`Finished sub-directory: ${subDirName}`);
      }
    }
  } catch (error) {
    Logger.error(`An error occurred: ${error.message}`);
    Logger.debug(error.stack);
  } finally {
    Logger.endSection('Finished all OCR processing.');
    Logger.close();
  }
}

main();