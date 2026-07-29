export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed. Pakai POST!' });
  }
  const { amount, userId, durationDays } = req.body;
  const HAMS_API_KEY = process.env.HAMS_API_KEY;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!HAMS_API_KEY) {
    return res.status(500).json({ message: 'Error Server: HAMS_API_KEY belum disetel di Vercel!' });
  }

  if (!amount || !userId) {
    return res.status(400).json({ message: 'Missing amount atau userId' });
  }
  try {
    const idempotencyKey = `INV-${userId.substring(0, 8)}-${Date.now()}`;
    const pgResponse = await fetch('https://pg.hamsoffc.my.id/api/deposit', {
      method: 'POST',
      headers: {
        'x-api-key': HAMS_API_KEY,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey
      },
      body: JSON.stringify({ amount })
    });

    const data = await pgResponse.json();

    if (!pgResponse.ok) {
      return res.status(pgResponse.status).json(data);
    }

    if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
      await fetch(`${SUPABASE_URL}/rest/v1/transactions`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          ref: data.ref,
          user_id: userId,
          amount: data.total || data.amount_unique || data.amount || amount,
          status: 'pending',
          duration_days: durationDays || 30
        })
      });
    }

    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ message: 'Gagal terhubung ke Hams PG: ' + error.message });
  }
}
