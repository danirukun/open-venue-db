# Open Venue DB — Discord bot (kanichan)

`/venue-request` — event type, headcount, budget, area (postcode via postcodes.io, else Nominatim), weekday or date, slot → ephemeral must-haves picker → stores a `venue_requests` row (RPC `create_venue_request`) → top-3 embeds from `search_venues` with **Shortlist** / **Draft outreach** buttons.
Draft outreach only creates an `outreach_drafts` row with status `pending_approval`; the bot never contacts venues.

`/venue-search` — quick query by keywords, area, min capacity, weekday.

Run: `npm i && DISCORD_BOT_TOKEN=... node bot.js` (optional `SUPABASE_URL`, `SUPABASE_KEY`). Uses only the publishable key + narrow SECURITY DEFINER RPCs (`supabase/migrations_005_discord_bot.sql`).
Invite: https://discord.com/oauth2/authorize?client_id=1494675575615393884&scope=bot%20applications.commands&permissions=19456
