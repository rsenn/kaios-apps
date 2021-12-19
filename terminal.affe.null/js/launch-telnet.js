/* Terminal application for KaiOS
 * file: launch-telnet.js
 * Copyright (C) 2020 Affe Null
 * See LICENSE.txt for more details.
 */

/* Start the telnet server */

!(function () {
  var ext = navigator.engmodeExtension || navigator.kaiosExtension;

  if(ext) ext.startUniversalCommand('COLUMNS=20 LINES=13 busybox telnetd -b 127.0.0.1 -l /system/bin/bash', true).onsuccess = main;
  else setTimeout(() => main(), 10);

  /* Starts main part of the app only when the telnet server has started
   */
})();

if(!navigator.mozTCPSocket)
  navigator.mozTCPSocket = {
    open: function() {
      const { hostname, port, protocol } = window.location;
      const url = protocol.replace('http', 'ws') + '//' + hostname + ':' + port + '/ws';
      let ws = (globalThis.ws = new WebSocket(url));

      ws.onmessage = function(event) {
        let { data } = event;
        data.arrayBuffer().then(buf => {
          let str = new Uint8Array(buf).reduce((s, c) => s + String.fromCharCode(c), '');
          console.log('onmessage', str);
          if(typeof ws.ondata == 'function') {
            ws.ondata({ data: str });
          }
        });
      };
      return ws;
    }
  };
