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