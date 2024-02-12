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
});

Env.provide('hello',() => 'hello')