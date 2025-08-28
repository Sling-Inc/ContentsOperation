import fs from "fs";
import path from "path";

const COLORS = {
  RESET: "\x1b[0m",
  BLACK: "\x1b[30m",
  RED: "\x1b[31m",
  YELLOW: "\x1b[33m",
  BLUE: "\x1b[34m",
  MAGENTA: "\x1b[35m",
  CYAN: "\x1b[36m",
  WHITE: "\x1b[37m",

  ORANGE: "\x1b[38;2;255;165;0m",
  TEAL: "\x1b[38;2;0;128;128m",
  PINK: "\x1b[38;2;255;105;180m",
  SKY_BLUE: "\x1b[38;2;135;206;235m",
  PURPLE: "\x1b[38;2;138;43;226m",
  LIGHT_GRAY: "\x1b[38;2;195;195;195m",
  DARK_GRAY: "\x1b[38;2;105;105;105m",

  DARK_GREEN: "\x1b[38;2;0;100;0m",
  DEEP_GREEN: "\x1b[38;2;0;70;0m",
  FOREST_GREEN: "\x1b[38;2;34;139;34m",
  LIME_GREEN: "\x1b[38;2;50;205;50m",
  LIGHT_GREEN: "\x1b[38;2;144;238;144m",
  MINT_GREEN: "\x1b[38;2;152;255;152m",
  PALE_GREEN: "\x1b[38;2;200;255;200m",
};

const levels = {
  error: { method: "error", color: COLORS.RED },
  warn: { method: "warn", color: COLORS.ORANGE },
  notice: { method: "info", color: COLORS.YELLOW },
  info: { method: "info", color: COLORS.BLUE },
  debug: { method: "debug", color: COLORS.DARK_GRAY },
  section: {
    method: "info",
    color: [
      COLORS.DARK_GREEN,
      COLORS.DEEP_GREEN,
      COLORS.FOREST_GREEN,
      COLORS.LIME_GREEN,
      COLORS.LIGHT_GREEN,
      COLORS.MINT_GREEN,
      COLORS.PALE_GREEN,
    ],
  },

  log: { method: "log", color: COLORS.WHITE },
};

/**
 * @typedef {"error" | "warn" | "notice" | "info" | "debug" | "section" | "log"} LogLevel
 */

export class ScriptLogger {
  /**
   * @param {string} logPath
   */
  constructor(logPath = undefined) {
    if (logPath) this.setLogFilePath(logPath);
    this.__writeQueue = [];
    this.__isWriting = false;
    this.__indent_level = 0;
    this.__indent = " ".repeat(4);
  }

  /**
   * @param {LogLevel} level
   * @returns {{method: string, color: string}}
   */
  __getLogInfo(level) {
    return level === "section"
      ? {
          ...levels[level],
          color:
            levels.section.color[
              Math.min(this.__indent_level, levels.section.color.length - 1)
            ],
        }
      : levels[level] || levels.log;
  }

  /**
   * @param {string} logPath
   * @param {string} [logName]
   */
  setLogFilePath(logPath, logName) {
    this.__logPath = path.join(logPath, "__logs");

    if (!fs.existsSync(this.__logPath)) {
      fs.mkdirSync(this.__logPath, { recursive: true });
    }

    const safeLogName = logName ? logName.replace(/\s+/g, "_") : "";
    const logFileName = `${this.__getCurrent()}${
      safeLogName ? `_${safeLogName}` : ""
    }.log`;
    const logFilePath = path.join(this.__logPath, logFileName);

    this.__logStream = fs.createWriteStream(logFilePath, {
      flags: "a",
      highWaterMark: 64 * 1024, // 64KB
      encoding: "utf8",
    });

    const warnLogFileName = `${this.__getCurrent()}_warn${
      safeLogName ? `_${safeLogName}` : ""
    }.log`;
    const warnLogFilePath = path.join(this.__logPath, warnLogFileName);

    this.__logStream_we = fs.createWriteStream(warnLogFilePath, {
      flags: "a",
      highWaterMark: 64 * 1024, // 64KB
      encoding: "utf8",
    });
  }

  __getCurrent() {
    return new Date().toISOString().replace("T", "_").replace("Z", "");
  }

  /**
   * @param {any} msg
   * @param {LogLevel} level
   * @param {number} [depth]
   */
  log(msg, level = "log", depth = 0, header = true) {
    const { method, color } = this.__getLogInfo(level);

    let message = "";

    if (header) {
      message = `[${this.__getCurrent()}][${level
        .toUpperCase()
        .padEnd(7)}]${this.__indent.repeat(
        depth + this.__indent_level
      )} ${msg}`;
    } else {
      message = `${msg}`;
    }

    console[method](`${color}%s\x1b[0m`, message);

    if (this.__logStream) {
      this.__writeQueue.push({ message, level });
      this.__processQueue();
    }
  }

  /**
   * @param {any} msg
   */
  error(msg, header = true) {
    this.log(msg, "error", 0, header);
  }
  /**
   * @param {any} msg
   */
  warn(msg, header = true) {
    this.log(msg, "warn", 0, header);
  }
  /**
   * @param {any} msg
   */
  notice(msg, header = true) {
    this.log(msg, "notice", 0, header);
  }
  /**
   * @param {any} msg
   */
  info(msg, header = true) {
    this.log(msg, "info", 0, header);
  }
  /**
   * @param {any} msg
   */
  debug(msg, header = true) {
    this.log(msg, "debug", 0, header);
  }

  /**
   * @param {any} msg
   * @param {LogLevel} level
   */
  section(msg, level = "section") {
    this.log(msg, level);
    this.__indent_level++;
  }

  /**
   * @param {any} msg
   * @param {LogLevel} level
   */
  endSection(msg, level = "section") {
    if (this.__indent_level > 0) this.__indent_level--;
    if (msg) {
      this.log(msg, level);
    }
  }

  __processQueue() {
    if (this.__isWriting || this.__writeQueue.length === 0) return;

    this.__isWriting = true;
    const { message, level } = this.__writeQueue[0];

    const canWrite = this.__logStream.write(message + "\n");
    if (!canWrite) {
      this.__logStream.once("drain", () => {
        if (level === "warn" || (level === "error" && this.__logStream_we)) {
          const canWriteWarn = this.__logStream_we.write(message + "\n");
          if (!canWriteWarn) {
            this.__logStream_we.once("drain", () => {
              this.__writeQueue.shift();
              this.__isWriting = false;
              this.__processQueue();
            });
          } else {
            this.__writeQueue.shift();
            this.__isWriting = false;
            this.__processQueue();
          }
        } else {
          this.__writeQueue.shift();
          this.__isWriting = false;
          this.__processQueue();
        }
      });
    } else {
      if (level === "warn" || (level === "error" && this.__logStream_we)) {
        const canWriteWarn = this.__logStream_we.write(message + "\n");
        if (!canWriteWarn) {
          this.__logStream_we.once("drain", () => {
            this.__writeQueue.shift();
            this.__isWriting = false;
            this.__processQueue();
          });
        } else {
          this.__writeQueue.shift();
          this.__isWriting = false;
          this.__processQueue();
        }
      } else {
        this.__writeQueue.shift();
        this.__isWriting = false;
        this.__processQueue();
      }
    }
  }

  close() {
    if (this.__logStream) {
      this.__logStream.end();
      this.__logStream = null;
    }
    if (this.__logStream_we) {
      this.__logStream_we.end();
      this.__logStream_we = null;
    }
  }
}

export const Logger = new ScriptLogger();
