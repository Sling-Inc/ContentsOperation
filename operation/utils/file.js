import fs from "fs/promises";
import { constants } from "fs";
import path from "path";

export async function readDirectories(path) {
  return (await fs.readdir(path, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

export async function readFilesWithExt(dirPath, ext) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && path.extname(entry.name) === ext)
    .map((entry) => path.join(dirPath, entry.name));
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
