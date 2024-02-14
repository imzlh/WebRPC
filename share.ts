/**
 * WebRPC
 * 基于WebSocket协议的双向远程调用的JS框架
 * Copyright(C) 2024 izGroup
 * 
 * @version 1.2
 * @author iz
 * @link https://webrpc.imzlh.top/
 * @license MIT
 */

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

type TYPE = {
    "string": string,
    "number": number,
    "boolean": boolean,
    "undefined": undefined,
    "object": object & Record<string,any>
};

interface Var{
    type: 'var',
    var: string,
    data?: string,
    check?: keyof TYPE,
    id: string
}

interface Pipe{
    type: 'pipe',
    call?: string,
    action?: 'close' | 'open',
    data: any,
    id: string
}

interface PCall{
    type: 'pcall',
    call: Array<Prepare>,
    safe?: boolean,
    id: string
}

type Handler = {
    clear: 'once' | 'never',
    id: string,
    handle: (data:any) => void,
    error?: (error:any) => void
}

export type RPCData = Reject | Resolve | Call | Var | Pipe | PCall;

export type RPCPipe = {readable: ReadableStream,writeable: WritableStream};

export type RPCallback = Function & {
    pipe: boolean,
    once: boolean
}

export interface ErrorTrace {
    line: number,
    col: number,
    func: string,
    file: string
}

/**
* 解析Error对象中追踪字符串
* 自动隐藏Deno、WinB内部文件
* 
* @param stack Error内容
* @returns 追踪数组
*/
export function parse_stack(stack: string) {
    const data = stack.split('\n'),
        trace: Array<ErrorTrace> = [];
    data.shift();
    for (const item of data) {
        const data = item.match(/\s*at (?:(.+?) )?\((.+)\)\s*/i);
        if (!data) continue;
        const [, func, pos] = data,
            [file, line, col] = _split(pos, ':', 3),
            test = file.split(':');
        // deno的ext
        if (test.length > 0 && test[0] == 'ext') continue;
        // import.meta
        if(import.meta.url == file) continue;
        trace.push({ file, func, line: parseInt(line), col: parseInt(col) });
    }
    return trace;
}

/**
 * 从最后处开始分离字符串为数组
 * @param str 字符串
 * @param char 分离标志
 * @param length 分离的次数
 * @returns 分离结果
 */
function _split(str: string, char: string, length: number){
    let pos1 = str.length, pos2;
    const res = [];
    for (let i = 0; i < length - 1; i++) {
        pos2 = str.lastIndexOf(char, pos1 - 1);
        res.unshift(str.substring(pos2 + char.length, pos1));
        pos1 = pos2;
    }
    res.unshift(str.substring(0, pos2));
    return res;
}

export class FunctionProxy{

    readonly $parent;
    readonly $key;
    readonly pipe;
    readonly once;

    constructor(parent:Record<string,any>,key:string){
        this.$parent = parent,this.$key = key;
        const el = parent[key] as RPCallback;
        this.pipe = el.pipe;
        this.once = el.once;
    }

    set(data:any){
        this.$parent[this.$key] = data;
    }

    get(){
        return this.$parent[this.$key]()
    }

    apply(_self:any,data:Array<any>,force = false):any{
        if(force) return this.$parent[this.$key].apply(_self ,data);
        else return this.$parent[this.$key](...data);
    }
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

export class Env{

    /**
     * 全局作用域
     */
    static $global:Record<string,any> = {};

    /**
     * 单个请求作用域
     */
    protected $data:Record<string,any> = {};

    static _get(name:string,current:Record<string,any>):any{
        const path = name.split('.'),
            last = path.at(-1) as string;
        for (let i = 0; i < path.length-1; i++) {
            const next = path[i];
            if(!(next in current)) return null;
            current = current[next];
        }
        if(typeof current != 'object')
            throw new TypeError('Object '+last+' not found.');
        if(typeof current[last] == 'function')
            return new FunctionProxy(current,last);
        else return current[last];
    }

    static _set(name:string,current:Record<string,any>,value:any){
        const path = name.split('.');
        for (let i = 0; i < path.length-1; i++) {
            const next = path[i];
            if(!(next in current)) current[next] = {};
            current = current[next];
        }
        current[path.at(-1) as string] = value;
    }

    static provide(name:string,func:((this:RPCBaseline,...data:Array<any>) => void),opt:{
        pipe?: boolean,
        once?: boolean
    } = {}){
        this._set(name,this.$global,func);
        (<any>func as RPCallback).pipe = opt.pipe || false,(<any>func as RPCallback).once = opt.once || false;
    }

    set(name:string,value:any):void{
        Env._set(name,this.$data,value);
    }

    get(name:string){
        return Env._get(name,this.$data) || Env._get(name,Env.$global);
    }
}

type Prepare = {call: string,args: any};

/**
 * 准备调用函数构造方法，允许连续赋值
 */
class Prepared{

    readonly $callback;
    readonly $prepared:Array<Prepare> = [];

    constructor(callback:(data:Array<Prepare>,pcall:boolean) => Promise<any>){
        this.$callback = callback;
    }

    /**
     * 继续调用，参考 `RPC.prepare()` 的JSDOC文档
     * 
     * @param call 调用的函数，允许 "&.func"
     * @param args 参数，允许 "$[data]"
     */
    then(call:string,args:Array<any>){
        this.$prepared.push({call,args});
        return this;
    }

    /**
     * 立即发送请求，返回最后一个函数的调用结果
     * @param pcall 安全调用，不会报错
     * @returns 结果
     */
    send(pcall = false){
        return this.$callback(this.$prepared,pcall);
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

    /**
     * 绑定一个WebSocket
     * 在Web端强烈建议不要修改此项而是使用自带的连接管理
     */
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

    /**
     * 实例的运行环境，只读
     */
    get env(){
        return this.$env;
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

                case "pcall":
                    this._prepare(data);
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

    protected _prepare(data:PCall){
        const prepared = data.call,id = data.id,
            preg1 = /$([0-9]+)?\[(.+)\]/g,
            preg2 = /^\&([0-9]+)?(?:\.(.+))?$/;
        let result:Array<Record<string,any>> = [];

        // 根据索引找内容
        function getElement(key:string,current:Record<string,any>){
            if(!key) return current;

            const path = key.split('.'),
                last = path.at(-1) as string;
            for (let i = 0; i < path.length-1; i++) {
                const next = path[i];
                if(current == undefined || typeof current != 'object')
                    if(data.safe) return null;
                    else throw new TypeError('Cannot read properties of '+(typeof current)+' (reading \''+next+'\')');
                current = current[next];
            }
            if(!current || typeof current != 'object')
                throw new TypeError('Object '+last+' not found.');
            if(typeof current[last] == 'function')
                return new FunctionProxy(current,last);
            else return current[last];
        }

        // 解析字符串，支持插值、引用
        function parseStr(str:string):any{
            let target;
            // 引用
            if(preg2.test(str)){
                const [,_id,path] = str.match(preg2) as RegExpMatchArray;
                if(_id){
                    if(_id in result)
                        target = getElement(path,result[_id as any]);
                    else
                        throw new TypeError('result id#'+_id+' not exists.');
                }else
                    target = getElement(path,result.at(-1) || {});
            // 插值
            }else
                target = str.replaceAll(preg1,function(_,data){
                    const elem = getElement(data,result.at(-1) || {});
                    return elem ? elem.toString() : '';
                });
            return target;
        }

        // 深度搜索
        function tree(object:Record<string,any>){

            const newData:Record<string,any> = {};

            for (const key in object) {
                // 私有属性
                if (!Object.prototype.hasOwnProperty.call(object, key)) continue;

                const element = object[key];
                if(typeof element == 'string'){
                    // 分析并替换
                    return parseStr(element)
                }else if(typeof element == 'object'){
                    // 深度搜索
                    newData[key] = tree(element);
                }else{
                    // 直接原样传递
                    newData[key] = element;
                }
            }

            return newData;
        }

        // 主程序
        for (const call of prepared) {
            let target:FunctionProxy = parseStr(call.call);
            if(typeof target == 'string')
                target = this.$env.get(target);
            if(target instanceof FunctionProxy){
                if(target.pipe)
                    this.__reject('PipeOnly function is not allowed.Use call() instead.',id);
                try{
                    let arg = tree(call.args);
                    if(typeof arg == 'object' && arg.constructor.name == 'Object')
                            arg = Object.values(arg);
                    else
                        arg = [arg];
                    result.push(target.apply(this,arg));
                }catch(e){
                    // 安全调用不会报错
                    if(!data.safe) this.__reject(e,id);
                    result.push({});
                }
            }else this.__reject(call.args + ' is not callable',id);
        }

        // 返回结果
        this.__show({
            type: 'resolve',
            id,
            data: result.at(-1)
        });
    }

    protected __random(){
        let rd;
        do{
            rd = (Math.random() * 100000).toString(36);
        }while(rd in this.$requests);
        return rd;
    }

    /**
     * 向远程发送调用函数请求。
     * 只能调用非pipe函数，否则会报错
     * 
     * 如果抛出错误，将传递并抛出RPCError
     * 大部分报错内容会直接传递，做到好像真的是本地调用
     * 
     * @example <caption>简单的调用</caption>
     * // expect: hello everyone
     * await RPC.call('a.b.c.d.hello',['hello','everyone']);
     * 
     * @param func 调用的内容，一般是函数名
     * @param args 参数，调用函数时会用到
     * @returns 返回的内容
     */
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

    /**
     * 向远程发送一个操作变量请求
     * 如果提供了第二个参数，则认为是赋值操作
     * 
     * 这个函数不会报错，请放心使用
     * 
     * 类型检查提供了简易的方法在对方发送前判断类型
     * 比如需要一个Boolean却返回了一个超大的Object，这个方法就十分有用
     * 
     * @example <caption>寄存一个变量</caption>
     * const data = 'hello';
     * await RPC.query('test.temp',data);
     * await RPC.query('test').temp == data;   // true
     * await RPC.query('test',null,'boolean'); // null
     * 
     * @param name 变量名
     * @param value 赋值
     * @param check 类型检查
     * @returns 变量内容
     */
    query<T extends keyof TYPE>(name:string,value?:any,check?:T):Promise<TYPE[T] | null>{
        const id  = this.__random();
        this.__show({
            type: 'var',
            data: value,
            var: value,
            check,
            id
        });
        return new Promise(rs => 
            value ? this.$requests[id] = {
                "clear": "once",
                "handle": rs,
                id
            } : rs(null)
        ) as any;
    }

    /**
     * RPC3 双向Pipe请求
     * 可以发送JSON可序列化的任何数据，包括复杂的Object对象，但是会有序列化反序列化的延迟
     * 单个WebSocket连接理论上只要硬件和带宽充足理论上可以承载无限双向Pipe
     * 
     * ** 当关闭连接后会关闭对方的管道，所以循环时需要判断是否可写！**
     * 
     * @example <caption>pipe管道调用</caption>
     * const pipe = _C.pipe('echo',[]);
     * console.log(pipe); // {writeable: WritableStream ,readable: ReadableStream}
     * // echo函数实现只需要一行：pipe.readable.pipeTo(pipe.writeable);
     * 
     * @param func 
     * @param args 
     * @returns 
     */
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
     * RPC3 扩展 连续赋值调用
     * 可以让函数返回值立即用于调用其他函数
     * 
     * 虽然这是一个实验性的功能，但是很好用！
     * 
     * 在任何地方，只需要以 `$[a.b.c]` 即可插值，如
     * ```js
     * // 假设1返回值是 ['Good morning!','zlh',{a:1,b:{c:'Hello again'}}]
     * "$[1]hello,im$[2]"   // 在Array返回值中提取
     * "&.3.b"              // 此处的&表示引用，其指向内容 可以为任何值，包括Object
     * "$[3.b]/"            // 此时由于RPC调用.toString()方法，变成了[Object object]/
     * "$[4.b]/"            // Uncaught TypeError，如果设置了safeMode则不插入任何值
     * ```
     * 但是我们不推荐复杂的Object传入，开销很大
     * 
     * @example <caption>将文件上传到example.com</caption>
     * // 需要将Deno和fetch对象暴露，即Env.provide(...);
     * RPC.prepare('Deno.open', ['/demo.mp4',{read: true,write: false}])
     *      .then('fetch',[{
     *           body: "&.readable",   // 这个地方使用了引用
     *           method: 'POST',
     *           headers: {
     *               'Content-Type': 'video/mpeg4'
     *           }
     *       }])
     *       // &表示对上一个结果的引用，只限于参数1中
     *       .then('&.json',[])
     *       // 使用自带的函数echo，回显结果
     *       .then('echo',"state: $[code]",true);
     */
    prepare(name:string,args:Array<any> = []){
        const id = this.__random();
        return new Prepared((call,safe) => new Promise((rs,rj) => {
            this.__show({
                type: 'pcall',
                call,
                id,
                safe
            })
            this.$requests[id] = {
                "clear": "once",
                "handle": rs,
                "error": rj,
                id
            }
        })).then(name,args);
    }

    /**
     * 发送给对方
     * @param data 发送给对方的数据
     */
    protected __show(data:RPCData):void{
        const str = JSON.stringify(data);

        // 删除handle
        if(data.id in this.$requests && this.$requests[data.id].clear == 'once')
            delete this.$requests[data.id];

        // 加入队列
        if(this.$ws && this.$ws.readyState == WebSocket.OPEN) this.$ws.send(str);
        else this.$eque.push(str);
    }

    protected async _call(data:Call){
        const func:FunctionProxy = this.$env.get(data.name);
        if(!(func instanceof FunctionProxy) || func.pipe) 
            return this.__reject(new TypeError( data.name+' is not callable' ),data.id);

        try{
            const result = await (func as any).apply(this,data.args,true);
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
        else {
            let result = this.$env.get(data.var);
            if(data.check && typeof result != data.check)
                result = null;
            this.__show({
                type: 'resolve',
                data: result,
                id: data.id
            });
        }
    }
}