// Vercel Node function: WhatsApp Cloud API webhook. Callback URL: https://<project>.vercel.app/api/webhook
import { waitUntil } from '@vercel/functions';
import { handleMessage, validSig, extractMessages } from '../core.js';
export const config = { maxDuration: 60 };
export async function GET(request) {
  const u = new URL(request.url); const vt = process.env.WHATSAPP_VERIFY_TOKEN;
  if (vt && u.searchParams.get('hub.mode') === 'subscribe' && u.searchParams.get('hub.verify_token') === vt) return new Response(u.searchParams.get('hub.challenge') || '', { status: 200 });
  return new Response('forbidden', { status: 403 });
}
export async function POST(request) {
  const raw = Buffer.from(await request.arrayBuffer());
  if (!validSig(raw, request.headers.get('x-hub-signature-256'))) return new Response('bad signature', { status: 401 });
  let body; try { body = JSON.parse(raw); } catch { return new Response('ok'); }
  const msgs = extractMessages(body);
  waitUntil(Promise.all(msgs.map(m => handleMessage(m).catch(e => console.error('handle', e.message)))));
  return new Response('EVENT_RECEIVED', { status: 200 });
}
