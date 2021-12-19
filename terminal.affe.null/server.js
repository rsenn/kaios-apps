import * as std from 'std';
import * as os from 'os';
import path from 'path';
import { Console } from 'console';
import REPL from 'repl';
import inspect from 'inspect';
import { extendArray, ArrayExtensions, SyscallError, errors, types, hasBuiltIn, format, formatWithOptions, assert, setInterval, clearInterval, memoize, once, waitFor, define, weakAssign, getConstructorChain, hasPrototype, filter, curry, split, unique, getFunctionArguments, randInt, toBigInt, lazyProperty, getOpt, toUnixTime, unixTime, fromUnixTime, ansiStyles } from 'util';
import * as fs from 'fs';
import * as net from 'net';
import { Socket } from 'sockets';
import { EventEmitter } from 'events';
import { Repeater } from 'repeater';

import rpc from 'rpc';
import * as rpc2 from 'rpc';

globalThis.fs = fs;

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

function main(...args) {
  const base = path.basename(process.argv[1], '.js').replace(/\.[a-z]*$/, '');
  const config = ReadJSON(`.${base}-config`) ?? {};
  globalThis.console = new Console({ inspectOptions: { compact: 2, customInspect: true } });
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
  console.log('params', params);
  const { address = '127.0.0.1', port = 8999, 'ssl-cert': sslCert = 'localhost.crt', 'ssl-private-key': sslPrivateKey = 'localhost.key' } = params;
  const listen = params.connect && !params.listen ? false : true;
  const server = !params.client || params.server;
  Object.assign(globalThis, { ...rpc2, rpc });
  let name = process.argv[1];
  name = name
    .replace(/.*\//, '')
    .replace(/-/g, ' ')
    .replace(/\.[^\/.]*$/, '');

  let [prefix, suffix] = name.split(' ');

  let repl = new REPL(`\x1b[38;5;165m${prefix} \x1b[38;5;39m${suffix}\x1b[0m`, fs, false);

  repl.historyLoad(null, false);

  repl.help = () => {};
  let { log } = console;
  repl.show = arg => std.puts((typeof arg == 'string' ? arg : inspect(arg, globalThis.console.options)) + '\n');

  repl.cleanup = () => {
    repl.readlineRemovePrompt();
    let numLines = repl.historySave();

    repl.printStatus(`EXIT (wrote ${numLines} history entries)`, false);

    std.exit(0);
  };

  console.log = repl.printFunction(log);

  let cli = (globalThis.sock = new rpc.Socket(`${address}:${port}`, rpc[`RPC${server ? 'Server' : 'Client'}Connection`], +params.verbose));

  cli.register({ Socket, Worker: os.Worker, Repeater, REPL, EventEmitter });

  let connections = new Set();
  const createWS = (globalThis.createWS = (url, callbacks, listen) => {
    console.log('createWS', { url, callbacks, listen });

    net.setLog((params.debug ? net.LLL_USER : 0) | (((params.debug ? net.LLL_NOTICE : net.LLL_WARN) << 1) - 1), (level, ...args) => {
      repl.printStatus(...args);
      //if(params.debug) console.log((['ERR', 'WARN', 'NOTICE', 'INFO', 'DEBUG', 'PARSER', 'HEADER', 'EXT', 'CLIENT', 'LATENCY', 'MINNET', 'THREAD'][Math.log2(level)] ?? level + '').padEnd(8), ...args);
    });

    return [net.client, net.server][+listen]({
      tls: params.tls,
      sslCert,
      sslPrivateKey,
      mimetypes: [
        ['.svgz', 'application/gzip'],
        ['.json', 'application/json'],
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
      mounts: {
        '/': ['/', '.', 'index.html'],
        '/404.html': function* (req, res) {
          console.log('/404.html', { req, res });
          yield '<html><head><meta charset=utf-8 http-equiv="Content-Language" content="en"/><link rel="stylesheet" type="text/css" href="/error.css"/></head><body><h1>403</h1></body></html>';
        },
        proxy(req, res) {
          const { url, method, headers } = req;
          const { status, ok, type } = res;

          console.log('proxy', { url, method, headers }, { status, ok, url, type });
        }, 
      },
      ...url,

      ...callbacks,
      onConnect(ws, req) {
        console.log('test-rpc', { ws, req });
        connections.add(ws);

        return callbacks.onConnect(ws, req);
      },
      onClose(ws) {
        connections.delete(ws);

        return callbacks.onClose(ws, req);
      },
      onHttp(req, rsp) {
        const { url, method, headers } = req;
        console.log('\x1b[38;5;33monHttp\x1b[0m [\n  ', req, ',\n  ', rsp, '\n]');
        return rsp;
      },
      onMessage(ws, data) {
        console.log('onMessage', ws, data);
        return callbacks.onMessage(ws, data);
      },
      onFd(fd, rd, wr) {
        // console.log('onFd', { fd, rd, wr });
        return callbacks.onFd(fd, rd, wr);
      },
      ...(url && url.host ? url : {})
    });
  });
  globalThis[['connection', 'listener'][+listen]] = cli;

  define(globalThis, {
    get connections() {
      return [...connections];
    }
  });

  Object.assign(globalThis, {
    repl,
    ...rpc,
    quit,
    exit: quit,
    Socket,
    cli,
    net,
    std,
    os,
    fs,
    path,
    ReadJSON,
    WriteFile,
    WriteJSON
  });

  define(globalThis, listen ? { server: cli, cli } : { client: cli, cli });
  delete globalThis.DEBUG;
  Object.defineProperty(globalThis, 'DEBUG', { get: DebugFlags });

  if(listen) cli.listen(createWS, os);
  else cli.connect(createWS, os);

  function quit(why) {
    console.log(`quit('${why}')`);

    let cfg = { inspectOptions: console.options };
    WriteJSON(`.${base}-config`, cfg);
    repl.cleanup(why);
  }

  repl.runSync();
}

try {
  main(...scriptArgs.slice(1));
} catch(error) {
  console.log(`FAIL: ${error?.message ?? error}\n${error?.stack}`);
  std.exit(1);
} finally {
  //console.log('SUCCESS');
}
