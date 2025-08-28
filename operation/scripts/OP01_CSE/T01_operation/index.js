import path from "path";
import url from "url";
import { RunScript } from "#operation/utils/runScript.js";

// 실행할 실제 로직이 담긴 함수들을 가져옵니다.
import { F000_createIds } from "./F000_createIds.js";
import { F001_uploadToFirebase } from "./F001_uploadToFirebase.js";
import { F002_updateVisible } from "./F002_updateVisible.js";
import { F999_sandbox } from "./F999_sandbox.js";

import { R001_mergeUploadInfo } from "./R001_mergeUploadInfo.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

// 실행할 기능 목록을 정의합니다.
const choices = {
  ["F00"]: "F00. create ids",
  ["F01"]: "F01. upload to firebase",
  ["F02"]: "F02. update visible",
  ["F99"]: "F99. sandbox",

  ["R01"]: "R01. merge upload info",
};

// 메인 실행 함수
async function main() {
  await RunScript(__dirname, choices, async (choice) => {
    switch (choice) {
      case choices["F00"]:
        await F000_createIds();
        break;
      case choices["F01"]:
        await F001_uploadToFirebase();
        break;
      case choices["F02"]:
        await F002_updateVisible();
        break;
      case choices["F99"]:
        await F999_sandbox();
        break;

      case choices["R01"]:
        await R001_mergeUploadInfo();
        break;
    }
  });
}

main();
