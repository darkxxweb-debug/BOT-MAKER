"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_PATH = path.join(__dirname, "..", "data", "orders.json");

function load() {
    try {
        if (!fs.existsSync(DATA_PATH)) {
            fs.writeFileSync(DATA_PATH, JSON.stringify({ orders: [] }, null, 2));
        }
        return JSON.parse(fs.readFileSync(DATA_PATH, "utf-8"));
    } catch (err) {
        console.error("Failed to read orders.json:", err.message);
        return { orders: [] };
    }
}

function save(data) {
    try {
        fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error("Failed to save orders.json:", err.message);
    }
}

function createOrder(fields) {
    const data = load();
    const order = {
        id: crypto.randomBytes(10).toString("hex"),
        status: "pending", // pending | approved | rejected
        createdAt: new Date().toISOString(),
        decidedAt: null,
        downloadToken: null,
        rejectReason: null,
        ...fields,
    };
    data.orders.unshift(order);
    save(data);
    return order;
}

function getOrder(id) {
    const data = load();
    return data.orders.find((o) => o.id === id) || null;
}

function listOrders({ status } = {}) {
    const data = load();
    if (!status) return data.orders;
    return data.orders.filter((o) => o.status === status);
}

function updateOrder(id, patch) {
    const data = load();
    const idx = data.orders.findIndex((o) => o.id === id);
    if (idx === -1) return null;
    data.orders[idx] = { ...data.orders[idx], ...patch };
    save(data);
    return data.orders[idx];
}

function getOrderByDownloadToken(token) {
    const data = load();
    return data.orders.find((o) => o.downloadToken === token) || null;
}

module.exports = {
    createOrder,
    getOrder,
    listOrders,
    updateOrder,
    getOrderByDownloadToken,
};
