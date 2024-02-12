import Env from "./env"
import { ErrorTrace, parse_stack } from "./utils";

interface Reject{
    type: 'reject',
    name: string,
    message: any,
    trace: Array<ErrorTrace>,
    id: string
}

interface Resolve{
    type: 'resolve',
    data: any,
    id: string
}

interface Call{
    type: 'call',
    name: string,
    args: Array<string>,
    id: string
}

interface Var{
    type: 'var',
    var: string,
    data?: string,
    id: string
}

interface Pipe{
    type: 'pipe',
    call?: string,
    action?: 'close' | 'open',
    data: any,
    id: string
}

type Handler = {
    clear: 'once' | 'never',
    id: string,
    handle: (data:any) => void,
    error?: (error:any) => void
}

export type RPCData = Reject | Resolve | Call | Var | Pipe;

export type RPCPipe = {readable: ReadableStream,writeable: WritableStream};

export type RPCallback = Function & {
    pipe: boolean,
    once: boolean
}

/**
 * 抛出一个远程错误
 */
export class RPCError extends Error{
    readonly name:string;
    readonly message:string;
    readonly stack: string;

    /**
     * 初始化一个远程错误
     * 此错误应该由内部产生
     * 
     * @param data 错误数组
     */
    constructor(data:[string,string,Array<ErrorTrace>]){
        super(data[1]);
        this.name = data[0];
        this.message = data[1];
        this.stack = `${data[0]}: ${data[1]}`;
        for (const item of data[2]) 
            this.stack += `\n\tat ${item.file} (${item.file}:${item.line}:${item.col})`;
    }

    /**
     * 将错误转换为字符串
     * @returns 完整错误
     */
    toString(){
        return this.stack;
    }
}

/**
 * 标准RPC，客户端版和服务端版需要额外填充
 * 其中单下划线的是接收方法，双下划线的是实用函数
 */
export default class RPCBaseline{
    /**
     * 等待的请求
     */
    protected $requests:Record<string,Handler> = [] as any;
    
    /**
     * 环境，用于存储变量和调用函数
     */
    protected $env = new Env;

    /**
     * WebSocket对象，需要包装的class补全
     */
    protected $ws?:WebSocket;

    /**
     * 队列，当WebSocket可用时发送
     */
    protected $eque:Array<string> = [];

    set socket(socket:WebSocket){

        const handle = () => {
            // 发送队列数据
            for (const item of this.$eque) 
                socket.send(item);
            // 清理数据
            this.$eque = [];
            this.$ws = socket;
        }
        
        // 等待打开
        if(socket.readyState != socket.OPEN) socket.onopen = handle;
        else handle();

        // 处理字符串数据
        socket.onmessage = (data) => typeof data.data == 'string' && this.__accept(data.data);
    }


    protected __accept(str:string){
        try{
            try{
                var data = JSON.parse(str) as RPCData;
            }catch{
                return this.$ws && this.$ws.close(1001,'Bad JSON data');
            }

            switch (data.type) {
                case "reject":
                    this._reject(data);
                break;

                case "resolve":
                    this._resolve(data);
                break;

                case "call":
                    this._call(data);
                break;

                case "var":
                    this._var(data);
                break;

                case "pipe":
                    this._pipe(data);
                break;
            }
        }catch(e){
            console.error(e);
        }
    }
    
    protected __reject(e:any,id:string){
        if(e instanceof Error){
            this.__show({
                type: 'reject',
                name: e.name,
                message: e.message,
                trace: parse_stack(e.stack || ''),
                id: id
            });
        }else{
            this.__show({
                type: 'reject',
                name: 'Error',
                message: e,
                trace: [],
                id: id
            });
        }
    }

    __random(){
        let rd;
        do{
            rd = (Math.random() * 100000).toString(36);
        }while(rd in this.$requests);
        return rd;
        
    }

    call(func:string,args:Array<any> = []){
        const id = this.__random();
        this.__show({
            type: 'call',
            args,
            id,
            name: func
        });
        return new Promise((rs,rj) => 
            this.$requests[id] = {
                "clear": "once",
                "handle": rs,
                "error": rj,
                id
            }
        );
    }

    query(name:string,value?:any){
        const id  = this.__random();
        this.__show({
            type: 'var',
            data: value,
            var: value,
            id
        });
        if(!value) return new Promise((rs,rj) => 
            this.$requests[id] = {
                "clear": "once",
                "handle": rs,
                id
            }
        );
    }

    pipe(func:string,args:Array<any> = []){
        const id = this.__random(),
            pipe = this.__stream(id);
        this.__show({
            type: 'pipe',
            action: 'open',
            data: args,
            id,
            call: func,
        });
        return pipe;
    }

    /**
     * 发送给对方
     * @param data 发送给对方的数据
     */
    protected async __show(data:RPCData):Promise<void>{
        const str = JSON.stringify(data);

        // 删除handle
        if(data.id in this.$requests && this.$requests[data.id].clear == 'once')
            delete this.$requests[data.id];

        // 加入队列
        if(this.$ws && this.$ws.readyState == WebSocket.OPEN) this.$ws.send(str);
        else this.$eque.push(str);
    }

    protected async _call(data:Call){
        const func:RPCallback = this.$env.get(data.name);
        if(typeof func != 'function' || func.pipe) 
            return this.__reject(new TypeError( data.name+' is not callable' ),data.id);

        try{
            const result = await func.apply(this,data.args);
            if(data.id) this.__show({
                type: 'resolve',
                data: result,
                id: data.id
            });
            // 单次调用的函数
            if(func.once) this.$env.set(data.name,undefined);
        }catch(e){
            this.__reject(e,data.id);
        }
    }

    protected __stream(id:string){
        let handle = {
            clear: 'never',
            id,
            handle(data) {
                ctrl && ctrl.enqueue(data);
            },
            error(){
                ctrl && ctrl.close();
            }
        } satisfies Handler,ctrl:ReadableStreamDefaultController;
        // 创建等位stream流
        const pipe = {
            readable: new ReadableStream({ start: c => ctrl = c }),
            writeable: new WritableStream({
                write: data => this.__show({
                    type: 'pipe',
                    data,
                    id
                })
            })
        } satisfies RPCPipe;
        // 加入请求池中
        this.$requests[id] = handle;
        return pipe;
    }

    protected async _pipe(data:Pipe){
        // 不存在
        if(!(data.id in this.$requests)){
            // 创建
            if(data.action == 'open'){
                if(typeof data.call != 'string' || ! (data.data instanceof Array))
                    return this.__reject(new TypeError( 'invalid data found.' ),data.id);

                const func:RPCallback = this.$env.get(data.call);
                if(!func.pipe)
                    return this.__reject(new TypeError( data.call + ' is not a pipe constructor' ),data.id);

                try{
                    // 创建一个stream
                    data.data.unshift(this.__stream(data.id));
                    // 调用函数
                    await func.apply(this,data.data);
                    // 单次调用的函数
                    if(func.once) this.$env.set(data.call, undefined);
                }catch(e){
                    this.__reject(e,data.id);
                }
            }else return this.__reject(new TypeError('Pipe '+data+' Not exists.'),data.id);
        // 存在：传递数据
        }else{
            const handle = this.$requests[data.id];
            if(handle.clear == 'once') 
                return this.__reject(new TypeError(data + ' is not a vaild pipe'),data.id);
            else if(data.action == 'close')
                handle.error && handle.error(null);
            else handle.handle(data.data);
        }
    }

    protected _resolve(data:Resolve){
        const handle = this.$requests[data.id];
        handle.handle(data.data);
    }

    protected _reject(data:Reject){
        const handle = this.$requests[data.id];
        const error = new RPCError([data.name,data.message,data.trace]);
        if(handle.error) handle.error(error);
        else console.warn(error);
    }

    protected _var(data:Var){
        if(typeof data.var != 'string')
            return this.__reject(new TypeError( 'invalid data found.' ),data.id);
        if(data.data) this.$env.set(data.var, data.data);
        else this.__show({
            type: 'resolve',
            data: this.$env.get(data.var),
            id: data.id
        });
    }
}