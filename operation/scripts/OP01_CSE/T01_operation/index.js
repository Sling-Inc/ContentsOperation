import path from "path";
import url from "url";
import { RunScript } from "#operation/utils/runScript.js";

// 실행할 실제 로직이 담긴 함수들을 가져옵니다.
import { F000_createIds } from "./F000_createIds.js";
import { F001_uploadToFirebase } from "./F001_uploadToFirebase.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

// 실행할 기능 목록을 정의합니다.
const choices = {
  ["000"]: "000. create ids",
  ["001"]: "001. upload to firebase",
};

// 메인 실행 함수
async function main() {
  await RunScript(__dirname, choices, async (choice) => {
    switch (choice) {
      case choices["000"]:
        await F000_createIds();
        break;
      case choices["001"]:
        await F001_uploadToFirebase();
        break;
    }
  });
}

main();
