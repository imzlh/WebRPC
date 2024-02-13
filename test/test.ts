/// <reference lib="deno.ns" />

import { RPCPipe } from '../../front/lib/server/rpc.ts';
import Env from '../env.ts';

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