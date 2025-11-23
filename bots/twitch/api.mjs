import https from 'https';
import { EventEmitter } from 'node:events';
import { log, sleep } from '../../utils.mjs';
import { EventTypes } from './irc.mjs';
import { TwitchEventSub } from './eventsub.mjs';

const SOURCE = 'Twitch-API';
const USERS_PER_CHUNK = 100;

export class TwitchAPI extends EventEmitter {
    _data = {
        appToken: 0,
        userId: 0,
        roomId: 0,
        clientId: 0,
        channel: 0,
        botToken: "",
        botRefresh: "",
        botTokenExpiry: 0,
        broadcasterToken: "",
        broadcasterRefresh: "",
        broadcasterTokenExpiry: 0,
    }
    _refreshTimeouts = {};

    constructor(appToken, channel, clientId, clientSecret, botToken = "", botRefresh = "", botExpiry = 0, broadcasterToken = "", broadcasterRefresh = "", broadcasterExpiry = 0) {
        super();
        this._data.appToken = appToken;
        this._data.channel = channel;
        this._data.clientId = clientId;
        this._data.clientSecret = clientSecret;
        this._data.botToken = botToken;
        this._data.botRefresh = botRefresh;
        this._data.botTokenExpiry = botExpiry;
        this._data.broadcasterToken = broadcasterToken;
        this._data.broadcasterRefresh = broadcasterRefresh;
        this._data.broadcasterTokenExpiry = broadcasterExpiry;
        this.eventsub = null;
    }

    async _apiRequest(url, method = 'GET', body = null, tokenType = 'app') {
        let token;
        if (tokenType === 'bot') token = this._data.botToken;
        else if (tokenType === 'broadcaster') token = this._data.broadcasterToken;
        else token = this._data.appToken;
        const options = {
            method,
            headers: {
                'Client-ID': this._data.clientId,
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        };
        if (body) options.body = JSON.stringify(body);
        const response = await fetch(url, options);
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`HTTP ${response.status}: ${errorData.message || 'Unknown error'}`);
        }
        try {
            return await response.json();
        } catch {
            return await response.text();
        }
    }

    isReady() { return !(this._data.appToken === 0 || this._data.roomId === 0 || this._data.channel === 0 || this._data.clientId === 0); }

    // OAuth Tokens
    async refreshToken(tokenType = 'bot') {
        const refreshKey = tokenType === 'broadcaster' ? 'broadcasterRefresh' : 'botRefresh';
        if (!this._data[refreshKey] || !this._data.clientSecret || !this._data.clientId) { throw new Error(`Missing refresh token, client secret, or client ID for ${tokenType} refresh`); }
        const response = await fetch('https://id.twitch.tv/oauth2/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                client_id: this._data.clientId,
                client_secret: this._data.clientSecret,
                refresh_token: this._data[refreshKey],
                grant_type: 'refresh_token',
            }),
        });
        const data = await response.json();
        if (!response.ok) { throw new Error(`Token refresh failed: ${data.message}`); }
        const tokenKey = tokenType === 'broadcaster' ? 'broadcasterToken' : 'botToken';
        const expiryKey = tokenType === 'broadcaster' ? 'broadcasterTokenExpiry' : 'botTokenExpiry';
        if (data.refresh_token) { this._data[refreshKey] = data.refresh_token; }
        if (data.expires_in) { this._data[expiryKey] = Date.now() + (data.expires_in * 1000); }
        this.emit('token_refreshed', { token: data.access_token, refresh: this._data[refreshKey], expiry: this._data[expiryKey], type: tokenType });
    }

    startAutoRefresh(tokenType = 'bot') {
        const refreshKey = tokenType === 'broadcaster' ? 'broadcasterRefresh' : 'botRefresh';
        if (!this._data[refreshKey]) { log.info(`No ${tokenType} refresh token available, skipping auto-refresh`, `${SOURCE}-${this._data.channel}`); return; }
        this._scheduleNextRefresh(tokenType);
    }

    _scheduleNextRefresh(tokenType = 'bot') {
        if (this._refreshTimeouts[tokenType]) { clearTimeout(this._refreshTimeouts[tokenType]); }
        const expiryKey = tokenType === 'broadcaster' ? 'broadcasterTokenExpiry' : 'botTokenExpiry';
        const bufferMs = 5 * 60 * 1000;
        const timeUntilExpiry = this._data[expiryKey] - Date.now() - bufferMs;
        const intervalMs = Math.max(1000, timeUntilExpiry);
        log.info(`Next ${tokenType} OAuth token refresh at ${new Date(Date.now() + intervalMs).toLocaleString()}`, `${SOURCE}-${this._data.channel}`);
        this._refreshTimeouts[tokenType] = setTimeout(() => { this.refreshToken(tokenType).catch(err => { log.error(`Auto-refresh failed: ${err.message}`, `${SOURCE}-${this._data.channel}`); this._scheduleNextRefresh(tokenType); }); }, intervalMs);
    }

    // EventSubs
    startEventSub() {
        if (!this._data.botToken || !this._data.clientId) { log.info('No botToken available, skipping EventSub', `${SOURCE}-${this._data.channel}`); return; }
        this.eventsub = new TwitchEventSub(this._data.botToken, this._data.clientId, this._data.channel);
        log.info('Started loading subscriptions', `Twitch-EventSub-${this._data.channel}`);
        this.eventsub.on('ready', () => { this.subscribeToEvents(); });
        this.eventsub.on('channel.follow', (event) => this.emit('follow', event));
    }

    async subscribeToEvents() {
        if (!this.eventsub || !this.isReady()) return;
        try {
            // Requires: moderator:read:followers
            // Example of subscription: event.type, version, condition
            await this.eventsub.subscribe('channel.follow', 2, { broadcaster_user_id: this._data.roomId.toString(), moderator_user_id: this._data.userId.toString() });
        } catch (err) {
            log.error(`Failed to subscribe to EventSub events: ${err.message}`, `${SOURCE}-${this._data.channel}`);
        }
    }

    // Token is expected to have: moderator:manage:chat_messages
    // https://dev.twitch.tv/docs/api/reference#delete-chat-messages
    async clearChat() {
        return await this._apiRequest(`https://api.twitch.tv/helix/moderation/chat?broadcaster_id=${this._data.roomId}&moderator_id=${this._data.userId}`, 'DELETE');
    }

    // Token is expected to have: moderator:manage:chat_messages
    // https://dev.twitch.tv/docs/api/reference#delete-chat-messages
    async removeMessage(messageId) {
        return await this._apiRequest(`https://api.twitch.tv/helix/moderation/chat?broadcaster_id=${this._data.roomId}&moderator_id=${this._data.userId}&message_id=${messageId}`, 'DELETE');
    }

    // Token is expected to have: clips:edit
    // https://dev.twitch.tv/docs/api/clips/#creating-clips
    // If hasDelay is true, it captures from the VOD instead of the Live stream. We should be able to go back upto 80 minutes.
    // 'bot' to create a clip under the bot username.
    // 'broadcaster' to create a clip under the streamers username.
    async createClip(broadcasterId, hasDelay = false) {
        const data = await this._apiRequest('https://api.twitch.tv/helix/clips', 'POST', { broadcaster_id: broadcasterId, has_delay: hasDelay }, 'bot');
        return data.data[0];
    }


    // https://dev.twitch.tv/docs/api/reference#get-users
    async getAccountInfo(username) {
        const data = await this._apiRequest(`https://api.twitch.tv/helix/users?login=${username}`);
        if (!data.data || data.data.length < 1) { log.warn('Error parsing json from account info', `${SOURCE}-${this._data.channel}`); return; }
        return data.data[0];
    }

    // https://dev.twitch.tv/docs/api/reference#get-streams
    async getStreamInfo(broadcasterId) {
        const data = await this._apiRequest(`https://api.twitch.tv/helix/streams?user_id=${broadcasterId}`);
        if (!data.data || data.data.length < 1) { log.warn('Error parsing json from stream info', `${SOURCE}-${this._data.channel}`); return; }
        return data.data[0];
    }

    // Token is expected to have: moderator:manage:announcements
    // https://dev.twitch.tv/docs/api/reference#send-chat-announcement
    // 'bot' to send announcement under the bot username.
    // 'broadcaster' to send announcement under the streamers username.
    async sendAnnouncement(broadcasterId, announcement) {
        await this._apiRequest('https://api.twitch.tv/helix/chat/announcements', 'POST', { broadcaster_id: broadcasterId, moderator_id: this._data.userId, message: announcement }, 'bot');
    }

    // Token is expected to have: channel:manage:broadcast
    // https://dev.twitch.tv/docs/api/reference#modify-channel-information
    async setTitle(newTitle) {
        try {
            await this._apiRequest(`https://api.twitch.tv/helix/channels?broadcaster_id=${this._data.roomId}`, 'PATCH', { title: newTitle }, 'broadcaster');
            log.info(`Stream title updated successfully.`, `${SOURCE}-${this._data.channel}`);
        } catch (error) {
            log.error(`Error updating stream title: ${error}`, `${SOURCE}-${this._data.channel}`);
        }
    }

    // https://dev.twitch.tv/docs/api/reference#get-games
    async searchCategory(category) {
        try {
            const data = await this._apiRequest(`https://api.twitch.tv/helix/games?name=${category}`);
            if (data.data.length > 0) { const firstGame = data.data[0]; log.info(`Found game: ${category} with ID: ${firstGame.id}`, `${SOURCE}-${this._data.channel}`); return firstGame.id; }
            else { log.warn('No game found with that name.', `${SOURCE}-${this._data.channel}`); return -1; }
        } catch (error) { log.error(`Error searching for game: ${error}`, `${SOURCE}-${this._data.channel}`); }
    }

    // Token is expected to have: channel:manage:broadcast
    // https://dev.twitch.tv/docs/api/reference#modify-channel-information
    async setCategory(category) {
        const categoryId = await this.searchCategory(category);
        if (categoryId < 0) { return; }
        try {
            await this._apiRequest(`https://api.twitch.tv/helix/channels?broadcaster_id=${this._data.roomId}`, 'PATCH', { game_id: categoryId }, 'broadcaster');
            log.info(`Stream game updated successfully.`, `${SOURCE}-${this._data.channel}`);
        } catch (error) { log.error(`Error updating stream game: ${error}`, `${SOURCE}-${this._data.channel}`); }
    }

    // Debugging to validate token.
    async validateToken(token) {
        try {
            const response = await fetch('https://id.twitch.tv/oauth2/validate', {
                method: 'GET',
                headers: {
                    'Authorization': `OAuth ${token}`
                }
            });
            const data = await response.json();
            if (response.ok) {
                console.log('User ID:', data.user_id);
                console.log('Scopes:', data.scopes);
                console.log('Has channel:manage:broadcast?', data.scopes.includes('channel:manage:broadcast'));
            } else {
                console.error('Validation failed:', data.message);
            }
        } catch (error) {
            console.error('Error:', error);
        }
    }

    // https://dev.twitch.tv/docs/api/reference#get-streams
    async isChannelLive() {
        try {
            const data = await this._apiRequest(`https://api.twitch.tv/helix/streams?user_login=${this._data.channel}`);
            const isLive = data.data.length > 0;
            this.emit(isLive ? EventTypes.stream_start : EventTypes.stream_end, { channel: this._data.channel, live: isLive, started_at: isLive ? new Date(data.data[0].started_at).getTime() : 0 });
            return isLive;
        } catch (error) {
            this.emit('error', error.message);
            return false;
        }
    }

    // https://dev.twitch.tv/docs/api/reference#get-streams
    async getCategory() {
        const data = await this._apiRequest(`https://api.twitch.tv/helix/streams?user_login=${this._data.channel}`);
        return data.data.length > 0 ? data.data[0].game_name : null;
    }

    async getAllFollowerData() {
        const followers = [];

        if (!this.isReady()) { log.error('Missing data for getAllFollowerData to request the needed data from twitch!', `${SOURCE}-${this._data.channel}`); return followers; }

        log.info('Started loading follower data', `${SOURCE}-${this._data.channel}`);
        let pagination = '';
        while (true) {
            const url = `https://api.twitch.tv/helix/channels/followers?broadcaster_id=${this._data.roomId}&first=${USERS_PER_CHUNK}${pagination ? `&after=${pagination}` : ''}`;
            const data = await this._apiRequest(url);
            if (!data || !data.data) break;
            for (const follower of data.data) {
                followers.push({
                    id: follower.user_id,
                    name: follower.user_name,
                    time: new Date(follower.followed_at)
                });
            }
            if (!data.pagination || !data.pagination.cursor) break;
            pagination = data.pagination.cursor;
            await sleep(3); // throttle requests
        }

        log.info('Finished loading follower data', `${SOURCE}-${this._data.channel}`);
        return followers;
    }
}
