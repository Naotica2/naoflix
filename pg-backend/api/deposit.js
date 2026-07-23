export default async function handler(req, res) {
  // --- 1. SETTING CORS (Biar bebas akses dari HP manapun) ---
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Jika ada request preflight dari React Native, langsung ijinkan
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // --- 2. HANYA MENERIMA METODE POST ---
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed. Pakai POST!' });
  }

  // --- 3. AMBIL DATA DARI APP & API KEY DARI VERCEL ---
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

  // --- 4. TEMBAK API HAMS PG ---
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

    // Jika Hams menolak
    if (!pgResponse.ok) {
      return res.status(pgResponse.status).json(data);
    }

    // Jika sukses dari Hams PG, masukkan ke Supabase pakai Kunci Master (Service Role)
    // agar kebal dari blokiran RLS
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

    // Kembalikan response Hams PG ke aplikasi NaoFlix
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ message: 'Gagal terhubung ke Hams PG: ' + error.message });
  }
}
