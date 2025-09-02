import { exec } from "child_process";
import path from "path";
import fs from "fs";
import {
  existsFile,
  readDirectories,
  readFilesWithExt,
} from "#operation/utils/file.js";

/**
 * 주어진 MP3 파일을 무음 구간을 기준으로 여러 개의 개별 파일로 분할합니다.
 * 무음 구간은 이전 오디오 클립에 포함되며, 분할 지점을 무음 끝에서 약간 앞당길 수 있습니다.
 * 특정 인덱스의 분할 지점을 건너뛰어 이전 클립과 합칠 수 있습니다.
 * 또한, 파일의 시작 부분에서 지정된 시간만큼 건너뛸 수 있습니다.
 *
 * @param {object} options - 분할 옵션 객체
 * @param {string} options.inputFileName - 자를 MP3 파일의 이름 (경로 포함 가능)
 * @param {string} [options.outputPrefix='output_track'] - 출력 파일 이름의 접두사 (예: output_track_01.mp3)
 * @param {string} [options.silenceThreshold='-30dB'] - 무음 임계값 (값이 더 작아질수록 엄격한 무음을 의미)
 * @param {string} [options.minSilenceDuration='1'] - 최소 무음 지속 시간 (초)
 * @param {string} [options.outputDirectory='./cut_audios'] - 잘린 파일이 저장될 폴더 (없으면 생성됨)
 * @param {number[]} [options.skipSplitAtIndexes=[]] - 분할을 건너뛸 무음 구간의 0-based 인덱스 배열 (예: [15]는 16번째 파일 분할 건너뜀)
 * @param {number} [options.trimBeforeSilenceEnd=0] - 무음 구간의 끝에서 얼마나 앞에서 자를지 (초 단위, 기본값: 0)
 * @param {number} [options.skipStartSeconds=0] - 파일 시작 부분에서 건너뛸 시간 (초 단위, 기본값: 0)
 * @returns {Promise<string[]>} - 생성된 파일 경로들의 배열을 포함하는 Promise
 */
async function splitAudioBySilence(options) {
  const {
    inputFileName,
    outputPrefix = "output_track",
    silenceThreshold = "-30dB",
    minSilenceDuration = "1",
    outputDirectory = "./cut_audios",
    skipSplitAtIndexes = [],
    trimBeforeSilenceEnd = 0,
    skipStartSeconds = 0,
  } = options;

  const inputPath = path.resolve(inputFileName);
  const outputPath = path.resolve(outputDirectory);

  // 출력 디렉토리 생성 (없으면)
  if (!fs.existsSync(outputPath)) {
    fs.mkdirSync(outputPath, { recursive: true });
    console.log(`Created output directory: ${outputPath}`);
  }

  console.log(`\n--- Starting audio split for: ${inputFileName} ---`);
  console.log(`Output will be saved in: ${outputPath}`);
  if (skipStartSeconds > 0) {
    console.log(
      `Skipping first ${skipStartSeconds} seconds of the input file.`
    );
  }

  // 1. 무음 구간 감지 및 타임스탬프 추출
  const detectSilenceCommand = `ffmpeg -ss ${skipStartSeconds} -i "${inputPath}" -af "silencedetect=noise=${silenceThreshold}:d=${minSilenceDuration}" -f null - 2>&1 | grep "silence_start\\|silence_end"`;

  let silenceLog;
  try {
    const { stdout } = await new Promise((resolve, reject) => {
      exec(detectSilenceCommand, (error, stdout, stderr) => {
        if (error) {
          console.error(`FFmpeg stderr during detection: ${stderr}`);
          return reject(new Error(`Error detecting silence: ${error.message}`));
        }
        resolve({ stdout, stderr });
      });
    });
    silenceLog = stdout;
  } catch (error) {
    console.error(error.message);
    throw error;
  }

  const starts = [];
  const ends = [];

  silenceLog.split("\n").forEach((line) => {
    if (line.includes("silence_start:")) {
      const match = line.match(/silence_start: (\d+\.\d+)/);
      if (match) {
        // 감지된 시간은 -ss 이후의 시간 기준이므로, 원본 파일 기준으로 변환
        starts.push(parseFloat(match[1]) + skipStartSeconds);
      }
    } else if (line.includes("silence_end:")) {
      const match = line.match(/silence_end: (\d+\.\d+)/);
      if (match) {
        // 감지된 시간은 -ss 이후의 시간 기준이므로, 원본 파일 기준으로 변환
        ends.push(parseFloat(match[1]) + skipStartSeconds);
      }
    }
  });

  console.log(
    `Detected ${starts.length} silence starts and ${ends.length} silence ends.`
  );

  // 원본 오디오 파일의 총 길이 얻기
  const getDurationCommand = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${inputPath}"`;
  let totalDuration;

  try {
    let durationStdoutString;
    const { stdout: execStdout } = await new Promise((resolve, reject) => {
      exec(getDurationCommand, (error, stdout, stderr) => {
        if (error) {
          console.error(`FFprobe stderr: ${stderr}`);
          return reject(new Error(`Error getting duration: ${error.message}`));
        }
        resolve({ stdout: stdout.trim() });
      });
    });
    durationStdoutString = execStdout.stdout;
    totalDuration = parseFloat(durationStdoutString);
    console.log(`Total audio duration: ${totalDuration.toFixed(2)} seconds`);
  } catch (error) {
    console.error(error.message);
    throw new Error(
      "Failed to get total audio duration. FFprobe might not be installed or input file is invalid."
    );
  }

  // 2. 파싱된 시간을 기반으로 파일 분할
  let prevClipStartTime = skipStartSeconds;
  let trackNum = 1;
  const createdFiles = [];
  const splitPromises = [];

  // 각 무음 구간의 끝을 기준으로 이전 클립을 자릅니다.
  for (let i = 0; i < ends.length; i++) {
    // 현재 분할 지점 인덱스가 건너뛰어야 할 인덱스인지 확인
    if (skipSplitAtIndexes.includes(i)) {
      console.log(
        `Skipping split at silence end index ${i} (will merge previous segment).`
      );
      continue;
    }

    const currentSilenceEndTime = ends[i];

    let splitPoint = currentSilenceEndTime - trimBeforeSilenceEnd;
    splitPoint = Math.max(prevClipStartTime, splitPoint);
    splitPoint = Math.max(0, splitPoint);

    const outputFileName = `${outputPrefix}${String(trackNum)}.mp3`;

    const outputFilePath = path.join(outputPath, outputFileName);

    const splitCommand = `ffmpeg -i "${inputPath}" -ss ${prevClipStartTime} -to ${splitPoint} -c:a copy "${outputFilePath}"`;

    const promise = new Promise((resolve, reject) => {
      exec(splitCommand, (splitError, splitStdout, splitStderr) => {
        if (splitError) {
          console.error(`FFmpeg stderr during split: ${splitStderr}`);
          return reject(
            new Error(
              `Error splitting file ${outputFileName}: ${splitError.message}`
            )
          );
        }
        console.log(
          `✔ Created: ${outputFileName} (from ${prevClipStartTime.toFixed(
            2
          )} to ${splitPoint.toFixed(2)})`
        );
        createdFiles.push(outputFilePath);
        resolve();
      });
    });
    splitPromises.push(promise);
    trackNum++;

    // --- 이 부분이 수정되었습니다: 다음 클립 시작 시간을 splitPoint로 설정 ---
    prevClipStartTime = splitPoint; // 다음 클립은 현재 클립이 끝난 지점부터 시작
    // --- 수정 끝 ---
  }

  // 마지막으로 분할되지 않고 남은 오디오를 하나의 파일로 처리
  // (모든 무음 구간을 순회한 후 남은 부분, 또는 skipSplitAtIndexes 때문에 남은 부분)
  // 이 부분은 마지막 클립이 totalDuration까지 잘려야 하므로, prevClipStartTime이 totalDuration을 넘지 않게 조정합니다.
  if (prevClipStartTime < totalDuration) {
    const finalOutputFileName = `${outputPrefix}${String(trackNum)}.mp3`;
    const finalOutputFilePath = path.join(outputPath, finalOutputFileName);

    const finalSplitCommand = `ffmpeg -i "${inputPath}" -ss ${prevClipStartTime} -to ${totalDuration} -c:a copy "${finalOutputFilePath}"`;

    const finalPromise = new Promise((resolve, reject) => {
      exec(finalSplitCommand, (splitError, splitStdout, splitStderr) => {
        if (splitError) {
          console.error(`FFmpeg stderr during final split: ${splitStderr}`);
          return reject(
            new Error(
              `Error splitting final file ${finalOutputFileName}: ${splitError.message}`
            )
          );
        }
        console.log(
          `✔ Created: ${finalOutputFileName} (from ${prevClipStartTime.toFixed(
            2
          )} to end)`
        );
        createdFiles.push(finalOutputFilePath);
        resolve();
      });
    });
    splitPromises.push(finalPromise);
  }

  await Promise.all(splitPromises);

  console.log(
    `\n--- All audio segments successfully split for ${inputFileName}! ---`
  );
  return createdFiles;
}

const DEFAULT_CONFIG = {
  outputPrefix: "",
  silenceThreshold: "-30dB",
  minSilenceDuration: "4",
  skipSplitAtIndexes: [15],
  trimBeforeSilenceEnd: 1,
  skipStartSeconds: 138.5,
};

async function audioCuttor(
  audioFilePath,
  outputPath,
  config = {
    outputPrefix: "",
    silenceThreshold: "-30dB",
    minSilenceDuration: "4",
    skipSplitAtIndexes: [15],
    trimBeforeSilenceEnd: 1,
    skipStartSeconds: 138.5,
  }
) {
  if (!fs.existsSync(outputPath)) {
    fs.mkdirSync(outputPath, { recursive: true });
  }

  try {
    const createdFiles = await splitAudioBySilence({
      ...DEFAULT_CONFIG,
      ...config,
      inputFileName: audioFilePath,
      outputDirectory: outputPath,
    });
    console.log("\n--- Final Result ---");
    console.log("Successfully split into files:");
    createdFiles.forEach((file) => console.log(`- ${file}`));
  } catch (error) {
    console.error("\n--- Splitting failed! ---");
    console.error(error);
  }
}

const CONFIGS = {};

export async function F002_cutEnglishAudio(TARGET_DIR, AUDIO_DIR) {
  const dirs = (await readDirectories(TARGET_DIR)).filter(
    (dir) => dir.includes("영어") && dir.includes("problem")
  );

  for (const dir of dirs) {
    const [type, year, month, grade, supervisor, section, subject] =
      dir.split("_");

    const audioFile = path.join(
      AUDIO_DIR,
      `${year}_${month}_${grade}_${supervisor}_${section}.mp3`
    );

    if (!existsFile(audioFile)) {
      console.log(`${audioFile} not found`);
      continue;
    }

    const config = CONFIGS[dir];

    const destDir = path.join(TARGET_DIR, dir, "default", "audio");

    // 기존 디렉토리 삭제
    if (fs.existsSync(destDir)) {
      fs.rmdirSync(destDir, {
        recursive: true,
      });
    }

    await audioCuttor(audioFile, destDir, config);
  }
}
