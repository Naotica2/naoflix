// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

// Fungsi bantuan untuk menghitung HMAC SHA-256 bawaan server (Web Crypto API)
async function generateHmacSignature(secret: string, payload: string) {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const data = encoder.encode(payload);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signatureBuffer = await crypto.subtle.sign("HMAC", cryptoKey, data);
  const signatureArray = Array.from(new Uint8Array(signatureBuffer));
  return signatureArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

serve(async (req) => {
  try {
    const signature = req.headers.get('x-callback-signature');
    const payloadText = await req.text();
    const API_KEY = Deno.env.get('HAMS_PG_API_KEY');
    
    // 1. Verifikasi Keamanan
    const calcSignature = await generateHmacSignature(API_KEY ?? '', payloadText);
    if (signature !== calcSignature) return new Response("Invalid Signature", { status: 403 });

    const payload = JSON.parse(payloadText);
    if (payload.event === 'deposit.success' && payload.data.status === 'success') {
      
      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '' // Pake Service Role biar sakti
      );

      // Cari user_id dan duration_days dari ref transaksi
      const { data: trx } = await supabaseAdmin.from('transactions').select('user_id, duration_days').eq('ref', payload.data.ref).single();
      if (!trx) return new Response("Transaksi tidak ditemukan", { status: 404 });
      
      const addedDays = trx.duration_days || 30;

      // Cek status VIP saat ini
      const { data: userProfile } = await supabaseAdmin.from('profiles').select('vip_until').eq('id', trx.user_id).single();
      
      let newVipUntil = new Date(Date.now() + addedDays * 24 * 60 * 60 * 1000).toISOString();
      if (userProfile?.vip_until && new Date(userProfile.vip_until).getTime() > Date.now()) {
        // Jika masih aktif, tambahkan hari sesuai paket dari sisa waktu saat ini
        newVipUntil = new Date(new Date(userProfile.vip_until).getTime() + addedDays * 24 * 60 * 60 * 1000).toISOString();
      }

      // 3. Eksekusi Pembelian! Ubah is_vip dan vip_until
      await supabaseAdmin.from('profiles').update({ is_vip: true, vip_until: newVipUntil }).eq('id', trx.user_id);
      
      // Update status transaksi jadi lunas
      await supabaseAdmin.from('transactions').update({ status: 'success' }).eq('ref', payload.data.ref);
    }
    
    return new Response("OK", { status: 200 });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
})
