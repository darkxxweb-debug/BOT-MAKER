"use strict";

const crypto = require("crypto");

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const tokens = new Map(); // token -> expiry timestamp
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

function login(password) {
    if (password !== ADMIN_PASSWORD) return null;
    const token = crypto.randomBytes(24).toString("hex");
    tokens.set(token, Date.now() + TOKEN_TTL_MS);
    return token;
}

function isValidToken(token) {
    if (!token) return false;
    const expiry = tokens.get(token);
    if (!expiry) return false;
    if (Date.now() > expiry) {
        tokens.delete(token);
        return false;
    }
    return true;
}

function requireAdmin(req, res, next) {
    const header = req.headers["authorization"] || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : req.query.token;
    if (!isValidToken(token)) {
        return res.status(401).json({ error: "Admin login required." });
    }
    next();
}

module.exports = { login, isValidToken, requireAdmin };
