import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { fileURLToPath } from 'url';
import { Logger } from '#root/utils/logger.js';
import { convertToImages } from '#root/utils/pdf.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Number of parallel workers
const CONCURRENCY_LIMIT = os.cpus().length;

async function processDirectory(inputDir, outputDir, dpi) {
  Logger.section(`Starting PDF to image conversion for directory: ${inputDir}`);
  Logger.info(`Concurrency limit set to: ${CONCURRENCY_LIMIT}`);

  try {
    const files = await fs.readdir(inputDir);
    const pdfFiles = files.filter(file => path.extname(file).toLowerCase() === '.pdf');

    if (pdfFiles.length === 0) {
      Logger.warn('No PDF files found in the input directory.');
      return;
    }

    Logger.info(`Found ${pdfFiles.length} PDF file(s) to convert.`);

    const taskQueue = [...pdfFiles];
    let activeWorkers = 0;
    let processedCount = 0;

    const worker = async () => {
      activeWorkers++;
      while (taskQueue.length > 0) {
        const pdfFile = taskQueue.shift();
        processedCount++;
        
        Logger.info(`[Worker] Processing file ${processedCount}/${pdfFiles.length}: ${pdfFile}`);
        
        const pdfFilePath = path.join(inputDir, pdfFile);
        const pdfName = path.basename(pdfFile, '.pdf');
        const pdfOutputDir = path.join(outputDir, pdfName);

        try {
          await fs.mkdir(pdfOutputDir, { recursive: true });
          await convertToImages(pdfFilePath, pdfOutputDir, dpi);
        } catch (workerError) {
          Logger.error(`[Worker] Failed to convert ${pdfFile}: ${workerError.message}`);
          Logger.debug(workerError.stack);
        }
      }
      activeWorkers--;
    };

    const workerPromises = [];
    for (let i = 0; i < CONCURRENCY_LIMIT && i < pdfFiles.length; i++) {
      workerPromises.push(worker());
    }

    await Promise.all(workerPromises);

  } catch (error) {
    Logger.error(`An error occurred while processing the directory: ${error.message}`);
    Logger.debug(error.stack);
  } finally {
    Logger.endSection('Finished processing all PDF files.');
    Logger.close();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const examTypeIndex = args.findIndex(arg => arg === '--examType');
  let examType = 'default';
  if (examTypeIndex !== -1 && args[examTypeIndex + 1]) {
    examType = args[examTypeIndex + 1];
    args.splice(examTypeIndex, 2); // Remove --examType and its value from args
  }

  if (args.length < 3) {
    console.error('Usage: node scripts/A01_convertPdfToImage <inputDir> <outputDir> <dpi> [--examType <type>]');
    process.exit(1);
  }

  const [inputDir, outputDir, dpiStr] = args;
  const dpi = parseInt(dpiStr, 10);

  if (isNaN(dpi)) {
    console.error('Error: DPI must be a number.');
    process.exit(1);
  }

  const rootDir = path.resolve(__dirname, '..', '..');
  const absoluteInputDir = path.resolve(rootDir, inputDir);
  const absoluteOutputDir = path.resolve(rootDir, outputDir);

  // Note: examType is parsed but not used yet.
  await processDirectory(absoluteInputDir, absoluteOutputDir, dpi);
}

main();
