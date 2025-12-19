// cors avoidding solution for local testing

import type { APIRoute } from 'astro';

export const prerender = false;

export const POST: APIRoute = async ({ params, request }) => {
    const { ip } = params;

    if (!ip) {
        return new Response(JSON.stringify({ error: 'IP address required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    try {
        const body = await request.json();

        /* localy just for test cut corner and to this, and pick random one

             curl https://api.devnet.solana.com -s -X POST -H "Content-Type: application/json" -d '
               {"jsonrpc":"2.0", "id":1, "method":"getClusterNodes"}
             ' | jq -r '.result[] | select(.rpc != null) | "\(.pubkey) -> \(.rpc)"'
        */

        const response = await fetch(`http://109.94.99.153:8899`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        const data = await response.json();

        return new Response(JSON.stringify(data), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
        });
    } catch (error) {
        const message =
            error instanceof Error ? error.message : 'Connection failed';
        return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
};

export const OPTIONS: APIRoute = async () => {
    return new Response(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        },
    });
};
