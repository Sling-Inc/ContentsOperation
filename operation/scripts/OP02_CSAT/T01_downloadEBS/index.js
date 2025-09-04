import path from "path";
import url from "url";
import { RunScript } from "#operation/utils/runScript.js";
import { F001_downloadFiles } from "./F001_downloadFiles.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

const mockTestCodePath = path.join(__dirname, "mockTestCodes.json");

/**
 * 반드시 mockTestCodes.json 에 정보를 추가한 후 사용하세요
 */

const TARGET_DIR_NAME = "20250903_05";
const WORKSPACE_DIR = "/Users/jgj/Documents/toy/contentsOperation/workspace";

const DOWNLOAD_DIR = path.join(WORKSPACE_DIR, "downloads");
const OUTPUT_DIR = path.join(WORKSPACE_DIR, TARGET_DIR_NAME);

const choices = {
  ["F001"]: "F001. Download Mock Test Files",
  ["F002"]: "F002. Download Previous Papers by Year-Month-Grade",
};

async function main() {
  await RunScript(__dirname, choices, async (choice) => {
    switch (choice) {
      case choices["F001"]:
        await F001_downloadFiles(mockTestCodePath, DOWNLOAD_DIR, OUTPUT_DIR, {
          targetYear: "2025",
          targetMonth: "09",
          targetGrades: ["3"],
          targetFileTypes: ["해설지"],
        });
        break;
    }
  });
}

main();
