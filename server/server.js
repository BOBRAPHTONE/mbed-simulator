const express = require('express');
const app = express();
const server = require('http').Server(app);
const ips = require('./get_ips')();
const bodyParser = require('body-parser');
const net = require('net');
const dgram = require('dgram');

if (ips.length === 0) {
    console.error('Could not get a public network interface. Do you have any network interfaces configured?');
    process.exit(1);
}

app.use(express.static(__dirname + '/../demos'));
app.use(bodyParser.json())

app.get('/api/network/ip', (req, res, next) => {
    res.send(ips[0].iface.address);
});

app.get('/api/network/mac', (req, res, next) => {
    res.send(ips[0].iface.mac);
});

app.get('/api/network/netmask', (req, res, next) => {
    res.send(ips[0].iface.netmask);
});

let sockets = {};
let socketIx = 0;

app.post('/api/network/socket_open', (req, res, next) => {
    if (req.body.protocol === 0) { // TCP
        console.log('Opening new TCP socket');
        let s = sockets[++socketIx] = new net.Socket();
        s.packets = Buffer.from([]);
        res.send(socketIx + '');

        s.on('data', data => {
            console.log('Received TCP packet on socket', socketIx, data);

            s.packets = Buffer.concat([s.packets, data]);
        });
    }
    else if (req.body.protocol === 1) { // UDP
        console.log('Opening new UDP socket');
        let s = sockets[++socketIx] = dgram.createSocket('udp4');
        s.packets = Buffer.from([]);
        res.send(socketIx + '');

        s.on('message', (msg, rinfo) => {
            console.log('Received UDP packet on socket', socketIx, msg, rinfo);

            s.packets = Buffer.concat([s.packets, msg]);
            // s.packets.push({ msg: msg, rinfo: rinfo });
        });
    }
    else {
        res.send('' + -1);
    }
});

app.post('/api/network/socket_close', (req, res, next) => {
    console.log('Closing socket', req.body.id);

    if (!sockets[req.body.id]) {
        return res.send('' + -3001);
    }

    let s = sockets[req.body.id];

    if (s instanceof net.Socket) {
        s.destroy();
    }
    else {
        s.close();
    }

    res.send('0');
});

app.post('/api/network/socket_send', (req, res, next) => {
    console.log('Sending socket', req.body.id, req.body.data.length, 'bytes');

    if (!sockets[req.body.id]) {
        return res.send('' + -3001);
    }

    let s = sockets[req.body.id];

    if (s instanceof net.Socket) {
        s.write(Buffer.from(req.body.data));
    }
    else {
        s.send(Buffer.from(req.body.data), s.port, s.hostname);
    }

    res.send('0');
});

app.post('/api/network/socket_connect', (req, res, next) => {
    console.log('Connecting socket', req.body.id, req.body.hostname, req.body.port);

    if (!sockets[req.body.id]) {
        return res.send('' + -3001);
    }

    let s = sockets[req.body.id];

    if (s instanceof net.Socket) {
        s.connect(req.body.port, req.body.hostname);
    }
    else {
        s.port = req.body.port;
        s.hostname = req.body.hostname;
    }

    res.send('0');
});

app.post('/api/network/socket_recv', (req, res, next) => {
    console.log('Receiving from socket', req.body.id, 'max size', req.body.size);

    if (!sockets[req.body.id]) {
        return res.send('' + -3001);
    }

    let s = sockets[req.body.id];

    function send() {
        let buff = [].slice.call(s.packets.slice(0, req.body.size));
        s.packets = s.packets.slice(req.body.size);

        res.send(JSON.stringify(buff));
    }

    if (s.packets.length > 0) {
        return send();
    }

    // if no data... need to block until there is
    let iv = setInterval(() => {
        if (s.packets.length > 0) {
            clearInterval(iv);
            send();
        }
    }, 33);

});


server.listen(process.env.PORT || 7829, process.env.HOST || '0.0.0.0', function () {
    console.log('Web server listening on port %s!', process.env.PORT || 7829);
});
