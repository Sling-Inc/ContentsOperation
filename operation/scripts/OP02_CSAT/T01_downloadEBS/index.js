import path from "path";
import url from "url";
import { RunScript } from "#operation/utils/runScript.js";
import { getMockTestCodes } from "./F000_getMockTestCode.js";
import { F001_downloadFiles } from "./F001_downloadFiles.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

const mockTestCodePath = path.join(__dirname, "mockTestCodes.json");

const choices = {
  ["F000"]: "F000. Get Mock Test Codes",
  ["F001"]: "F001. Download Mock Test Files",
};

async function main() {
  await RunScript(__dirname, choices, async (choice) => {
    switch (choice) {
      case choices["F000"]:
        await getMockTestCodes();
        break;
      case choices["F001"]:
        await F001_downloadFiles(mockTestCodePath);
        break;
    }
  });
}

main();
