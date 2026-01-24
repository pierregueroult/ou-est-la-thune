const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

const CURRENT_LOG_LEVEL = LOG_LEVELS.INFO;

function formatTimestamp() {
  return new Date().toISOString();
}

function log(level, context, message, data = null) {
  if (LOG_LEVELS[level] < CURRENT_LOG_LEVEL) {
    return;
  }

  const timestamp = formatTimestamp();
  const prefix = `[${timestamp}] [${level}] [${context}]`;

  if (data !== null) {
    console.log(`${prefix} ${message}`, data);
  } else {
    console.log(`${prefix} ${message}`);
  }
}

function debug(context, message, data = null) {
  log("DEBUG", context, message, data);
}

function info(context, message, data = null) {
  log("INFO", context, message, data);
}

function warn(context, message, data = null) {
  log("WARN", context, message, data);
}

function error(context, message, data = null) {
  log("ERROR", context, message, data);
}

function startTransform(transformerName, inputFiles) {
  const fileList = Array.isArray(inputFiles) ? inputFiles : [inputFiles];
  info(transformerName, `Starting transformation with input files: ${fileList.join(", ")}`);
}

function endTransform(transformerName, outputFiles, duration = null) {
  const fileList = Array.isArray(outputFiles) ? outputFiles : [outputFiles];
  const durationMsg = duration !== null ? ` (duration: ${duration}ms)` : "";
  info(transformerName, `Transformation completed. Generated files: ${fileList.join(", ")}${durationMsg}`);
}

function progress(context, current, total, message = "items processed") {
  if (total > 0) {
    const percentage = ((current / total) * 100).toFixed(1);
    info(context, `Progress: ${current}/${total} ${message} (${percentage}%)`);
  } else {
    info(context, `Progress: ${current} ${message}`);
  }
}

function progressIncremental(context, current, increment = 1000, message = "items processed") {
  if (current % increment === 0) {
    info(context, `Progress: ${current} ${message}`);
  }
}

function stepInfo(context, step, message) {
  info(context, `Step ${step}: ${message}`);
}

function stat(context, label, value) {
  info(context, `${label}: ${value}`);
}

module.exports = {
  LOG_LEVELS,
  debug,
  info,
  warn,
  error,
  startTransform,
  endTransform,
  progress,
  progressIncremental,
  stepInfo,
  stat,
};
