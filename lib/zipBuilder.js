"use strict";

const fs = require("fs-extra");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const archiver = require("archiver");

const TEMPLATE_DIR = path.join(__dirname, "..", "bot-template");

/**
 * Turns free-text user input into a value that's safe to drop into a
 * .env file (no newlines that would break other keys, no surrounding
 * quotes needed since we strip characters dotenv would choke on).
 */
function sanitizeEnvValue(value) {
    return String(value ?? "")
        .replace(/[\r\n]+/g, " ")
        .trim();
}

function buildEnvFile({ botName, ownerName, ownerNumber, mongoUri, prefix, maxSessions }) {
    const lines = [
        `BOT_NAME=${sanitizeEnvValue(botName) || "DarkX Mini"}`,
        `OWNER_NAME=${sanitizeEnvValue(ownerName) || "Owner"}`,
        `OWNER_NUMBER=${sanitizeEnvValue(ownerNumber).replace(/[^0-9]/g, "")}`,
        `PREFIX=${sanitizeEnvValue(prefix) || "."}`,
        `MAX_SESSIONS=${parseInt(maxSessions, 10) || 1}`,
        `MONGODB_URI=${sanitizeEnvValue(mongoUri)}`,
        `PORT=3000`,
        "",
    ];
    return lines.join("\n");
}

/**
 * Builds a fully-configured DarkX Mini bot zip on disk and returns its path.
 * Caller is responsible for deleting the returned file (and its parent temp
 * dir) once it's done streaming it to the user.
 */
async function buildBotZip(details) {
    const workId = crypto.randomBytes(8).toString("hex");
    const workDir = path.join(os.tmpdir(), `darkx-mini-${workId}`);
    const zipPath = path.join(os.tmpdir(), `darkx-mini-${workId}.zip`);

    await fs.copy(TEMPLATE_DIR, workDir);

    const envContent = buildEnvFile(details);
    await fs.writeFile(path.join(workDir, ".env"), envContent, "utf-8");

    await new Promise((resolve, reject) => {
        const output = fs.createWriteStream(zipPath);
        const archive = archiver("zip", { zlib: { level: 9 } });

        output.on("close", resolve);
        archive.on("error", reject);

        archive.pipe(output);
        archive.directory(workDir, "DarkX-Mini");
        archive.finalize();
    });

    // The zip is already written to disk; the working copy isn't needed anymore.
    await fs.remove(workDir);

    return zipPath;
}

module.exports = { buildBotZip, sanitizeEnvValue };
