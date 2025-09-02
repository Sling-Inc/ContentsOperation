import path from "path";
import url from "url";
import { RunScript } from "#operation/utils/runScript.js";

import { D000_checkThumbnails } from "./D000_checkThumbnails.js";

import { F001_createAnswer } from "./F001_createAnswer.js";
import { F002_cutEnglishAudio } from "./F002_cutEnglishAudio.js";
import { F003_createMetadata } from "./F003_createMetadata.js";

import { F010_createIds } from "./F010_createIds.js";
import { F011_uploadToFirebase } from "./F011_uploadToFirebase.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

const TARGET_DIR =
  "/Users/jgj/Documents/toy/contentsOperation/workspace/20250901_T1/D01_postprocess_results";

const ANSWERS_DIR =
  "/Users/jgj/Documents/toy/contentsOperation/workspace/20250901_02/_answer";

const TAGS = "202509_CSAT";

const THUMBNAIL_DIR =
  "/Users/jgj/Documents/toy/contentsOperation/operation/scripts/OP02_CSAT/_thumbnails";

const AUDIO_DIR =
  "/Users/jgj/Documents/toy/contentsOperation/workspace/20250901_02/_audio";

const choices = {
  ["D000"]: "D000. Check Thumbnails",
  ["F001"]: "F001. Create Metadata json",
  ["F002"]: "F002. Audio Cuttor",
  ["F003"]: "F003. Create Answer",

  ["F010"]: "F010. Create ids",
  ["F011"]: "F011. Upload to Firebase",
};

async function main() {
  await RunScript(__dirname, choices, async (choice) => {
    switch (choice) {
      case choices["D000"]:
        await D000_checkThumbnails(TARGET_DIR, THUMBNAIL_DIR);
        break;

      case choices["F001"]:
        await F001_createAnswer(TARGET_DIR, ANSWERS_DIR);
        break;

      case choices["F002"]:
        await F002_cutEnglishAudio(TARGET_DIR, AUDIO_DIR);
        break;

      case choices["F003"]:
        await F003_createMetadata(TARGET_DIR, THUMBNAIL_DIR);
        break;

      case choices["F010"]:
        await F010_createIds(TARGET_DIR);
        break;
      case choices["F011"]:
        await F011_uploadToFirebase(TARGET_DIR, TAGS);
        break;
    }
  });
}

main();
