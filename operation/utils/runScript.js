import inquirer from "inquirer";
import { Logger } from "./logger.js";

/**
 * @param {string} __dirname
 * @param {any} choices
 * @param {((arg0: any) => any)} func
 */
export async function RunScript(__dirname, choices, func) {
  try {
    const argv = process.argv[2];
    let choice = argv ? choices[argv] : undefined;

    if (!choice) {
      const choiceValues = Object.values(choices);
      const { choice: promptChoice } = await inquirer.prompt([
        {
          type: "list",
          name: "choice",
          message: "Select Function",
          choices: choiceValues,
        },
      ]);
      choice = promptChoice;
    }

    Logger.setLogFilePath(__dirname, choice);
    await Logger.notice(`함수를 실행합니다... : ${choice}`);

    await func(choice);

    await Logger.notice(`스크립트를 종료합니다...: ${choice}`);
    Logger.close();
    setTimeout(() => process.exit(0), 100);
  } catch (e) {
    await Logger.error(`Error:\n${e}\n\nStack Trace:\n${e.stack}`);
    Logger.close();
    setTimeout(() => process.exit(0), 100);
  }
}
