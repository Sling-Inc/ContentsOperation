import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import inquirer from "inquirer";
import { exec } from "child_process";

const APPS = {};

/**
 * Initializes Firebase Admin SDK with selected project.
 * @param {"dev-giyoung" | "giyoung" | "emulator" | "orzo-contents"} [project]
 * @returns {Promise<{admin: admin.app.App, project: string}>}
 */
/* 동시에 여러 앱을 사용할 떄... 반드시 emulator를 맨 마지막에 호출하세요 감사합니다 */
export async function getFirebaseAdmin(project) {
  if (!project)
    project = (
      await inquirer.prompt([
        {
          type: "list",
          name: "project",
          message: "[Firestore] Select a Project:",
          choices: ["dev-giyoung", "giyoung"],
        },
      ])
    ).project;
  else {
    const { proceed } = await inquirer.prompt([
      {
        type: "confirm",
        name: "proceed",
        message: `Do you want to proceed? project: ${project}`,
      },
    ]);

    if (!proceed) {
      process.exit(1);
    }
  }

  if (project === "emulator") {
    process.env.FIRESTORE_EMULATOR_HOST = "localhost:28080";
    process.env.FIREBASE_STORAGE_EMULATOR_HOST = "localhost:29199";
  }

  if (APPS[project])
    return {
      admin: APPS[project],
      project: project,
    };

  const app = admin.initializeApp(
    {
      projectId: project,
      storageBucket: `${project}.appspot.com`,
    },
    project
  );

  APPS[project] = app;

  return { admin: app, project };
}

export async function checkFirebaseCredentials() {
  const credentialsPath = path.join(
    process.env.HOME || process.env.USERPROFILE,
    ".config/gcloud/application_default_credentials.json"
  );

  if (!fs.existsSync(credentialsPath)) {
    console.error("Error: Application Default Credentials not found.");

    const { shouldLogin } = await inquirer.prompt([
      {
        type: "confirm",
        name: "shouldLogin",
        message:
          "Credentials not found. Do you want to log in now with `gcloud auth application-default login`?",
        default: true,
      },
    ]);

    if (shouldLogin) {
      console.log("Logging in with `gcloud auth application-default login`...");
      return new Promise((resolve, reject) => {
        exec(
          "gcloud auth application-default login",
          (error, stdout, stderr) => {
            if (error) {
              console.error(`Error: ${error.message}`);
              reject(new Error("Authentication failed."));
            }
            if (stderr) {
              const message = stderr.toString();
              if (!message.includes("Your browser has been opened to visit:")) {
                console.error(`Error: ${message}`);
              }
            }
            console.log(stdout);
            console.log("Authentication complete.");
            resolve();
          }
        );
      });
    } else {
      console.log(
        "Please authenticate manually with: gcloud auth application-default login"
      );
      process.exit(1);
    }
  }
}
