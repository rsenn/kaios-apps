import * as std from 'std';
import * as os from 'os';
import path from 'path';
import { Console } from 'console';
import REPL from 'repl';
import inspect from 'inspect';
import { JS_EVAL_FLAG_BACKTRACE_BARRIER, Location, dupArrayBuffer, escape, getPrototypeChain, isArray, isBigDecimal, isBigFloat, isBigInt, isBool, isCFunction, isConstructor, isEmptyString, isError, isException, isExtensible, isFunction, isHTMLDDA, isInstanceOf, isInteger, isJobPending, isLiveObject, isNull, isNumber, isObject, isRegisteredClass, isString, isSymbol, isUncatchableError, isUndefined, isUninitialized, isArrayBuffer, rand, toArrayBuffer, toString, watch, extendArray, ArrayExtensions, SyscallError, errors, types, hasBuiltIn, format, formatWithOptions, assert, setInterval, clearInterval, memoize, once, waitFor, define, weakAssign, getConstructorChain, hasPrototype, filter, curry, split, unique, getFunctionArguments, randInt, toBigInt, lazyProperty, getOpt, toUnixTime, unixTime, fromUnixTime, ansiStyles } from 'util';
import * as fs from 'fs';
import * as net from 'net';
import { EventEmitter } from 'events';
import { Repeater } from 'repeater';

import rpc from 'rpc';
import * as rpc2 from 'rpc';

import { socklen_t, SockAddr, Socket, AF_INET, SOCK_STREAM, IPPROTO_IP, IPPROTO_TCP, O_NONBLOCK, SO_ERROR, SO_REUSEPORT, SO_REUSEADDR, SOL_SOCKET } from 'sockets';

globalThis.fs = fs;

extendArray();

function ReadJSON(filename) {
  let data = fs.readFileSync(filename, 'utf-8');

  if(data) console.debug(`${data.length} bytes read from '${filename}'`);
  return data ? JSON.parse(data) : null;
}

function WriteFile(name, data, verbose = true) {
  if(types.isGeneratorFunction(data)) {
    let fd = fs.openSync(name, os.O_WRONLY | os.O_TRUNC | os.O_CREAT, 0x1a4);
    let r = 0;
    for(let item of data) {
      r += fs.writeSync(fd, toArrayBuffer(item + ''));
    }
    fs.closeSync(fd);
    let stat = fs.statSync(name);
    return stat?.size;
  }
  if(types.isIterator(data)) data = [...data];
  if(types.isArray(data)) data = data.join('\n');

  if(typeof data == 'string' && !data.endsWith('\n')) data += '\n';
  let ret = fs.writeFileSync(name, data);

  if(verbose) console.log(`Wrote ${name}: ${ret} bytes`);
}

function WriteJSON(name, data) {
  WriteFile(name, JSON.stringify(data, null, 2));
}

function StartREPL(prefix = path.basename(process.argv[1], '.js'), suffix = '') {
  let repl = new REPL(`\x1b[38;5;165m${prefix} \x1b[38;5;39m${suffix}\x1b[0m`, fs, false);

  repl.historyLoad(null, false);
  repl.inspectOptions = { ...console.options, compact: 2 };
  repl.help = () => {};
  let { log } = console;
  repl.show = arg => std.puts((typeof arg == 'string' ? arg : inspect(arg, repl.inspectOptions)) + '\n');
  repl.cleanup = () => {
    repl.readlineRemovePrompt();
    let numLines = repl.historySave();
    repl.printStatus(`EXIT (wrote ${numLines} history entries)`, false);
    std.exit(0);
  };

  console.log = repl.printFunction((...args) => {
    log(console.config(repl.inspectOptions), ...args);
  });

  repl.run();
  return repl;
}

function main(...args) {
  console.log('process.argv', process.argv);
  const base = path.basename(process.argv[1], '.js').replace(/\.[a-z]*$/, '');

  const config = ReadJSON(`.${base}-config`) ?? {};
  globalThis.console = new Console(std.err, {
    inspectOptions: { compact: 2, customInspect: true }
  });
  let params = getOpt(
    {
      verbose: [false, (a, v) => (v | 0) + 1, 'v'],
      listen: [false, null, 'l'],
      connect: [false, null, 'c'],
      client: [false, null, 'C'],
      server: [false, null, 'S'],
      debug: [false, null, 'x'],
      tls: [false, null, 't'],
      'no-tls': [false, (v, pv, o) => ((o.tls = false), true), 'T'],
      address: [true, null, 'a'],
      port: [true, null, 'p'],
      'ssl-cert': [true, null],
      'ssl-private-key': [true, null],
      '@': 'address,port'
    },
    args
  );
  if(params['no-tls'] === true) params.tls = false;
  const { address = '0.0.0.0', port = 8999, 'ssl-cert': sslCert = 'localhost.crt', 'ssl-private-key': sslPrivateKey = 'localhost.key' } = params;
  const listen = params.connect && !params.listen ? false : true;
  const server = !params.client || params.server;
  let name = process.argv[1];
  name = name
    .replace(/.*\//, '')
    .replace(/-/g, ' ')
    .replace(/\.[^\/.]*$/, '');

  let [prefix, suffix] = name.split(' ');

  let protocol = new WeakMap();
  let sockets = (globalThis.sockets ??= new Set());
  const createWS = (globalThis.createWS = (url, callbacks, listen) => {
    console.log('createWS', { url, callbacks, listen });

    net.setLog((params.debug ? net.LLL_USER : 0) | (((params.debug ? net.LLL_NOTICE : net.LLL_WARN) << 1) - 1), (level, ...args) => {
      console.log(...args);
      if(params.debug) console.log((['ERR', 'WARN', 'NOTICE', 'INFO', 'DEBUG', 'PARSER', 'HEADER', 'EXT', 'CLIENT', 'LATENCY', 'MINNET', 'THREAD'][Math.log2(level)] ?? level + '').padEnd(8), ...args);
    });

    let options;
    let child, dbg;

    return [net.client, net.server][+listen](
      (options = {
        tls: params.tls,
        sslCert,
        sslPrivateKey,
        mimetypes: [
          ['.svgz', 'application/gzip'],
          ['.mjs', 'application/javascript'],
          ['.wasm', 'application/octet-stream'],
          ['.eot', 'application/vnd.ms-fontobject'],
          ['.lib', 'application/x-archive'],
          ['.bz2', 'application/x-bzip2'],
          ['.gitignore', 'text/plain'],
          ['.cmake', 'text/plain'],
          ['.hex', 'text/plain'],
          ['.md', 'text/plain'],
          ['.pbxproj', 'text/plain'],
          ['.wat', 'text/plain'],
          ['.c', 'text/x-c'],
          ['.h', 'text/x-c'],
          ['.cpp', 'text/x-c++'],
          ['.hpp', 'text/x-c++'],
          ['.filters', 'text/xml'],
          ['.plist', 'text/xml'],
          ['.storyboard', 'text/xml'],
          ['.vcxproj', 'text/xml'],
          ['.bat', 'text/x-msdos-batch'],
          ['.mm', 'text/x-objective-c'],
          ['.m', 'text/x-objective-c'],
          ['.sh', 'text/x-shellscript']
        ],
        mounts: [['/', '.', 'debugger.html']],
        ...url,

        ...callbacks,
        onConnect(ws, req) {
          console.log('debugger-server', { ws, req });
          let onward = (ws.onward = new Socket(AF_INET, SOCK_STREAM, IPPROTO_TCP));
          let remote = new SockAddr(AF_INET, '127.0.0.1', 23);

          onward.setsockopt(SOL_SOCKET, SO_REUSEADDR, [1]);
          onward.ndelay(true);

          let ret = onward.connect(remote);
          console.log('connect', ret);

          os.setWriteHandler(onward.fd, () => {
            console.log('connected', onward.fd);
            os.setWriteHandler(onward.fd, null);

            os.setReadHandler(onward.fd, () => {
              let buf = new ArrayBuffer(1024);
              let ret = os.read(onward.fd, buf, 0, 1024);
              //console.log('read', ret);
              if(ret > 0) {
                ret = ws.send(buf.slice(0, ret), 0, ret);
                //console.log('sent', ret);
              } else {
                os.setReadHandler(onward.fd, null);
              }
            });
          });

          ws.sendMessage = function(msg) {
            let ret = this.send(JSON.stringify(msg));
            console.log(`ws.sendMessage(`, msg, `) = ${ret}`);
            return ret;
          };

          sockets.add(ws);
        },
        onClose(ws) {
          console.log('onClose', ws);
          dbg.close();

          protocol.delete(ws);
          sockets.delete(ws);
        },
        onHttp(req, rsp) {
          const { url, method, headers } = req;
          console.log('\x1b[38;5;33monHttp\x1b[0m [\n  ', req, ',\n  ', rsp, '\n]');
          return rsp;
        },
        onMessage(ws, data) {
          let { onward } = ws;
          let buf = toArrayBuffer(data);
          console.log('onMessage', { data, buf });
          let ret = os.write(onward.fd, buf, 0, buf.byteLength);

          if(ret >= 0) console.log('written', ret);
          else console.log('error:', std.strerror(-ret));
        },
        onFd(fd, rd, wr) {
          os.setReadHandler(fd, rd);
          os.setWriteHandler(fd, wr);

          //  console.log('onFd', { fd, rd, wr });
        },
        ...(url && url.host ? url : {})
      })
    );
  });

  define(globalThis, {
    get connections() {
      return [...globalThis.sockets];
    },
    get socklist() {
      return [...globalThis.sockets];
    },
    net,
    repl: StartREPL()
  });

  delete globalThis.DEBUG;

  globalThis.ws = createWS({ host: '127.0.0.1', port: 8999, location: '/ws' }, {}, true);
  //  Object.defineProperty(globalThis, 'DEBUG', { get: DebugFlags });

  /* if(listen) cli.listen(createWS, os);
  else cli.connect(createWS, os);
*/
  function quit(why) {
    console.log(`quit('${why}')`);

    let cfg = { inspectOptions: console.options };
    WriteJSON(`.${base}-config`, cfg);
    // repl.cleanup(why);
  }
}

try {
  main(...scriptArgs.slice(1));
} catch(error) {
  console.log(`FAIL: ${error?.message ?? error}\n${error?.stack}`);
  1;
  std.exit(1);
} finally {
  //console.log('SUCCESS');
}
