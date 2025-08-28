import fs from "fs/promises";
import { constants } from "fs";
import path from "path";

export async function existsFile(path) {
  try {
    await fs.access(path, constants.F_OK); // 존재 여부만 확인
    return true;
  } catch (e) {
    return false;
  }
}

export async function writeFile(filePath, data) {
  const dirname = path.dirname(filePath);
  await fs.mkdir(dirname, { recursive: true });
  await fs.writeFile(filePath, data, "utf-8");
}
