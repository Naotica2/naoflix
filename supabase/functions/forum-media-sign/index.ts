// ============================================================================
// Supabase Edge Function: forum-media-sign
// Optional ImageKit Forever Free Signed Upload & Safe Delete Handler
// Deploy with: supabase functions deploy forum-media-sign
// Secrets (in Supabase Dashboard -> Edge Functions -> Secrets):
//   - IMAGEKIT_PRIVATE_KEY
//   - IMAGEKIT_PUBLIC_KEY
//   - IMAGEKIT_URL_ENDPOINT  (optional metadata, e.g. https://ik.imagekit.io/your_id)
// If secrets are not set yet, returns { configured: false } cleanly.
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function hmacSha1Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const privateKey = Deno.env.get('IMAGEKIT_PRIVATE_KEY') ?? '';
    const publicKey = Deno.env.get('IMAGEKIT_PUBLIC_KEY') ?? '';
    const urlEndpoint = Deno.env.get('IMAGEKIT_URL_ENDPOINT') ?? '';

    if (!privateKey || !publicKey) {
      return new Response(JSON.stringify({ configured: false, provider: 'supabase' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const action = body?.action || 'sign';

    if (action === 'sign') {
      const count = Math.max(1, Math.min(4, Number(body?.count || 1)));
      const { data: quota } = await supabase.rpc('check_daily_upload_quota', {
        p_incoming_count: count,
      });

      if (quota && quota.allowed === false) {
        return new Response(
          JSON.stringify({
            configured: true,
            error: 'QUOTA_EXCEEDED',
            quota,
          }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const token = crypto.randomUUID();
      const expire = Math.floor(Date.now() / 1000) + 120;
      const signature = await hmacSha1Hex(privateKey, token + String(expire));

      return new Response(
        JSON.stringify({
          configured: true,
          provider: 'imagekit',
          token,
          expire,
          signature,
          publicKey,
          urlEndpoint: urlEndpoint ? urlEndpoint.replace(/\/+$/, '') : undefined,
          folder: `/naoflix-forum/${user.id}`,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (action === 'delete') {
      const fileIds: string[] = Array.isArray(body?.fileIds) ? body.fileIds.slice(0, 8) : [];
      if (fileIds.length === 0) {
        return new Response(JSON.stringify({ deleted: [] }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: ownedRows } = await supabase
        .from('forum_upload_logs')
        .select('file_id')
        .eq('user_id', user.id)
        .in('file_id', fileIds);

      const allowedIds = new Set<string>(
        (ownedRows || []).map((r: any) => String(r?.file_id || '')).filter(Boolean),
      );
      const basicAuth = 'Basic ' + btoa(`${privateKey}:`);
      const deleted: string[] = [];

      for (const fid of allowedIds) {
        try {
          const res = await fetch(`https://api.imagekit.io/v1/files/${encodeURIComponent(fid)}`, {
            method: 'DELETE',
            headers: { Authorization: basicAuth },
          });
          if (res.ok || res.status === 404) {
            deleted.push(fid);
          }
        } catch {}
      }

      return new Response(JSON.stringify({ deleted }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
