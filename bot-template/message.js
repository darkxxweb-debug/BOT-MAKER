"use strict";

/**
 * Central command router — simplified core for DarkX Mini.
 * Runs for every incoming message. Loads this session's own settings
 * (owner number, prefix, bot name) merged over the base defaults, then
 * dispatches to whichever of the 3 built-in plugins matches the typed
 * command: .ping, .play, .vv2
 */

const fs = require("fs");
const path = require("path");
const chalk = require("chalk");
const baseConfig = require("./settings/config");
const { getSettings } = require("./library/settingsStore");

module.exports = async (sock, m, chatUpdate) => {
    try {
        const { chat, sender, body, pushName, fromMe } = m;
        if (!chat) return;

        // --- Per-number settings, merged over the base defaults ---
        const sessionId = sock.sessionId || sender?.split("@")[0] || "default";
        const settings = getSettings(sessionId);
        const config = { ...baseConfig, ...settings };

        const prefix = config.prefix || ".";
        const isCmd = typeof body === "string" && body.startsWith(prefix);
        const command = isCmd ? body.slice(prefix.length).trim().split(/ +/).shift().toLowerCase() : "";
        const args = typeof body === "string" ? body.trim().split(/ +/).slice(1) : [];
        const text = args.join(" ");
        const q = text;

        if (fromMe && !isCmd) return;
        if (!body) return;
        if (!isCmd || !command) return;

        // --- Group metadata / permissions ---
        const isGroup = chat.endsWith("@g.us");
        const botId = sock.user.id.split(":")[0] + "@s.whatsapp.net";

        let groupMetadata, participants, groupAdmins, isAdmin, isBotAdmin;
        if (isGroup) {
            groupMetadata = await sock.groupMetadata(chat).catch(() => null);
            if (groupMetadata) {
                participants = groupMetadata.participants || [];
                groupAdmins = participants.filter((v) => v.admin !== null).map((v) => v.id);
                isAdmin = groupAdmins.includes(sender);
                isBotAdmin = groupAdmins.includes(botId);
            }
        }

        const ownerJid = (config.ownerNumber || "").replace(/[^0-9]/g, "") + "@s.whatsapp.net";
        const isOwner = fromMe || [ownerJid, botId].includes(sender);

        const reply = (teks) => sock.sendMessage(chat, { text: teks }, { quoted: m });

        // --- Private Mode: bot only obeys its owner, everyone else is ignored ---
        if (config.privateMode && !isOwner) {
            return reply(config.msg?.private || "🔒 This bot is in Private Mode.");
        }

        // --- Media / quoted helpers passed down to plugins ---
        const mime = m.msg?.mimetype || m.quoted?.mimetype || null;
        const isMedia = !!mime;

        // --- Plugin engine: only 3 plugins live in /plugins, so this is fast ---
        const pluginFolder = path.join(__dirname, "plugins");
        if (!fs.existsSync(pluginFolder)) return;

        const pluginFiles = fs.readdirSync(pluginFolder).filter((file) => file.endsWith(".js"));

        for (const file of pluginFiles) {
            try {
                const filePath = path.join(pluginFolder, file);
                delete require.cache[require.resolve(filePath)];
                const plugin = require(filePath);

                const cmdMatch = Array.isArray(plugin.command)
                    ? plugin.command.some((c) => c.toLowerCase() === command)
                    : plugin.command?.toLowerCase() === command;

                if (!cmdMatch) continue;

                if (plugin.isOwner && !isOwner) return reply(config.msg?.owner || "Owner only!");
                if (plugin.isGroup && !isGroup) return reply(config.msg?.group || "Group only!");
                if (plugin.isAdmin && !isAdmin && !isOwner) return reply(config.msg?.admin || "Admin only!");
                if (plugin.isBotAdmin && !isBotAdmin) return reply(config.msg?.botAdmin || "Make me admin!");

                await plugin.execute(sock, m, {
                    args, text, q, reply, config, chatUpdate, isGroup,
                    isAdmin, isBotAdmin, isOwner, participants, groupMetadata,
                    pushName, command, prefix, mime, isMedia, quoted: m.quoted,
                    sender, sessionId,
                });
                return;
            } catch (err) {
                console.error(chalk.red(`[PLUGIN ERROR] ${file}:`), err.message);
                continue;
            }
        }
    } catch (err) {
        console.error(chalk.red("CRITICAL ERROR in message.js:"), err);
    }
};
