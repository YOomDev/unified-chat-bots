import { EventEmitter } from 'node:events';
import { WebSocket } from 'ws';
import { log } from '../../utils.mjs';

const SOURCE = 'Twitch-EventSub';

export class TwitchEventSub extends EventEmitter {
    constructor(botToken, clientId, channel) {
        super();
        this.botToken = botToken;
        this.clientId = clientId;
        this.ws = null;
        this.sessionId = null;
        this.reconnectAttempts = 0;
        this.subscriptions = new Map();
        this.channel = channel;
        this.connect();
    }

    connect() {
        this.ws = new WebSocket('wss://eventsub.wss.twitch.tv/ws');
        this.ws.on('open', () => { this.reconnectAttempts = 0; });
        this.ws.on('message', (data) => { try { const message = JSON.parse(data.toString()); this.handleMessage(message); } catch (err) { log.error(`Failed to parse EventSub message: ${err}`, `${SOURCE}-${this.channel}`); } });
        this.ws.on('error', (error) => { log.error(`EventSub WS error: ${error}`, `${SOURCE}-${this.channel}`); });
        this.ws.on('close', (code, reason) => {
            log.warn(`WS closed (code=${code} reason=${reason}). Reconnecting...`, `${SOURCE}-${this.channel}`);
            this.sessionId = null;
            // Twitch or ISP dropped the connection. Give Twitch 1 minute to properly close the connection.
            if (code === 1006) { setTimeout(() => this.reconnect(), 60000); } else { this.reconnect(); }
        });
    }

    handleMessage(message) {
        switch (message.metadata.message_type) {
            case 'session_welcome':
                this.sessionId = message.payload.session.id;
                this.emit('ready', this.sessionId);
                break;
            case 'session_reconnect':
                log.info('EventSub session reconnect requested', `${SOURCE}-${this.channel}`);
                this.sessionId = message.payload.session.id;
                this.ws.close();
                break;
            case 'notification':
                this.handleNotification(message.payload);
                break;
            case 'session_keepalive':
                break;
            default:
                log.info(`Unhandled EventSub message type: ${message.metadata.message_type}`, `${SOURCE}-${this.channel}`);
        }
    }

    handleNotification(payload) {
        const event = payload.event;
        const type = payload.subscription.type;
        log.info(`EventSub notification: ${type}`, `${SOURCE}-${this.channel}`);
        this.emit(type, event);
    }

    reconnect() {
        if (this.reconnectAttempts >= 5) { log.error('Max EventSub reconnect attempts reached', `${SOURCE}-${this.channel}`); return; }
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
        setTimeout(() => { this.reconnectAttempts++; this.connect(); }, delay);
    }

    updateToken(newToken) {
        this.botToken = newToken;
        // lets wait it out and see if twitch sends us RECONNECT
        // if (this.ws && this.ws.readyState === WebSocket.OPEN) { this.ws.close(); }
    }

    async subscribe(type, version, condition) {
        if (!this.sessionId) { throw new Error('EventSub session not ready'); }
        const response = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.botToken}`,
                'Client-Id': this.clientId,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                type,
                version: version,
                condition,
                transport: {
                    method: 'websocket',
                    session_id: this.sessionId
                }
            })
        });
        if (!response.ok) { const error = await response.text(); throw new Error(`EventSub subscription failed: ${response.status} ${error}`); }
        const data = await response.json();
        this.subscriptions.set(type, data.data[0].id);
        log.info(`Subscribed to ${type}`, `${SOURCE}-${this.channel}`);
        return data.data[0].id;
    }
}
