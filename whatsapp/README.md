# Open Venue DB — WhatsApp channel

Zero-dependency Node 20 webhook for the WhatsApp Cloud API, reusing `../discord-bot/agent.js` (Claude tool-calling agent).

- `GET /webhook` verifies against `WHATSAPP_VERIFY_TOKEN`, or a random token generated into `.verify_token` (gitignored).
- `POST /webhook` checks `X-Hub-Signature-256` when `WHATSAPP_APP_SECRET` is set, marks messages read, keeps per-sender state for 30 min, and replies **only to the sender** inside the 24h window (no templates).
- Top 3 venues are sent as interactive messages with **Shortlist** / **Draft outreach** buttons. Outreach drafts stay `pending_approval`; venues are never contacted.
- Dry-run (logs instead of sending) until `WHATSAPP_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` are set. `GRAPH_VERSION` defaults to v23.0.

Run: `node server.js` (PORT, default 8787). Test: `node test.js`. Expose with any HTTPS tunnel or host, then set Callback URL `https://<host>/webhook` in Meta App Dashboard → WhatsApp → Configuration and subscribe to `messages`.
