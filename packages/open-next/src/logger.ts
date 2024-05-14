import chalk from "chalk";

export type LEVEL = "info" | "debug" | "warn" | "error";

let logLevel: LEVEL = "error";

export default {
  setLevel: (level: LEVEL) => (logLevel = level),
  debug: (...args: any[]) => {
    if (logLevel !== "debug") return;
    console.log(chalk.magenta("DEBUG"), ...args);
  },
  info: (...args: any[]) => {
    if (logLevel === "warn" || logLevel === "error") return;
    return console.log(...args);
  },
  warn: (...args: any[]) => {
    if (logLevel === "error") return;
    return console.warn(chalk.yellow("WARN"), ...args);
  },
  error: (...args: any[]) => {
    return console.error(chalk.red("ERROR"), ...args);
  },
};
