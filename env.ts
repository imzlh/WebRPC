import RPCBaseline, { RPCallback } from "./share";

type TYPE = {
    "string": string,
    "number": number,
    "boolean": boolean,
    "undefined": undefined,
    "object": object & Record<string,any>
};

export default class Env{

    /**
     * 全局作用域
     */
    static $global:Record<string,any> = {};

    /**
     * 单个请求作用域
     */
    protected $data:Record<string,any> = {};

    static _get(name:string,current:Record<string,any>):any{
        const path = name.split('.');
        for (let i = 0; i < path.length; i++) {
            const next = path[i];
            if(!(next in current)) return null;
            current = current[next];
        }
        return current;
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