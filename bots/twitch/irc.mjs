import { log } from '../../utils.mjs'
import { EventEmitter } from 'node:events';

import { WebSocket } from 'ws';

const SOURCE = 'Twitch-IRC';

// Socket settings
const host = 'irc-ws.chat.twitch.tv';
const port = 443;
const url = `wss://${host}:${port}`;

// Reconnect settings
const maxReconnectDelay = 60 * 1000; // 1 minute

// Emit event types
export const EventTypes = {
    connect: 'connect',
    disconnect: 'disconnect',
    message: 'message',
    ban: 'ban',
    raid: 'raid',
    command: 'command',
    stream_start: 'stream.start',
    stream_end: 'stream.end',

    // IRC info
    _roomstate: 'roomstate',
}

export class TwitchIRC extends EventEmitter {
    constructor({ username, oauth, channel }) {
        super();

        this.username   = username.toLowerCase();
        this.oauth      = `oauth:${oauth}`;
        this.channel    = channel.replace(/^#/, '');  // strip leading # - incase we do #username

        // Socket
        this.reconnectAttempts  = 0;
        this.ws                 = null;

        // Rate-limit
        this.messageQueue       = [];
        this.periodStart        = Date.now();
        this.messagesInPeriod   = 0;

        this.connect();
    }

    connect() {
        this.ws = new WebSocket(url);

        this.ws.addEventListener('open', () => {
            log.info('Connected to Twitch IRC', SOURCE);
            this.ws.send(`CAP REQ :twitch.tv/tags twitch.tv/commands`); // this.ws.send(`CAP REQ :twitch.tv/membership twitch.tv/tags twitch.tv/commands`);
            this.ws.send(`PASS ${this.oauth}`);
            this.ws.send(`NICK ${this.username}`);
            this.ws.send(`JOIN #${this.channel}`);
            this.reconnectAttempts = 0;
            this.emit(EventTypes.connect, { message: 'successfully connected!' });
        });

        this.ws.addEventListener('message', (event) => this.parse(event.data.toString()));
        this.ws.addEventListener('error',   (error) => this.handleError(error));
        this.ws.addEventListener('close',   (code, reason) => this.handleClose(code, reason));
    }

    /* ---------- sending ---------- */
    send(message) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        this.ws.send(`${message}\r\n`);
    }

    async say(message) {
        if (!message || !message.toString().trim().length) {
            log.warn('Message could not be sent, no message was passed or it was only whitespace', SOURCE);
            return;
        }
        this.messageQueue.push(message);
        this.flushQueue();
    }

    flushQueue() {
        const now = Date.now();
        if (now - this.periodStart >= 30000) {
            this.periodStart = now;
            this.messagesInPeriod = 0;
        }
        if (this.messagesInPeriod >= 20) return;    // hit limit

        const next = this.messageQueue.shift();
        if (!next) return;

        log.info(`[${this.channel}] ${this.username}: ${next}`, SOURCE);
        this.send(`PRIVMSG #${this.channel} :${next}`);
        this.messagesInPeriod++;

        // Schedule next flush
        setTimeout(() => this.flushQueue(), 1500);
    }

    parse(chunk) {
        const lines = chunk.split('\r\n').filter(Boolean);
        for (const line of lines) this.parseSingle(line);
    }

    parseSingle(line) {
        // PING/PONG keep‑alive
        if (line.startsWith('PING')) { this.send(`PONG ${line.split(' ')[1]}`); return; }

        // ROOMSTATE
        const roomstate = line.match(/@.*room-id=(\d+).*? :.* ROOMSTATE #.*/);
        if (roomstate) {
            const [_, roomidText] = roomstate;
            const roomidInt = parseInt(roomidText);
            if (!isNaN(roomidInt)) { this.emit(EventTypes._roomstate, { roomid: roomidInt }); }
            return;
        }

        // PRIVMSG
        // Example: @tags :nick!ident@host PRIVMSG #channel :message
        const privmsg = line.match(/^(@[^ ]+ )?:(\S+?)!(\S+?)@(\S+) PRIVMSG #(\S+) :(.*)$/);
        if (privmsg) {
            const [_, tagsPart, ident, nickname, host, chan, message] = privmsg;
            const tags = this.parseTags(tagsPart);
            const privileges = this.getPrivileges(tags);
            log.info(`[${this.channel}] ${nickname}: ${message}`, SOURCE);
            this.emit(EventTypes.message, { username: nickname, identity: ident, host: host, channel: chan, message: message, tags: tags, privileges: privileges });
            return;
        }

        log.info(`Response not handled: ${line}`, SOURCE);
    }

    parseTags(raw) {
        if (!raw) return {};
        const tags = {};
        const pairs = raw.slice(1).split(';');      // strip leading '@'
        for (const pair of pairs) {
            const [key, value] = pair.split('=');
            tags[key] = value || true;
        }
        return tags;
    }

    parseBadges(badgesTag) {
        if (!badgesTag || badgesTag === true) return {}; // badges/…: "broadcaster/1,subscriber/12,vip/1"
        const badges = {};
        for (const entry of badgesTag.split(',')) {
            const [name, version] = entry.split('/');
            badges[name] = version || null;
        }
        return badges;
    }

    getPrivileges(tags) {
        const badges = this.parseBadges(tags.badges || '');
        return {
            broadcaster:    tags['user-type']   === 'broadcaster' || !!badges.broadcaster,
            moderator:      tags['user-type']   === 'mod'
                         || tags['user-type']   === 'global_mod'
                         || tags['user-type']   === 'staff'
                         || tags.mod            === '1',
            vip:            !!badges.vip,
            subscriber:     !!badges.subscriber,
            turbo:          !!badges.turbo,
            bits:           !!badges.bits,
        };
    }

    handleError(err) { log.error(`WS error: ${err}`, SOURCE); }

    handleClose(code, reason) {
        log.warn(`WS closed (code=${code} reason=${reason}). Reconnecting...`, SOURCE);
        this.reconnect();
    }

    reconnect() {
        if (this.reconnectAttempts >= 10) {
            this.emit(EventTypes.disconnect, { message: 'Max reconnect attempts reached! Disconnected.' });
            return;
        }
        const delay = Math.min(1000 * 2 * this.reconnectAttempts, maxReconnectDelay);
        setTimeout(_ => {
            this.reconnectAttempts++;
            this.connect();
        }, delay);
    }
}