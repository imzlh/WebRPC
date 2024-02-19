/// <reference lib="deno.ns" />

import { extname } from "https://deno.land/std@0.215.0/path/extname.ts";
import { serveDir } from "https://deno.land/std@0.215.0/http/file_server.ts";
import { RPC, RPCPipe, Env } from "../mod.ts";

Deno.serve(function(req){
    const path = new URL(req.url).pathname,
        ext = extname(path);
    if(req.headers.has('sec-websocket-key')){
        const rpc = new RPC(),
            {socket,response} = Deno.upgradeWebSocket(req);
        rpc.socket = socket;
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

Env.provide('echo',function(pipe:RPCPipe){
    pipe.readable.pipeTo(pipe.writeable);
},{
    pipe: true,
    once: false
});

Env.provide('initMe',function(func){
    setInterval(() => this.call(func,[Math.floor(Math.random() * 114514) + '\n']),1145);
    setTimeout(() => 
        this.prepare('document.createElement',['div'])
            .then('document.createTextNode',['Hello, Deno + RPC3! (form RPCServer)'])
            .then('&0.appendChild',['&'])
            .then('document.body.append',['&0'])
            .then('&0.classList.add',['float-bottom'])
            .send(),
        1454
    )
});

Env.provide('hello',() => 'hello');