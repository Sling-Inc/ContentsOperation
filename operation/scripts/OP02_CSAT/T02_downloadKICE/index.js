import path from "path";
import url from "url";
import { RunScript } from "#operation/utils/runScript.js";
import { F001_downloadFiles } from "./F001_downloadFiles.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

const KICE_URL = "https://cdn.kice.re.kr/sumo2609/index.html";

const TARGET_DIR_NAME = "20250903_04";
const targetYear = "2025";
const targetMonth = "09";

const WORKSPACE_DIR = "/Users/jgj/Documents/toy/contentsOperation/workspace";

const DOWNLOAD_DIR = path.join(WORKSPACE_DIR, "downloads");
const OUTPUT_DIR = path.join(WORKSPACE_DIR, TARGET_DIR_NAME);

const choices = {
  ["001"]: "001. KICE 자료 다운로드",
};

async function main() {
  await RunScript(__dirname, choices, async (choice) => {
    switch (choice) {
      case choices["001"]:
        await F001_downloadFiles(
          KICE_URL,
          DOWNLOAD_DIR,
          OUTPUT_DIR,
          targetYear,
          targetMonth
        );
        break;
    }
  });
}

main();
