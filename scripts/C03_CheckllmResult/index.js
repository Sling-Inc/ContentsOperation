import { promises as fs } from 'fs';
import path from 'path';
import { Logger } from '#root/utils/logger.js';

/**
 * Recursively finds all files with a specific name in a directory.
 * @param {string} dir - The directory to start searching from.
 * @param {string} fileNameToFind - The name of the file to find.
 * @returns {Promise<string[]>} A promise that resolves to an array of file paths.
 */
async function findFilesRecursively(dir, fileNameToFind) {
  const dirents = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(dirents.map(async (dirent) => {
    const res = path.resolve(dir, dirent.name);
    if (dirent.isDirectory()) {
      return findFilesRecursively(res, fileNameToFind);
    }
    return dirent.name === fileNameToFind ? res : [];
  }));
  return Array.prototype.concat(...files);
}

/**
 * Creates a map of block IDs to their page numbers by simulating the ID assignment logic.
 * @param {string} mergedResultsDir - The directory containing merged results.
 * @param {string} examName - The name of the exam.
 * @returns {Promise<Map<number, number>>} A map of blockId to pageNum.
 */
async function createBlockIdToPageMap(mergedResultsDir, examName) {
  const blockIdToPageMap = new Map();
  const examMergedDir = path.join(mergedResultsDir, examName);

  try {
    await fs.access(examMergedDir);
  } catch (e) {
    return blockIdToPageMap; // Directory doesn't exist, return empty map
  }

  const dirents = await fs.readdir(examMergedDir, { withFileTypes: true });
  const jsonFiles = dirents
    .filter(dirent => dirent.isFile() && dirent.name.startsWith('page.') && dirent.name.endsWith('.json'))
    .map(dirent => dirent.name)
    .sort((a, b) => {
      const pageA = parseInt(a.split('.')[1], 10);
      const pageB = parseInt(b.split('.')[1], 10);
      return pageA - pageB;
    });

  if (jsonFiles.length === 0) {
    return blockIdToPageMap;
  }

  let currentBlockId = 1;
  for (const fileName of jsonFiles) {
    const filePath = path.join(examMergedDir, fileName);
    const pageNum = parseInt(fileName.split('.')[1], 10);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content);
      if (Array.isArray(data)) {
        for (let i = 0; i < data.length; i++) {
          blockIdToPageMap.set(currentBlockId, pageNum);
          currentBlockId++;
        }
      }
    } catch (e) {
      // Ignore file read/parse errors
    }
  }
  return blockIdToPageMap;
}

/**
 * Checks a single llmResult.json file for duplicate block IDs.
 * @param {string} filePath - The path to the llmResult.json file.
 * @param {string} mergedResultsDir - The directory containing merged results for page info.
 * @returns {Promise<boolean>} True if duplicates are found, otherwise false.
 */
async function checkFileForDuplicateIds(filePath, mergedResultsDir) {
  const examName = path.basename(path.dirname(filePath));
  const blockIdToPageMap = await createBlockIdToPageMap(mergedResultsDir, examName);

  const content = await fs.readFile(filePath, 'utf-8');
  const data = JSON.parse(content);
  const structure = data.structure;

  if (!structure || !Array.isArray(structure)) {
    return false;
  }

  const idToItemsMap = new Map();
  for (const item of structure) {
    if (!item.ids || !Array.isArray(item.ids)) continue;
    for (const blockId of item.ids) {
      if (!idToItemsMap.has(blockId)) {
        idToItemsMap.set(blockId, []);
      }
      idToItemsMap.get(blockId).push(item.id || 'N/A');
    }
  }

  const duplicatesByPage = new Map();
  let hasDuplicates = false;

  for (const [blockId, itemIds] of idToItemsMap.entries()) {
    if (itemIds.length > 1) {
      hasDuplicates = true;
      const pageNum = blockIdToPageMap.get(blockId) || 'Unknown Page';
      if (!duplicatesByPage.has(pageNum)) {
        duplicatesByPage.set(pageNum, new Map());
      }
      duplicatesByPage.get(pageNum).set(blockId, [...new Set(itemIds)]);
    }
  }

  if (hasDuplicates) {
    Logger.error(`파일에서 중복된 블록 ID 발견: ${filePath}`);
    const sortedPages = [...duplicatesByPage.keys()].sort((a, b) => {
        if (a === 'Unknown Page') return 1;
        if (b === 'Unknown Page') return -1;
        return a - b;
    });
    for (const pageNum of sortedPages) {
      const blockMap = duplicatesByPage.get(pageNum);
      Logger.error(`  - 페이지: ${pageNum}`);
      for (const [blockId, itemIds] of blockMap.entries()) {
        Logger.error(`    - 블록 ID: ${blockId} -> 등장한 곳: [${itemIds.join(', ')}]`);
      }
    }
    return true;
  }

  return false;
}

async function main() {
  const llmResultsDir = process.argv[2];
  const mergedResultsDir = process.argv[3];

  if (!llmResultsDir || !mergedResultsDir) {
    Logger.error('사용법: node <script> <C02_llm_classification_results 경로> <C01_merged_results 경로>');
    process.exit(1);
  }

  try {
    const files = await findFilesRecursively(llmResultsDir, 'llmResult.json');
    if (files.length === 0) {
      return;
    }

    let filesWithDuplicates = 0;
    for (const file of files) {
      const hasDuplicates = await checkFileForDuplicateIds(file, mergedResultsDir);
      if (hasDuplicates) {
        filesWithDuplicates++;
      }
    }

    if (filesWithDuplicates > 0) {
      Logger.warn(`
총 ${filesWithDuplicates}개의 파일에서 중복된 블록 ID가 발견되었습니다.`);
    }

  } catch (error) {
    Logger.error('처리 중 오류가 발생했습니다:', error);
  } finally {
    Logger.close();
  }
}

main();