import {Channel, Channels, Character, Characters, ChatConnection, Connection, WebSocketConnection} from 'fchat';
import * as WS from 'ws';
import * as fs from 'fs';
import * as path from 'path';
import {format} from 'date-fns';
import {mkdir} from './common';

const config = require('./config.json');

const pkg = require('./package.json');

function messageToString(sender: string, text: string, date: Date) {
	return `[${format(date, 'HH:mm')}] ` + (text.substr(0, 3) === '/me' ? '*' + sender + text.substr(3) : `${sender}: ${text}`) + '\n';
}

export default class ServerConnection extends ChatConnection {
	private clients: WS[] = [];
	private idleStatus: Connection.ClientCommands['STA'] | undefined;
	private characters: Character.State;
	private channels: Channel.State;
	private buffer: string[] = [];

	constructor(socketProvider: new() => WebSocketConnection, account: string, password: string) {
		super(pkg.name, pkg.version, socketProvider, account, password);
		this.characters = Characters(this);
		this.channels = Channels(this, this.characters);
		this.onEvent('closed', () => {
			for(const client of this.clients) client.close();
		});
	}

	protected handleMessage<T extends keyof Connection.ServerCommands>(type: T, data: any): any {
		if(config.debug) console.log(`<<<SRV ${type} ${JSON.stringify(data)}`);
		super.handleMessage(type, data);
		const date = new Date();
		data = data || {};
		data.bncTime = date.getTime();
		for(const client of this.clients) client.send(`${type} ${JSON.stringify(data)}`)
		if(type === 'MSG' || type === 'PRI' || type === 'RLL')
			this.buffer.push(`${type} ${JSON.stringify(data)}`);
		if(type === 'MSG' && config.logChannels || type === 'LRP' && config.logAds) {
			this.logMessage(messageToString(data.character, data.message, date), this.getChannelDir(data.channel), date, type === 'LRP');
		} else if(type === 'PRI' && config.logPrivate) {
			this.logMessage(messageToString(data.character, data.message, date), data.character.toLowerCase(), date);
		} else if(type === 'RLL') {
			if(data.channel && config.logChannels)
				this.logMessage(`[${format(date, 'HH:mm')}] ${data.message}`, this.getChannelDir(data.channel), date);
			else if(data.recipient && config.logPrivate)
				this.logMessage(`[${format(date, 'HH:mm')}] ${data.message}`, (data.recipient === this.character ? data.character : data.recipient).toLowerCase(), date);
		}
	}

	private getChannelDir(channel: string) {
		return `#${this.channels.getChannel(channel)!.name} - ${channel}`.toLowerCase()
	}

	private logMessage(message: string, name: string, date: Date, ads = false): void {
		const dir = path.join(config.logDirectory, this.character, name);
		mkdir(dir);
		fs.writeFileSync(path.join(dir, format(date, 'YYYY-MM-DD') + (ads ? '-ads' : '') + '.txt'), message, { flag: 'a' });
	}

	send<K extends keyof Connection.ClientCommands>(command: K, data?: Connection.ClientCommands[K]): void {
		if(config.debug) console.log(`>>>SRV ${command} ${JSON.stringify(data)}`);
		super.send(command, data);
	}

	addClient(socket: WS) {
		function send<T extends keyof Connection.ServerCommands>(type: T, data: Connection.ServerCommands[T]) {
			socket.send(<string>type + (data !== undefined ? ` ${JSON.stringify(data)}` : ''));
		}

		if(this.clients.length === 0 && this.idleStatus !== undefined) {
			this.send('STA', this.idleStatus);
			this.idleStatus = undefined;
		}
		this.clients.push(socket);
		socket.on('close', () => {
			this.clients.splice(this.clients.indexOf(socket), 1);
			if(this.clients.length === 0) {
				this.idleStatus = { status: this.characters.ownCharacter.status, statusmsg: this.characters.ownCharacter.statusText };
				this.send('STA', { status: 'idle', statusmsg: 'Disconnected' });
			}
		});
		socket.on('message', (msg: string) => {
			if(config.debug) console.log(`<<<CLI ${msg}`);
			const type = <keyof Connection.ClientCommands>msg.substr(0, 3);
			switch(type) {
				case 'PIN':
					return;
				case 'CHA':
					const official = [];
					for(const key in this.channels.officialChannels) {
						const channel = this.channels.officialChannels[key]!;
						official.push({ name: channel.name, mode: <Channel.Mode>'both', characters: channel.memberCount });
					}
					send('CHA', { channels: official });
					return;
				case 'ORS':
					const rooms = [];
					for(const key in this.channels.openRooms) {
						const channel = this.channels.openRooms[key]!;
						rooms.push({ name: channel.id, title: channel.name, characters: channel.memberCount });
					}
					send('ORS', { channels: rooms });
					return;
				case 'MSG':
				case 'LRP':
				case 'PRI':
					const data = JSON.parse(msg.substr(3));
					const date = new Date();
					if(type === 'MSG' && config.logChannels || type === 'LRP' && config.logAds) {
						this.logMessage(messageToString(this.character, data.message, date), this.getChannelDir(data.channel), date, type === 'LRP');
					} else if(type === 'PRI' && config.logPrivate) {
						this.logMessage(messageToString(this.character, data.message, date), data.recipient.toLowerCase(), date);
					}
					this.buffer = [];
			}
			this.socket!.send(msg);
		});
		for(const v in this.vars) socket.send(`VAR {"variable":"${v}","value":${JSON.stringify(this.vars[v])}}`)
		send('HLO', { message: `Welcome. Running ${pkg.name} (${pkg.version}). Enjoy your stay.` });
		const allChars: {[key: string]: Character} = (<any>this.characters).characters;
		const characters = Object.keys(allChars).map(x => allChars[x]).filter(x => x.status !== 'offline');
		send('CON', { count: characters.length });
		send('FRL', { characters: this.characters.friendList.concat(<string[]>this.characters.bookmarkList) });
		send('IGN', { action: 'init', characters: this.characters.ignoreList });
		send('ADL', { ops: this.characters.opList });
		for(let i = 0; i < characters.length; i += 100) {
			send('LIS', { characters: characters.slice(i, i + 100).map(x => <[string, Character.Gender, Character.Status, string]>[x.name, x.gender!, x.status, x.statusText]) });
		}
		const ownChar = this.characters.ownCharacter;
		send('NLN', { identity: ownChar.name, gender: ownChar.gender!, status: 'online' });
		send('STA', { character: ownChar.name, status: ownChar.status, statusmsg: ownChar.statusText });
		for(const channel of this.channels.joinedChannels) {
			send('JCH', { character: { identity: this.character }, channel: channel.id, title: channel.name });
			send('COL', { channel: channel.id, oplist: [channel.owner || ''].concat(<string[]>channel.opList) });
			send('ICH', { channel: channel.id, mode: channel.mode, users: channel.sortedMembers.map(x => ({ identity: x.character.name })) });
			send('CDS', { channel: channel.id, description: channel.description });
		}
		for(const message of this.buffer) socket.send(message);
	}
}