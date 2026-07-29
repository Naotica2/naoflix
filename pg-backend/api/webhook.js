import crypto from 'crypto';

async function updateSupabase(transactionRef, userId, durationDays) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Supabase URL atau Service Key tidak disetel di Vercel');
  }

  const txRes = await fetch(`${supabaseUrl}/rest/v1/transactions?ref=eq.${transactionRef}`, {
    method: 'PATCH',
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({ status: 'success' })
  });

  if (!txRes.ok) {
    const errorText = await txRes.text();
    throw new Error(`Gagal update transaksi: ${errorText}`);
  }

  const vipUntil = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();

  const profileRes = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${userId}`, {
    method: 'PATCH',
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({ is_vip: true, vip_until: vipUntil })
  });

  if (!profileRes.ok) {
    const errorText = await profileRes.text();
    throw new Error(`Gagal update profile: ${errorText}`);
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
};

async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const signature = req.headers['x-webhook-signature'];
  const WEBHOOK_SECRET = process.env.HAMS_WEBHOOK_SECRET;

  if (!signature || !WEBHOOK_SECRET) {
    return res.status(400).send('Missing signature or Webhook Secret');
  }

  const rawBody = await getRawBody(req);
  const calcSignature = crypto.createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex');

  if (signature !== calcSignature) {
    return res.status(403).send('Invalid Signature');
  }

  let body;
  try {
    body = JSON.parse(rawBody);
  } catch (e) {
    return res.status(400).send('Invalid JSON');
  }

  const type = body?.type;
  const status = body?.status;
  const transactionRef = body?.ref;

  if (type === 'deposit' && status === 'SUCCESS') {

    try {
      const supabaseUrl = process.env.SUPABASE_URL;
      const serviceKey = process.env.SUPABASE_SERVICE_KEY;

      const getTxRes = await fetch(`${supabaseUrl}/rest/v1/transactions?ref=eq.${transactionRef}&select=user_id,duration_days,status`, {
        method: 'GET',
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`
        }
      });

      const txData = await getTxRes.json();
      if (!txData || txData.length === 0) {
        return res.status(404).send('Transaksi tidak ditemukan di Supabase');
      }

      const tx = txData[0];
      if (tx.status !== 'success') {
        await updateSupabase(transactionRef, tx.user_id, tx.duration_days);
      }

      return res.status(200).send('OK');
    } catch (error) {
      console.error(error);
      return res.status(500).send(error.message);
    }
  }

  return res.status(200).send('Ignored');
}
