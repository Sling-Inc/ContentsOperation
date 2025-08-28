import fs from "fs/promises";
import { constants } from "fs";

export async function existsFile(path) {
  try {
    await fs.access(path, constants.F_OK); // 존재 여부만 확인
    return true;
  } catch (e) {
    return false;
  }
}
