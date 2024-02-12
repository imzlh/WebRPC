import RPCBaseline from "./share";

export default class RPC extends RPCBaseline{

    readonly $url;
    /**
     * 处理RPC连接断开的事件
     */
    public $onClose?:(ws:WebSocket,ev:CloseEvent) => void;
    /**
     * 处理WebSocket错误的回调
     */
    public $onError?:(ws:WebSocket,ev:Event) => void;

    /**
     * 初始化RPC连接
     * 此连接会无线重连，除非使用close()
     * @param server 
     */
    constructor(server:string){
        super();
        this.$url = server;

        const open = () => {
            const ws = new WebSocket(server);
            ws.onclose = ev => {
                this.$onClose && this.$onClose(ws,ev)
                open();
            }
            ws.onerror = ev => this.$onError && this.$onError(ws,ev);
            this.socket = ws;
        }

        open();
    }

    /**
     * 关闭RPC连接且不再重连
     * @param reason 关闭原因
     */
    close(reason?:string){
        if(this.$ws){
            this.$ws.onclose = null;
            this.$ws.onerror = null;
            this.$ws.close(1000,reason);
        }
    }
}