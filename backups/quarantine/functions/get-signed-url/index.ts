// Supabase Edge Function: get-signed-url
// Accepts JSON body: { bucket: string, path: string, expires?: number }
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env.

import { serve } from 'std/server';
import { createClient } from '@supabase/supabase-js';

serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) {
      return new Response(JSON.stringify({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }), { status: 500 });
    }

    const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const body = await req.json();
    const bucket = body?.bucket;
    const path = body?.path;
    const expires = typeof body?.expires === 'number' ? body.expires : 60; // seconds

    if (!bucket || !path) {
      return new Response(JSON.stringify({ error: 'bucket and path are required' }), { status: 400 });
    }

    // createSignedUrl
    try {
      const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, expires);
      if (error) {
        console.error('createSignedUrl error', error);
        return new Response(JSON.stringify({ error: error.message || 'createSignedUrl failed' }), { status: 500 });
      }

      // data may contain signedUrl or signedURL depending on SDK
      return new Response(JSON.stringify({ signedUrl: (data as any)?.signedUrl || (data as any)?.signedURL || null }), { status: 200 });
    } catch (e) {
      console.error('createSignedUrl exception', e);
      return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
    }
  } catch (err) {
    console.error('get-signed-url error', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
