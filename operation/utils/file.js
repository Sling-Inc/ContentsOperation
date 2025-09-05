import fs from "fs/promises";
import { constants } from "fs";
import path from "path";

export async function readDirectories(dirPath, { fullPath = false } = {}) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => (fullPath ? path.join(dirPath, entry.name) : entry.name));
}

export async function readFilesWithExt(dirPath, ext) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    return entries
      .filter((entry) => entry.isFile() && path.extname(entry.name) === ext)
      .map((entry) => path.join(dirPath, entry.name));
  } catch (e) {
    return [];
  }
}

/**
 * 지정된 디렉토리에서 특정 확장자를 가진 모든 파일을 재귀적으로 찾아 경로 배열로 반환합니다.
 * @param {string} dirPath - 검색을 시작할 디렉토리의 경로
 * @param {object} [options] - 검색 옵션
 * @param {string[]} [options.extensions=[]] - 찾고자 하는 파일의 확장자 배열 (예: ['.js', '.json'])
 * @param {boolean} [options.fullPath=true] - true이면 절대 경로, false이면 상대 경로를 반환
 * @returns {Promise<string[]>} - 찾은 파일들의 경로 배열
 */
export async function readFilesWithExtR(
  dirPath,
  { extensions = [], fullPath = true } = {}
) {
  const initialPath = dirPath;

  async function recursiveSearch(currentPath) {
    let results = [];
    try {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });
      for (const entry of entries) {
        const entryFullPath = path.join(currentPath, entry.name);
        if (entry.isDirectory()) {
          results = results.concat(await recursiveSearch(entryFullPath));
        } else if (
          entry.isFile() &&
          extensions.includes(path.extname(entry.name))
        ) {
          results.push(
            fullPath ? entryFullPath : path.relative(initialPath, entryFullPath)
          );
        }
      }
    } catch (error) {
      // 디렉토리를 읽을 수 없는 경우 등 오류 발생 시 빈 배열 반환
      return [];
    }
    return results;
  }

  return recursiveSearch(dirPath);
}

export async function existsFile(path) {
  try {
    await fs.access(path, constants.F_OK); // 존재 여부만 확인
    return true;
  } catch (e) {
    return false;
  }
}

export async function readJSONFile(path) {
  if (!(await existsFile(path))) return {};
  return JSON.parse(await fs.readFile(path, "utf-8"));
}

export async function writeFile(filePath, data) {
  const dirname = path.dirname(filePath);
  await fs.mkdir(dirname, { recursive: true });
  await fs.writeFile(filePath, data, "utf-8");
}
