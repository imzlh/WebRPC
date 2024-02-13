/// <reference lib="deno.ns" />

import { extname } from "https://deno.land/std@0.215.0/path/extname.ts";
import RPCBaseline from "../share.ts";
import { serveDir } from "https://deno.land/std/http/file_server.ts";
import './test.ts';

Deno.serve(function(req){
    const path = new URL(req.url).pathname,
        ext = extname(path);
    if(req.headers.has('sec-websocket-key')){
        const RPC = new RPCBaseline(),
            {socket,response} = Deno.upgradeWebSocket(req);
        RPC.socket = socket;
        return response;
    }else if(path == '/'){
        return new Response(null,{
            status: 302,
            headers: {
                'Location': '/test/index.html'
            }
        })
    }else if(['.js','.css','.html'].includes(ext.toLowerCase())){
        return serveDir(req,{
            fsRoot: '../'
        });
    }else{
        return new Response(null,{
            status: 302,
            headers: {
                'Location': path + '.js'
            }
        })
    }
});

function eh(error:Event){
    error.preventDefault();
    console.error(error);
}

globalThis.addEventListener('error',eh);
globalThis.addEventListener('unhandledrejection',eh);