import path from "path";
import url from "url";
import { RunScript } from "#operation/utils/runScript.js";
import { D000_checkThumbnails } from "./D000_checkThumbnails.js";
import { F000_createMetadata } from "./F000_createMetadata.js";
import { F001_createIds } from "./F001_createIds.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

const TARGET_DIR =
  "/Users/jgj/Documents/toy/contentsOperation/workspace/20250902_T1/D01_postprocess";

const TAGS = "202509_CSAT";

const THUMBNAIL_DIR =
  "/Users/jgj/Documents/toy/contentsOperation/operation/scripts/OP02_CSAT/_thumbnails";

const choices = {
  ["D000"]: "D000. Check Thumbnails",
  ["F000"]: "F000. Create Metadata json",
  ["F001"]: "F001. Create ids",
};

async function main() {
  await RunScript(__dirname, choices, async (choice) => {
    switch (choice) {
      case choices["D000"]:
        await D000_checkThumbnails(TARGET_DIR, THUMBNAIL_DIR);
        break;
      case choices["F000"]:
        await F000_createMetadata(TARGET_DIR, THUMBNAIL_DIR);
        break;
      case choices["F001"]:
        await F001_createIds(TARGET_DIR);
        break;
    }
  });
}

main();
