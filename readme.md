# RPC 3
RPC，在Windows上称作“远程过程调用”。作为系统的关键组件，在WinB上也无可辩驳地成为了通信核心

此RPC支持双向JS调用、双向Pipe和调用链，让诸多有双向或短时间内单向调用需求的项目有了更多选择

# 快速开始

在 v1.1中，我们将三个文件合并成了一个 `mod.ts`.
RPCBrowser给浏览器使用，RPC给Deno和浏览器共用

## Deno

    import { RPC, Env } from 'https://deno.land/x/webrpc/mod.ts';
    Deno.serve(function(req){
        const rpc = new RPC(),
            {socket,response} = Deno.upgradeWebSocket(req);
        rpc.socket = socket;
        return response;
    }
    Env.provide('...',...)

## 浏览器

    // 这里使用了RPCBrowser，可以更方便地用在客户端上
    // 当然，Deno做客户端也可以
    import { RPCBrowser, Env } from 'mod.js';
    const rpc = new RPCBrowser('ws://demo.com/rpc/ws');
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