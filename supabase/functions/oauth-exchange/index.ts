// GemMCP Cloud OAuth Exchange Edge Function
// Handles secure server-side token exchange for GitHub, Notion, and Supabase OAuth flows

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { service, code, redirectUri } = await req.json();

    if (!code) {
      return new Response(JSON.stringify({ success: false, error: 'Missing code parameter' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      });
    }

    if (service === 'github') {
      const clientId = Deno.env.get('GITHUB_CLIENT_ID');
      const clientSecret = Deno.env.get('GITHUB_CLIENT_SECRET');

      if (!clientId || !clientSecret) {
        return new Response(JSON.stringify({ success: false, error: 'Server misconfiguration: GitHub credentials not found' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500
        });
      }

      const res = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code: code
        })
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        return new Response(JSON.stringify({ success: false, error: data.error_description || data.error || 'Failed to exchange GitHub code' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        });
      }

      return new Response(JSON.stringify({
        success: true,
        accessToken: data.access_token,
        tokenType: data.token_type,
        scope: data.scope
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      });
    }

    if (service === 'notion') {
      const clientId = Deno.env.get('NOTION_CLIENT_ID');
      const clientSecret = Deno.env.get('NOTION_CLIENT_SECRET');

      if (!clientId || !clientSecret) {
        return new Response(JSON.stringify({ success: false, error: 'Server misconfiguration: Notion credentials not found' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500
        });
      }

      const credentials = btoa(`${clientId}:${clientSecret}`);
      const res = await fetch('https://api.notion.com/v1/oauth/token', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/json',
          'Notion-Version': '2022-06-28'
        },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: redirectUri || 'http://localhost:3000/oauth/callback'
        })
      });

      const data = await res.json();
      if (!res.ok) {
        return new Response(JSON.stringify({ success: false, error: data.error_description || data.error || data.message || 'Failed to exchange Notion code' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        });
      }

      return new Response(JSON.stringify({
        success: true,
        accessToken: data.access_token,
        workspaceName: data.workspace_name || 'Notion Workspace'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      });
    }

    if (service === 'supabase') {
      const clientId = Deno.env.get('SB_CLIENT_ID') || Deno.env.get('SUPABASE_CLIENT_ID');
      const clientSecret = Deno.env.get('SB_CLIENT_SECRET') || Deno.env.get('SUPABASE_CLIENT_SECRET');

      if (!clientId || !clientSecret) {
        return new Response(JSON.stringify({ success: false, error: 'Server misconfiguration: Supabase OAuth credentials not found' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500
        });
      }

      const credentials = btoa(`${clientId}:${clientSecret}`);
      const params = new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri || 'http://localhost:3000/oauth/callback'
      });

      const res = await fetch('https://api.supabase.com/v1/oauth/token', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
        },
        body: params.toString()
      });

      const data = await res.json();
      if (!res.ok) {
        return new Response(JSON.stringify({ success: false, error: data.error_description || data.error || 'Failed to exchange Supabase code' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        });
      }

      return new Response(JSON.stringify({
        success: true,
        accessToken: data.access_token,
        refreshToken: data.refresh_token
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      });
    }

    return new Response(JSON.stringify({ success: false, error: `Unsupported service: ${service}` }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400
    });

  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
});
