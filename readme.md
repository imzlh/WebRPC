# RPC 3
RPC，在Windows上称作“远程过程调用”。作为系统的关键组件，在WinB上也无可辩驳地成为了通信核心

此RPC支持双向JS调用、双向Pipe和调用链，让诸多有双向或短时间内单向调用需求的项目有了更多选择

# 快速开始

## Deno

    import RPCBaseline, { Env } from 'https://deno.land/x/webrpc/mod.ts';
    Deno.serve(function(req){
        const RPC = new RPCBaseline(),
            {socket,response} = Deno.upgradeWebSocket(req);
        RPC.socket = socket;
        return response;
    }
    Env.provide('...',...)

## 浏览器

    import RPC from 'browser.js';
    import { Env } from 'share.js';
    const rpc = new RPC('ws://demo.com/rpc/ws');
    // Env.provide('...',...)
    // rpc.call(...)
    // rpc.pipe(...)
    // rpc.prepare(...).then(...).then(...).send(true)
    // ...

# 更多？
RPC3是一个框架，支持 浏览器(browser.ts)、Deno端(直接使用mod.ts)、Bun(未测试)

且经过小幅度改动或一个polyfill即可移植到NodeJS

需要提前安装好 `typescript` 和 `deno`，然后：

你可以试试看 `tsc && cd test && deno run -A --unstable-sloppy-imports deno.ts`运行简单的服务器
简单修改即可投入生产使用

![示例](image.png)