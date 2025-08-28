import fs from "fs";
import path from "path";

import inquirer from "inquirer";
import { spawn } from "cross-spawn";

import { checkFirebaseCredentials } from "./credentials/firebaseCredentials.js";

const MIN_NODE_VERSION = 22;

const __dirname = process.cwd();

/**
 * Node.js 버전을 확인하고 최소 요구 버전을 충족하는지 검사합니다.
 * @param {number} minVersion - 최소 요구 버전
 * @returns {boolean} - 버전 충족 여부
 */
function checkNodeVersion(minVersion) {
  const currentVersion = process.versions.node;
  const majorVersion = parseInt(currentVersion.split(".")[0], 10);

  if (majorVersion < minVersion) {
    console.error(
      `오류: 이 스크립트는 Node.js v${minVersion} 이상이 필요합니다.`
    );
    console.error(`현재 버전: v${currentVersion}`);
    return false;
  }

  return true;
}

/**
 * 초기화 함수
 */
async function init() {
  await checkFirebaseCredentials();
}

(async (project, script) => {
  // Node.js 버전 MIN_NODE_VERSION 이상 확인
  if (!checkNodeVersion(MIN_NODE_VERSION)) {
    process.exit(1);
  }

  const scriptDir = path.join(__dirname, "operation", "scripts");

  await init();

  if (!project) {
    const projectFolders = fs
      .readdirSync(scriptDir)
      .filter(
        (file) =>
          fs.lstatSync(path.join(scriptDir, file)).isDirectory() &&
          !file.startsWith(".") &&
          !file.startsWith("_") &&
          ![].includes(file)
      );

    project = (
      await inquirer.prompt([
        {
          type: "list",
          name: "folder",
          message: "Select Project ",
          choices: projectFolders,
        },
      ])
    ).folder;
  }

  if (!script) {
    const scriptFolders = fs
      .readdirSync(path.join(scriptDir, project))
      .filter(
        (file) =>
          fs.lstatSync(path.join(scriptDir, project, file)).isDirectory() &&
          !file.startsWith(".") &&
          !file.startsWith("_") &&
          ![].includes(file)
      );

    script = (
      await inquirer.prompt([
        {
          type: "list",
          name: "func",
          message: "Select Script  ",
          choices: scriptFolders,
        },
      ])
    ).func;
  }

  const indexFilePath = path.join(scriptDir, project, script, "index.js");
  if (!fs.existsSync(indexFilePath)) {
    console.error(`Error: index.js not found in folder "${project}"`);
  } else {
    const args = [indexFilePath];
    if (process.argv[4]) {
      args.push(process.argv[4]);
    }
    spawn("node", args, { stdio: "inherit" });
  }
})(process.argv[2], process.argv[3]);
