"use strict";

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const fsExtra = require("fs-extra");
const multer = require("multer");
const crypto = require("crypto");

const { buildBotZip } = require("./lib/zipBuilder");
const orderStore = require("./lib/orderStore");
const adminAuth = require("./lib/adminAuth");

const app = express();
const PORT = process.env.PORT || 4000;

const UPLOADS_DIR = path.join(__dirname, "uploads");
const DOWNLOADS_DIR = path.join(__dirname, "downloads");
fsExtra.ensureDirSync(UPLOADS_DIR);
fsExtra.ensureDirSync(DOWNLOADS_DIR);

const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, UPLOADS_DIR),
        filename: (req, file, cb) => {
            const ext = path.extname(file.originalname || "") || ".jpg";
            cb(null, `${crypto.randomBytes(10).toString("hex")}${ext}`);
        },
    }),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (req, file, cb) => {
        if (!/^image\//.test(file.mimetype)) {
            return cb(new Error("Proof of payment must be an image."));
        }
        cb(null, true);
    },
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(UPLOADS_DIR));

function validateBasics(body) {
    const errors = [];
    if (!body.botName || !body.botName.trim()) errors.push("Bot name is required.");
    if (!body.ownerName || !body.ownerName.trim()) errors.push("Owner name is required.");
    const digits = String(body.ownerNumber || "").replace(/[^0-9]/g, "");
    if (!digits || digits.length < 9) errors.push("A valid WhatsApp number (with country code) is required.");
    const mongoUri = String(body.mongoUri || "").trim();
    if (!mongoUri || !/^mongodb(\+srv)?:\/\//.test(mongoUri)) {
        errors.push("A valid MongoDB connection string is required (starts with mongodb:// or mongodb+srv://).");
    }
    return errors;
}

// ---------------------------------------------------------------------------
// SIDE 1: Single-Session — free, instant download
// ---------------------------------------------------------------------------
app.post("/api/generate/single", async (req, res) => {
    const errors = validateBasics(req.body);
    if (errors.length) return res.status(400).json({ error: errors.join(" ") });

    let zipPath;
    try {
        zipPath = await buildBotZip({
            botName: req.body.botName,
            ownerName: req.body.ownerName,
            ownerNumber: req.body.ownerNumber,
            mongoUri: req.body.mongoUri,
            prefix: req.body.prefix || ".",
            maxSessions: 1,
        });

        res.download(zipPath, "DarkX-Mini.zip", (err) => {
            fs.unlink(zipPath, () => {});
            if (err) console.error("Download error:", err.message);
        });
    } catch (err) {
        console.error("Single-session build error:", err);
        if (zipPath) fs.unlink(zipPath, () => {});
        res.status(500).json({ error: "Failed to generate your bot. Please try again." });
    }
});

// ---------------------------------------------------------------------------
// SIDE 2: Multi-Session — paid (35,000 TZS), needs admin approval
// ---------------------------------------------------------------------------
const PRICE_TZS = 35000;
const PAYMENT_NUMBER = process.env.PAYMENT_NUMBER || "0775710774";
const PAYMENT_NAME = process.env.PAYMENT_NAME || "JAMILA";
const DEFAULT_MULTI_SESSIONS = parseInt(process.env.DEFAULT_MULTI_SESSIONS || "5", 10);

app.get("/api/payment-info", (req, res) => {
    res.json({ priceTzs: PRICE_TZS, paymentNumber: PAYMENT_NUMBER, paymentName: PAYMENT_NAME });
});

app.post("/api/generate/multi/submit", upload.single("proof"), (req, res) => {
    const errors = validateBasics(req.body);
    const payerNumber = String(req.body.payerNumber || "").replace(/[^0-9]/g, "");
    const transactionRef = String(req.body.transactionRef || "").trim();
    if (!payerNumber || payerNumber.length < 9) errors.push("The phone number you paid from is required.");
    if (!transactionRef) errors.push("The transaction number (Muamala) is required.");
    if (!req.file) errors.push("Please attach a screenshot/photo of your payment confirmation.");

    if (errors.length) {
        if (req.file) fs.unlink(req.file.path, () => {});
        return res.status(400).json({ error: errors.join(" ") });
    }

    const order = orderStore.createOrder({
        type: "multi",
        botName: req.body.botName.trim(),
        ownerName: req.body.ownerName.trim(),
        ownerNumber: req.body.ownerNumber.replace(/[^0-9]/g, ""),
        mongoUri: req.body.mongoUri.trim(),
        prefix: req.body.prefix || ".",
        maxSessions: DEFAULT_MULTI_SESSIONS,
        payerNumber,
        transactionRef,
        proofImage: `/uploads/${req.file.filename}`,
    });

    res.json({ ok: true, orderId: order.id, message: "Ombi lako limepokelewa. Admin atakagua na kukuidhinishia hivi punde." });
});

app.get("/api/generate/multi/status/:id", (req, res) => {
    const order = orderStore.getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found." });

    res.json({
        status: order.status,
        rejectReason: order.rejectReason,
        downloadUrl: order.status === "approved" ? `/api/download/${order.downloadToken}` : null,
    });
});

app.get("/api/download/:token", (req, res) => {
    const order = orderStore.getOrderByDownloadToken(req.params.token);
    if (!order || order.status !== "approved") {
        return res.status(404).send("Download link not found or not approved yet.");
    }
    const zipPath = path.join(DOWNLOADS_DIR, `${order.id}.zip`);
    if (!fs.existsSync(zipPath)) {
        return res.status(404).send("This download has expired. Please contact the admin.");
    }
    res.download(zipPath, "DarkX-Mini-Multi.zip");
});

// ---------------------------------------------------------------------------
// ADMIN
// ---------------------------------------------------------------------------
app.post("/api/admin/login", (req, res) => {
    const token = adminAuth.login(req.body?.password);
    if (!token) return res.status(401).json({ error: "Wrong password." });
    res.json({ token });
});

app.get("/api/admin/orders", adminAuth.requireAdmin, (req, res) => {
    res.json({ orders: orderStore.listOrders() });
});

app.post("/api/admin/orders/:id/approve", adminAuth.requireAdmin, async (req, res) => {
    const order = orderStore.getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found." });
    if (order.status !== "pending") return res.status(400).json({ error: "Order already decided." });

    try {
        const zipPath = await buildBotZip({
            botName: order.botName,
            ownerName: order.ownerName,
            ownerNumber: order.ownerNumber,
            mongoUri: order.mongoUri,
            prefix: order.prefix,
            maxSessions: order.maxSessions,
        });

        const downloadToken = crypto.randomBytes(16).toString("hex");
        const finalPath = path.join(DOWNLOADS_DIR, `${order.id}.zip`);
        await fsExtra.move(zipPath, finalPath, { overwrite: true });

        const updated = orderStore.updateOrder(order.id, {
            status: "approved",
            decidedAt: new Date().toISOString(),
            downloadToken,
        });

        res.json({ ok: true, order: updated });
    } catch (err) {
        console.error("Approve/build error:", err);
        res.status(500).json({ error: "Failed to build the bot zip. Please try again." });
    }
});

app.post("/api/admin/orders/:id/reject", adminAuth.requireAdmin, (req, res) => {
    const order = orderStore.getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found." });
    if (order.status !== "pending") return res.status(400).json({ error: "Order already decided." });

    const updated = orderStore.updateOrder(order.id, {
        status: "rejected",
        decidedAt: new Date().toISOString(),
        rejectReason: req.body?.reason || "Payment could not be verified.",
    });

    if (order.proofImage) {
        const filePath = path.join(__dirname, order.proofImage.replace(/^\//, ""));
        fs.unlink(filePath, () => {});
    }

    res.json({ ok: true, order: updated });
});

app.get("/health", (req, res) => res.json({ status: "ok" }));

app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
    console.log(`\n🛠️  DarkX Bot Builder is LIVE on port ${PORT}`);
    console.log(`🌐  Open the web page to generate your DarkX Mini bot\n`);
});
