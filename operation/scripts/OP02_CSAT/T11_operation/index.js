import path from "path";
import url from "url";
import { RunScript } from "#operation/utils/runScript.js";

import { D000_checkThumbnails } from "./D000_checkThumbnails.js";

import { F001_createAnswer } from "./F001_createAnswer.js";
import { F002_cutEnglishAudio } from "./F002_cutEnglishAudio.js";
import { F003_createMetadata } from "./F003_createMetadata.js";

import { F010_createIds } from "./F010_createIds.js";
import { F011_uploadToFirebase } from "./F011_uploadToFirebase.js";
import { F014_updateVisible } from "./F014_updateVisible.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

const TAGS = "202509_CSAT";

const ROOT = "/Users/jgj/Documents/toy/contentsOperation/workspace/20250903_03";

const TARGET_DIR = `${ROOT}/D01_postprocess_results`;
const ANSWERS_DIR = `${ROOT}/_answer`;
const AUDIO_DIR = `${ROOT}/_audio`;
const THUMBNAIL_DIR =
  "/Users/jgj/Documents/toy/contentsOperation/operation/scripts/OP02_CSAT/_thumbnails";

const choices = {
  ["D000"]: "D000. Check Thumbnails",
  ["F001"]: "F001. Create Answer",
  ["F002"]: "F002. Audio Cuttor",
  ["F003"]: "F003. Create Metadata",

  ["F010"]: "F010. Create ids",
  ["F011"]: "F011. Upload to Firebase",
  ["F014"]: "F014. Update Visible",
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

      case choices["F014"]:
        await F014_updateVisible(TAGS);
        break;
    }
  });
}

main();
