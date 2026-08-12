"use strict";

/**
 * Project: DarkX Mini
 * Owner: MrX Dev
 *
 * Multi-device session engine — simplified core.
 * Each paired phone number gets its own Baileys socket + its own auth
 * saved in MongoDB, so multiple numbers can be connected at once (each
 * with its own settings). Only 3 commands ship with this bot: .ping,
 * .play, .vv2 — see /plugins.
 */

const pino = require('pino');
const chalkImport = require('chalk');
const chalk = chalkImport.default || chalkImport;

const config = require('./settings/config');
const { smsg } = require('./library/serialize');
const { getSettings } = require('./library/settingsStore');
const { useMongoAuthState, removeMongoSession, mongoSessionExists, listMongoSessionIds } = require('./library/mongoAuthState');
const { toBold, toSmallCaps, toBoldItalic } = require('./library/function');

process.on('uncaughtException', (err) => {
    console.error(chalk.red('CRITICAL ERROR (Uncaught Exception):'), err);
});

process.on('unhandledRejection', (reason) => {
    console.error(chalk.red('CRITICAL ERROR (Unhandled Rejection):'), reason);
});

// --- Dynamic Baileys import (loaded once, reused for every session) ---
let makeWASocket,
    Browsers,
    DisconnectReason,
    fetchLatestBaileysVersion,
    jidDecode,
    delay,
    makeCacheableSignalKeyStore;

let baileysReady = null;
const loadBaileys = () => {
    if (!baileysReady) {
        baileysReady = import('@whiskeysockets/baileys').then((baileys) => {
            makeWASocket =
                typeof baileys.default === 'function'
                    ? baileys.default
                    : typeof baileys.makeWASocket === 'function'
                    ? baileys.makeWASocket
                    : typeof baileys.default?.default === 'function'
                    ? baileys.default.default
                    : null;

            if (typeof makeWASocket !== 'function') {
                throw new Error(
                    'makeWASocket was not found in @whiskeysockets/baileys. Check the installed version in package.json.'
                );
            }

            Browsers = baileys.Browsers || baileys.default?.Browsers;
            DisconnectReason = baileys.DisconnectReason || baileys.default?.DisconnectReason;
            fetchLatestBaileysVersion = baileys.fetchLatestBaileysVersion || baileys.default?.fetchLatestBaileysVersion;
            jidDecode = baileys.jidDecode || baileys.default?.jidDecode;
            delay = baileys.delay || baileys.default?.delay;
            makeCacheableSignalKeyStore = baileys.makeCacheableSignalKeyStore || baileys.default?.makeCacheableSignalKeyStore;

            const missing = [];
            if (!Browsers) missing.push('Browsers');
            if (!DisconnectReason) missing.push('DisconnectReason');
            if (!fetchLatestBaileysVersion) missing.push('fetchLatestBaileysVersion');
            if (!jidDecode) missing.push('jidDecode');
            if (!delay) missing.push('delay');
            if (!makeCacheableSignalKeyStore) missing.push('makeCacheableSignalKeyStore');

            if (missing.length) {
                throw new Error(`Missing Baileys exports: ${missing.join(', ')}`);
            }
        }).catch((e) => {
            console.error(chalk.red('Failed to load Baileys library:'), e);
            process.exit(1);
        });
    }
    return baileysReady;
};

const activeSockets = {};
const reconnectAttempts = {}; // sessionId -> consecutive failed-reconnect count

function decodeJidFactory() {
    return (jid) => {
        if (!jid) return jid;
        if (/:\d+@/gi.test(jid)) {
            let decode = jidDecode(jid) || {};
            return (decode.user && decode.server && decode.user + '@' + decode.server) || jid;
        }
        return jid;
    };
}

/**
 * Sends a stylish "bot connected" notification straight to the owner's
 * own WhatsApp, the moment their session comes online. Uses unicode
 * bold + small-caps for a "kali" (eye-catching) look with no external
 * fonts — plain WhatsApp text renders it perfectly on every device.
 */
async function sendConnectedMessage(sock, sessionId, sessionSettings) {
    try {
        const ownerNumber = (sessionSettings.ownerNumber || sessionId).replace(/[^0-9]/g, '');
        const ownerJid = ownerNumber + '@s.whatsapp.net';
        const botName = sessionSettings.botName || config.botName;
        const now = new Date();

        const text =
            `『 ${toBold('DARKX MINI')} 』\n` +
            `━━━━━━━━━━━━━━━━━━━\n` +
            `✅ ${toBold('CONNECTED SUCCESSFULLY')}\n` +
            `━━━━━━━━━━━━━━━━━━━\n` +
            `👑 ${toSmallCaps('bot name')} : ${botName}\n` +
            `📱 ${toSmallCaps('number')}   : ${ownerNumber}\n` +
            `📅 ${toSmallCaps('date')}     : ${now.toLocaleDateString()}\n` +
            `⏰ ${toSmallCaps('time')}     : ${now.toLocaleTimeString()}\n` +
            `━━━━━━━━━━━━━━━━━━━\n` +
            `🧩 ${toSmallCaps('commands')} : .ping  .play  .vv2\n` +
            `━━━━━━━━━━━━━━━━━━━\n` +
            `_${toBoldItalicSafe('Your bot is online and ready to work.')}_\n` +
            `Powered by ${config.watermark} 🔥`;

        await sock.sendMessage(ownerJid, {
            text,
            contextInfo: {
                forwardingScore: 999,
                isForwarded: true,
                externalAdReply: {
                    title: 'DARKX MINI 👑',
                    body: 'Connected Successfully',
                    thumbnailUrl: config.thumb,
                    sourceUrl: config.repoUrl,
                    mediaType: 1,
                    renderLargerThumbnail: false,
                },
            },
        });
    } catch (err) {
        console.error(chalk.red('Failed to send connected message:'), err.message);
    }
}

function toBoldItalicSafe(text) {
    try {
        return toBoldItalic(text);
    } catch {
        return text;
    }
}

/**
 * Starts (or resumes) a WhatsApp session for the given phone number.
 * @param {string} number  Phone number (digits only) used as the session id.
 * @param {object} io      socket.io server, used to relay pairing codes / status to the web UI (optional).
 * @param {function} onPairingCode  Optional callback fired with the pairing code once generated.
 */
async function startBot(number, io, onPairingCode) {
    await loadBaileys();

    const sessionId = String(number).replace(/[^0-9]/g, '');

    const { state, saveCreds } = await useMongoAuthState(sessionId);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
        },
        version,
        browser: Browsers.ubuntu('Chrome'),
        markOnlineOnConnect: true,
        generateHighQualityLinkPreview: true,
        getMessage: async () => undefined,
        keepAliveIntervalMs: 20_000,
        connectTimeoutMs: 60_000,
        defaultQueryTimeoutMs: 60_000,
        qrTimeout: 60_000,
        emitOwnEvents: true,
        retryRequestDelayMs: 2_000,
        maxMsgRetryCount: 5,
    });

    activeSockets[sessionId] = sock;
    sock.decodeJid = decodeJidFactory();
    sock.sessionId = sessionId;

    // --- Pairing code (web-driven instead of terminal prompt) ---
    if (!state.creds?.registered) {
        try {
            await delay(1500);
            const code = await sock.requestPairingCode(sessionId);
            const formattedCode = code?.match(/.{1,4}/g)?.join('-') || code;
            console.log(chalk.green(`👑 Pairing code for ${sessionId}: ${formattedCode}`));
            if (typeof onPairingCode === 'function') onPairingCode(formattedCode);
            if (io) io.emit('pairing-code', { number: sessionId, code: formattedCode });
        } catch (err) {
            console.log(chalk.red(`❌ Failed to request pairing code: ${err.message}`));
            if (io) io.emit('pairing-error', { number: sessionId, error: err.message });
        }
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'connecting') {
            console.log(chalk.yellow(`🔄 Connecting session ${sessionId}...`));
        }

        if (connection === 'open') {
            const sessionSettings = getSettings(sessionId);
            reconnectAttempts[sessionId] = 0;
            console.log(chalk.green(`✅ ${sessionSettings.botName} (${sessionId}) connected!`));
            if (io) io.emit('connected', { number: sessionId });
            sendConnectedMessage(sock, sessionId, sessionSettings).catch(() => {});
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

            console.log(chalk.red(`❌ Session ${sessionId} closed (code: ${statusCode || 'unknown'}). Reconnecting: ${shouldReconnect}`));
            if (io) io.emit('disconnected', { number: sessionId, willReconnect: shouldReconnect });

            try { sock.ev.removeAllListeners(); } catch (_) {}
            delete activeSockets[sessionId];

            if (shouldReconnect) {
                const attempt = (reconnectAttempts[sessionId] || 0) + 1;
                reconnectAttempts[sessionId] = attempt;
                const backoffMs = Math.min(5_000 * Math.pow(2, attempt - 1), 5 * 60_000);

                setTimeout(async () => {
                    if (!activeSockets[sessionId] && (await mongoSessionExists(sessionId))) {
                        startBot(sessionId, io).catch((err) =>
                            console.log(chalk.red(`❌ Reconnect failed for ${sessionId}: ${err.message}`))
                        );
                    }
                }, backoffMs);
            } else {
                removeMongoSession(sessionId).catch(() => {});
                delete reconnectAttempts[sessionId];
                console.log(chalk.red(`👋 Session ${sessionId} logged out.`));
            }
        }
    });

    sock.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            if (chatUpdate.type !== 'notify') return;

            const mek = chatUpdate.messages[0];
            if (!mek?.message) return;

            const msgType = Object.keys(mek.message)[0];
            if (msgType === 'ephemeralMessage' || msgType === 'viewOnceMessage' || msgType === 'viewOnceMessageV2') {
                mek.message = mek.message[msgType].message;
            }

            const m = smsg(sock, mek);
            const settings = getSettings(sessionId);

            // --- AUTO VIEW / REACT STATUS ---
            if (m.chat === 'status@broadcast') {
                try {
                    if (settings.autoViewStatus) {
                        await sock.readMessages([mek.key]);
                    }
                    if (settings.autoReactStatus) {
                        const statusReactions = settings.statusEmojis?.length ? settings.statusEmojis : ['🔥'];
                        const randomReaction = statusReactions[Math.floor(Math.random() * statusReactions.length)];
                        await sock.sendMessage(
                            'status@broadcast',
                            { react: { text: randomReaction, key: mek.key } },
                            { statusJidList: [m.sender] }
                        );
                    }
                } catch (statusError) {
                    console.log(chalk.red('Status react/view error:'), statusError.message);
                }
                return;
            }

            // --- AUTO READ CHAT ---
            if (settings.autoReadChat) {
                await sock.readMessages([mek.key]);
            }

            // --- AUTO TYPING / RECORDING ---
            if (settings.autoTyping) {
                await sock.sendPresenceUpdate('composing', m.chat);
            }
            if (settings.autoRecording) {
                await sock.sendPresenceUpdate('recording', m.chat);
            }

            // --- AUTO REACT NORMAL CHAT ---
            if (settings.autoReactChat && !m.isBaileys && !m.key.fromMe) {
                const chatEmojis = settings.chatEmojis?.length ? settings.chatEmojis : ['😆'];
                const randomEmoji = chatEmojis[Math.floor(Math.random() * chatEmojis.length)];
                await sock.sendMessage(m.chat, { react: { text: randomEmoji, key: m.key } });
            }

            // --- MAIN COMMAND HANDLER (only .ping, .play, .vv2 live in /plugins) ---
            require('./message')(sock, m, chatUpdate);
        } catch (err) {
            console.error(chalk.red('Error in message event loop: '), err);
        }
    });

    return sock;
}

/**
 * Resumes every session already saved in MongoDB (e.g. after a restart/redeploy).
 */
async function resumeExistingSessions(io) {
    let existing = [];
    try {
        existing = await listMongoSessionIds();
    } catch (err) {
        console.log(chalk.red(`❌ Could not load sessions from MongoDB: ${err.message}`));
        return;
    }

    for (const sessionId of existing) {
        console.log(chalk.cyan(`💫 Resuming saved session: ${sessionId}`));
        startBot(sessionId, io).catch((err) =>
            console.log(chalk.red(`❌ Failed to resume session ${sessionId}: ${err.message}`))
        );
    }
}

/**
 * Watchdog: every 5 minutes, checks that every socket we think is "active"
 * still has a genuinely open underlying websocket, and restarts any that
 * look stuck. Keeps sessions alive for days instead of a few hours.
 */
function startWatchdog(io) {
    setInterval(() => {
        for (const sessionId of Object.keys(activeSockets)) {
            const sock = activeSockets[sessionId];
            const readyState = sock?.ws?.socket?.readyState ?? sock?.ws?.readyState;
            if (readyState !== undefined && readyState !== 1) {
                console.log(chalk.yellow(`🩺 Watchdog: session ${sessionId} looks stuck (readyState ${readyState}), restarting...`));
                try { sock.ev.removeAllListeners(); } catch (_) {}
                try { sock.ws?.close?.(); } catch (_) {}
                delete activeSockets[sessionId];
                startBot(sessionId, io).catch((err) =>
                    console.log(chalk.red(`❌ Watchdog restart failed for ${sessionId}: ${err.message}`))
                );
            }
        }
    }, 5 * 60_000);
}

/**
 * Fully removes a session: logs it out of WhatsApp (best-effort), tears
 * down its socket, and deletes its saved credentials from MongoDB.
 */
async function deleteSession(number) {
    const sessionId = String(number).replace(/[^0-9]/g, '');
    const sock = activeSockets[sessionId];

    if (sock) {
        try { await sock.logout(); } catch (_) {}
        try { sock.ev.removeAllListeners(); } catch (_) {}
        delete activeSockets[sessionId];
    }
    delete reconnectAttempts[sessionId];

    await removeMongoSession(sessionId).catch(() => {});
    return true;
}

/**
 * Lists every known session (currently connected or previously saved in
 * MongoDB) for the web panel, with its connection status and owner info.
 * `config.maxSessions` caps how many numbers this build of the bot is
 * allowed to run at once — Single-Session zips ship with maxSessions=1,
 * Multi-Session zips ship with a much higher limit.
 */
async function listAllSessions() {
    let stored = [];
    try {
        stored = await listMongoSessionIds();
    } catch (_) {}

    const allIds = new Set([...stored, ...Object.keys(activeSockets)]);

    return [...allIds].map((sessionId) => {
        const settings = getSettings(sessionId);
        return {
            number: sessionId,
            connected: !!activeSockets[sessionId],
            botName: settings.botName,
            ownerNumber: settings.ownerNumber,
        };
    });
}

module.exports = {
    startBot,
    resumeExistingSessions,
    activeSockets,
    startWatchdog,
    deleteSession,
    listAllSessions,
    mongoSessionExists,
    removeMongoSession,
};
