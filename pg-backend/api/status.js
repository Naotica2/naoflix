// Supabase client minimalis
async function updateSupabase(transactionRef, userId, durationDays) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !serviceKey) return;

  // 1. Update status transaksi
  await fetch(`${supabaseUrl}/rest/v1/transactions?ref=eq.${transactionRef}`, {
    method: 'PATCH',
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({ status: 'success' })
  });

  // 2. Update profil jadi VIP beserta masa aktifnya
  const vipUntil = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();

  await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${userId}`, {
    method: 'PATCH',
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({ is_vip: true, vip_until: vipUntil })
  });
}

export default async function handler(req, res) {
  // CORS setup
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Pakai GET' });
  }

  const { ref } = req.query;
  const HAMS_API_KEY = process.env.HAMS_API_KEY;

  if (!ref) {
    return res.status(400).json({ message: 'Missing ref' });
  }

  try {
    // Cek status ke Hams PG (Pastikan tidak kena cache)
    const pgResponse = await fetch(`https://pg.hamsoffc.my.id/api/deposit/${ref}`, {
      method: 'GET',
      headers: {
        'x-api-key': HAMS_API_KEY
      },
      cache: 'no-store'
    });

    const data = await pgResponse.json();
    
    // Jika sukses dibayar, kita jalankan tugas webhook secara manual di sini!
    if (data.status === 'success') {
      // Ambil data user dari Supabase
      const supabaseUrl = process.env.SUPABASE_URL;
      const serviceKey = process.env.SUPABASE_SERVICE_KEY;
      
      const getTxRes = await fetch(`${supabaseUrl}/rest/v1/transactions?ref=eq.${ref}&select=user_id,duration_days,status`, {
        method: 'GET',
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`
        }
      });
      
      const txData = await getTxRes.json();
      if (txData && txData.length > 0) {
        const tx = txData[0];
        if (tx.status !== 'success') {
          await updateSupabase(ref, tx.user_id, tx.duration_days);
        }
      }
    }

    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}
