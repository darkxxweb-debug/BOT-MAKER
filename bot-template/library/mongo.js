"use strict";

/**
 * Single shared MongoDB connection used to persist WhatsApp session
 * credentials (so sessions survive restarts/redeploys instead of living
 * only on local disk).
 */

const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI || '';

let client = null;
let dbPromise = null;

function getDb() {
    if (!uri) {
        throw new Error(
            'MONGODB_URI is not set. Add your own MongoDB connection string to .env (or your host\'s ' +
            'environment variables) — this is the "database" field you filled in on the DarkX Bot Builder.'
        );
    }
    if (!dbPromise) {
        client = new MongoClient(uri, {
            maxPoolSize: 20,
            serverSelectionTimeoutMS: 15000,
        });
        dbPromise = client.connect()
            .then((c) => {
                console.log('🗄️  Connected to MongoDB');
                return c.db('darkx_mini');
            })
            .catch((err) => {
                console.error('❌ MongoDB connection failed:', err.message);
                dbPromise = null; // allow retry on next call
                throw err;
            });
    }
    return dbPromise;
}

module.exports = { getDb };
