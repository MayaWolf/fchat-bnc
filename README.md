# fchat-bnc
A Node.js-based BNC for FChat.

It acts as a proxy between the chat server and your client(s), buffers messages and allows you to connect using multiple clients at once.

It cannot be used to bypass the server-side limit of three simultaneously connected characters.

## Prerequisites
* [Node.js 8.x](https://nodejs.org) (Version 6 support is possible if you compile for ES5 instead)
* Preferably [Yarn](https://yarnpkg.com/).
* Ideally a server you can run this on 24/7, with an open port.

## Installation
```bash
git clone https://github.com/MayaWolf/fchat-bnc.git
cd fchat-bnc
yarn install
cp config.example.json config.json
```

## Configuration
`config.json` contains all configuration parameters.

`account`, `password`, `characters`, `host`, `port` are required.

`savedChannels` makes the BNC auto-join the specified channels after connecting to the server. As always, you gotta specify the `ADH-...` code for privately owned rooms.

If you would like to run a secure web socket (`wss://`) server, you need to specify the `certFile` and `keyFile` config parameters.

If the `debug` parameter is enabled, the server will log the raw traffic to stdout.

## Usage
Run `node index.js` to run interactively, or `(node index.js &) &> log` to fork into the background and create a file `log` with the program's output.

Then connect to the server on the port specified in the config using any client that lets you specify the host to connect to, preferably FChat 3.0.
