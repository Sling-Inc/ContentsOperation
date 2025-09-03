import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { fileURLToPath } from 'url';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { Logger } from '#root/utils/logger.js';
import { convertToImages } from '#root/utils/pdf.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Number of parallel workers
const CONCURRENCY_LIMIT = os.cpus().length;

async function processDirectory(inputDir, outputDir, dpi, targetFiles) {
  Logger.section(`Starting PDF to image conversion for directory: ${inputDir}`);
  Logger.info(`Concurrency limit set to: ${CONCURRENCY_LIMIT}`);

  try {
    const allFiles = await fs.readdir(inputDir);
    let pdfFiles;

    if (targetFiles && targetFiles.length > 0) {
      Logger.info(`Processing ${targetFiles.length} specified target(s).`);
      pdfFiles = allFiles.filter(file => {
        const fileNameWithoutExt = path.basename(file, '.pdf');
        return targetFiles.includes(fileNameWithoutExt) && path.extname(file).toLowerCase() === '.pdf';
      });
    } else {
      pdfFiles = allFiles.filter(file => path.extname(file).toLowerCase() === '.pdf');
    }

    if (pdfFiles.length === 0) {
      Logger.warn('No matching PDF files found to process.');
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
  const argv = yargs(hideBin(process.argv))
    .usage('Usage: $0 <inputDir> <outputDir> <dpi> [options]')
    .command('$0 <inputDir> <outputDir> <dpi>', 'Convert PDFs to images', (yargs) => {
      yargs
        .positional('inputDir', {
          describe: 'Input directory containing PDF files',
          type: 'string',
        })
        .positional('outputDir', {
          describe: 'Output directory to save images',
          type: 'string',
        })
        .positional('dpi', {
          describe: 'DPI for image conversion',
          type: 'number',
        });
    })
    .option('targetFile', {
      alias: 't',
      describe: 'Path to a text file containing a list of specific PDF folder names to process (one per line)',
      type: 'string',
    })
    .option('examType', {
      alias: 'e',
      describe: 'Type of the exam (e.g., default, mockTest)',
      type: 'string',
      default: 'default',
    })
    .demandCommand(3, 'You must provide inputDir, outputDir, and dpi arguments.')
    .help()
    .argv;

  const { inputDir, outputDir, dpi, targetFile, examType } = argv;

  if (isNaN(dpi)) {
    console.error('Error: DPI must be a number.');
    process.exit(1);
  }

  let targetFiles = null;
  if (targetFile) {
    try {
      const fileContent = await fs.readFile(targetFile, 'utf-8');
      targetFiles = fileContent.split(/\r?\n/).filter(line => line.trim() !== '');
      Logger.info(`Loaded ${targetFiles.length} target folder names from ${targetFile}`);
    } catch (error) {
      Logger.error(`Failed to read target file at ${targetFile}: ${error.message}`);
      process.exit(1);
    }
  }

  const rootDir = path.resolve(__dirname, '..', '..');
  const absoluteInputDir = path.resolve(rootDir, inputDir);
  const absoluteOutputDir = path.resolve(rootDir, outputDir);

  await processDirectory(absoluteInputDir, absoluteOutputDir, dpi, targetFiles);
}

main();
