import * as WS from 'ws';
import {Connection, WebSocketConnection} from 'fchat';
import ServerConnection from './ServerConnection';
import Axios from 'axios';
import * as qs from 'qs';
import * as https from 'https';
import * as fs from 'fs';

const config = require('./config.json');
if(!config.account) throw new Error('No account configured.');
if(!config.password) throw new Error('No password configured.');
if(!config.host) throw new Error('No host configured.');
if(!config.characters.length) throw new Error('No characters configured.');
if(!config.port) throw new Error('No port configured.');
if(config.characters.length > 3) throw new Error('Too many characters configured - three is the server-side maximum.')
if(config.certFile && !config.keyFile) throw new Error('Key file missing.');

class WebSocket implements WebSocketConnection {
	socket: WS;

	constructor() {
		this.socket = new WS(config.host);
	}

	close() {
		this.socket.close();
	}

	onMessage(handler: (message: string) => void) {
		this.socket.on('message', handler);
	}

	onOpen(handler: () => void) {
		this.socket.on('open', handler);
	}

	onClose(handler: () => void) {
		this.socket.on('close', handler);
	}

	onError(handler: (error: Error) => void) {
		this.socket.on('error', handler);
	}

	send(message: string) {
		this.socket.send(message);
	}
}

const connections: {[key: string]: ServerConnection} = {};
for(const character of config.characters) {
	const connection = new ServerConnection(WebSocket, config.account, config.password);
	connection.connect(character);
	connection.onError((e) => console.error(e));
	connections[character] = connection;
}
const hServer = config.certFile ? https.createServer({ cert: fs.readFileSync(config.certFile), key: fs.readFileSync(config.keyFile) }) : undefined;
const server = new WS.Server({ port: config.port, server: hServer });
server.on('connection', (client) => {
	let server: ServerConnection | undefined;
	let closeTimer = setTimeout(() => client.close(), 10000);
	let pinInterval: NodeJS.Timer | undefined;
	client.on('message', async <T extends keyof Connection.ClientCommands>(msg: string) => {
		const type = <T>msg.substr(0, 3);
		const data: any = msg.length > 6 ? JSON.parse(msg.substr(4)) : undefined;
		if(type === 'IDN') {
			if(server !== undefined) return client.send(`ERR {"number":11,"message":"Already identified."}`);
			const auth = (await Axios.post('https://www.f-list.net/json/api/auth.php', qs.stringify({ account: config.account, ticket: data.ticket }))).data;
			if(data.account.toLowerCase() !== config.account.toLowerCase() || auth !== '') {
				return client.send(`ERR {"number":4,"message":"Identification failed."}`);
			}
			server = connections[data.character];
			if(server === undefined) return client.send(`ERR {"number":6,"message":"The character requested was not found."}`);
			clearTimeout(closeTimer);
			client.send(`IDN {"character":"${data.character}"}`);
			pinInterval = setInterval(() => client.send('PIN'), 30000);
			if(server.isOpen) server.addClient(client);
			else {
				function onConnect() {
					server!.addClient(client);
					server!.offEvent('connected', onConnect);
				}
				server.onEvent('connected', onConnect);
			}
		} else if(server === undefined) return client.send(`ERR {"number":3,"message":"This command requires that you have logged in."}`);
	});
	client.on('close', () => {
		clearTimeout(closeTimer);
		if(pinInterval !== undefined) clearInterval(pinInterval);
	});
	client.on('error', (e) => {
		console.error(`Client disconnected with error: ${e}`);
		client.close();
	});
});
console.log('FChat BNC running.');