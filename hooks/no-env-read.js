import * as path from "path";

async function readInput() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString());
}

function isEnvPath(filePath) {
  if (!filePath) return false;
  const basename = path.basename(filePath);
  // Match .env, .env.local, .env.production, etc.
  return /^\.env(\..+)?$/.test(basename);
}

async function main() {
  const input = await readInput();

  // Read tool uses file_path; Grep tool uses path
  const target = input.tool_input?.file_path || input.tool_input?.path;

  if (isEnvPath(target)) {
    console.error(`Blocked: reading env files is not allowed (${target})`);
    process.exit(2);
  }
}

main();
