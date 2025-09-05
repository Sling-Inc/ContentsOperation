import path from "path";
import url from "url";
import { RunScript } from "#operation/utils/runScript.js";
import { T001_hello } from "./T001_hello.js";
import { F030_getPageMetadata } from "./F030_getPageMetadata.js";
import { F031_checkPageMetadata } from "./F031_checkPageMetadata.js";
import { F040_createPdfWithMetadata } from "./F040_createPdfWithMetadata.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

const TARGET_DIR =
  "/Users/jgj/Documents/toy/contentsOperation/workspace/20250905_ns2/_raw";

const OUTPUT_DIR =
  "/Users/jgj/Documents/toy/contentsOperation/workspace/20250905_ns2/00_pdf";

const choices = {
  ["001"]: "001. Hello World",
  ["030"]: "030. 페이지 메타데이터 가져오기",
  ["031"]: "031. 페이지 메타데이터 검증",
  ["040"]: "040. 메타데이터 PDF 생성",
};

async function main() {
  await RunScript(__dirname, choices, async (choice) => {
    switch (choice) {
      case choices["001"]:
        await T001_hello();
        break;
      case choices["030"]:
        await F030_getPageMetadata(TARGET_DIR);
        break;
      case choices["031"]:
        await F031_checkPageMetadata(TARGET_DIR);
        break;
      case choices["040"]:
        await F040_createPdfWithMetadata(TARGET_DIR, OUTPUT_DIR);
        break;
    }
  });
}

main();
