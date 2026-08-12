"use strict";

/**
 * Project: DarkX Mini
 * Base / default configuration.
 *
 * The values below were filled in for you by the DarkX Bot Builder based
 * on what you entered on the website. You can still change most of them
 * any time from the web dashboard's Settings tab — that always wins over
 * these defaults for a number that's already linked.
 */

module.exports = {
    // --- BASIC BOT INFO ---
    // These come from your .env file, generated for you by the DarkX Bot
    // Builder. The fallbacks below only kick in if .env is ever missing.
    botName: process.env.BOT_NAME || "DarkX Mini",
    ownerName: process.env.OWNER_NAME || "Owner",
    ownerNumber: process.env.OWNER_NUMBER || "",
    prefix: process.env.PREFIX || ".",

    // --- SESSION LIMIT ---
    // How many WhatsApp numbers this build of the bot may have linked at
    // once. Single-Session downloads = 1. Multi-Session downloads = a
    // much higher number, set by the builder after payment is approved.
    maxSessions: parseInt(process.env.MAX_SESSIONS || "1", 10) || 1,

    // --- BOT MODES & BEHAVIOR ---
    privateMode: false, // when true, the bot only responds to its owner — everyone else is ignored

    // --- AUTO STATUS FEATURES ---
    autoViewStatus: true,
    autoReactStatus: true,
    statusEmojis: ["🔥", "💎", "💜", "❤️", "💙", "💚", "💖"],

    // --- AUTO CHAT FEATURES ---
    autoReadChat: false,
    autoReactChat: true,
    chatEmojis: ["😆", "😱", "😂", "🤫", "👍"],

    // --- AUTO PRESENCE FEATURES ---
    autoTyping: true,
    autoRecording: false,

    // --- VISUALS & METADATA ---
    version: "1.0.0",
    watermark: "DarkX Mini",
    footer: "© 2026 DarkX Mini",
    thumb: "https://telegra.ph/file/a0f3d45e45c71b6d05494.jpg",
    repoUrl: process.env.WEB_URL || process.env.RENDER_EXTERNAL_URL || "",

    // --- MESSAGES ---
    msg: {
        owner: "🚫 This command can only be used by the bot owner!",
        group: "👥 Sorry, this command only works in groups.",
        admin: "👮 This command requires you to be a group *Admin*.",
        botAdmin: "🤖 Please make me an *Admin* first so I can do this.",
        wait: "⏳ *DarkX Mini is processing...* Please wait.",
        error: "❌ *Error!* Something went wrong in the system.",
        private: "🔒 This bot is currently in *Private Mode* and only responds to its owner.",
    },
};
