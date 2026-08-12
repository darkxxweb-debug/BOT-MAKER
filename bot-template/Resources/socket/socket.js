"use strict";

/**
 * Project: DarkX Ultimate
 * Socket.IO bridge between the web pairing page and the bot engine.
 */

const { startBot, activeSockets, mongoSessionExists, removeMongoSession, listAllSessions } = require('../../index');
const config = require('../../settings/config');

module.exports = function registerSocketHandlers(io) {
    io.on('connection', (socket) => {
        console.log('🎀 A browser connected to the pairing page.');

        socket.on('pair-request', async (rawNumber) => {
            try {
                const number = String(rawNumber || '').replace(/[^0-9]/g, '');

                if (!number || number.length < 9) {
                    socket.emit('pairing-error', { error: 'Please enter a valid phone number with country code (e.g. 2557XXXXXXXX)' });
                    return;
                }

                if (activeSockets[number]) {
                    socket.emit('pairing-error', { error: 'This number is already paired and connected.' });
                    return;
                }

                // This build of the bot is capped at config.maxSessions linked
                // numbers (1 for Single-Session zips, higher for Multi-Session
                // zips). Re-linking an already-known number doesn't count
                // against the cap.
                const alreadyKnown = await mongoSessionExists(number);
                if (!alreadyKnown) {
                    const existingSessions = await listAllSessions();
                    if (existingSessions.length >= (config.maxSessions || 1)) {
                        socket.emit('pairing-error', {
                            error: `This bot build only supports ${config.maxSessions || 1} linked number(s). Remove an existing number first, or get the Multi-Session build for more.`,
                        });
                        return;
                    }
                }

                // If this number already has a saved session in MongoDB (e.g. an
                // old/broken one, or someone re-linking), wipe it first so we
                // always hand out a genuinely fresh pairing code instead of
                // getting stuck on stale credentials.
                if (await mongoSessionExists(number)) {
                    socket.emit('status', { message: `♻️ Found an existing session for ${number}, resetting it first...` });
                    await removeMongoSession(number);
                }

                socket.emit('status', { message: `✨ Generating your pairing code for ${number}...` });

                await startBot(number, io, (code) => {
                    socket.emit('pairing-code', { number, code });
                });
            } catch (err) {
                socket.emit('pairing-error', { error: err.message });
            }
        });

        socket.on('disconnect', () => {
            console.log('👋 A browser disconnected from the pairing page.');
        });
    });
};
