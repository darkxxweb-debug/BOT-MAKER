# DarkX Mini

A simple WhatsApp bot with 3 commands: **.ping**, **.play**, **.vv2** — generated for you by the **DarkX Bot Builder**.

## What's inside

- Your bot's identity (name, owner, prefix) is already filled in from the details you entered on the builder website — see `.env`.
- A web dashboard (pairing + settings) so you can link your WhatsApp number and tweak things later.
- MongoDB is used to store your WhatsApp session so it survives restarts. **You must supply your own MongoDB connection string** — this bot never falls back to a shared database.

## Running it

1. `npm install`
2. Make sure `.env` has a working `MONGODB_URI` (yours, from MongoDB Atlas or similar — free tier is enough).
3. `npm start`
4. Open the web address shown in the console, enter your WhatsApp number, and enter the pairing code shown on WhatsApp → Linked Devices.

## Deploying

This project works on Render, Railway, Heroku-style platforms, or any Node.js host — just make sure the `MONGODB_URI`, `BOT_NAME`, `OWNER_NAME`, `OWNER_NUMBER` environment variables are set (values already provided in `.env` if you're just copying the project as-is).

---
Powered by DarkX Mini — built with the DarkX Bot Builder.
