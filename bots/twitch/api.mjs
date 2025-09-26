import { log, sleep } from '../../utils.mjs';
import https from 'https';

const SOURCE = 'TwitchAPI';
const USERS_PER_CHUNK = 100;

export class TwitchAPI {
    _data = {
        token: 0,
        userId: 0,
        roomId: 0,
        applicationId: 0,
        channel: 0,
    }

    constructor(token, channel, id) {
        this._data.token = token;
        this._data.channel = channel;
        this._data.applicationId = id;
    }

    isReady() { return !(this._data.token === 0 || this._data.roomId === 0 || this._data.channel === 0 || this._data.applicationId === 0); }

    async getAllFollowerData() {
        const followers = [];

        if (!this.isReady()) { log.error('Missing data for getAllFollowerData to request the needed data from twitch!', SOURCE); }
        else {
            log.info('Started loading follower data', SOURCE);
            let pagination = '';
            let done = false;
            while (!done) {
                const options = {
                    hostname: 'api.twitch.tv',
                    path: `/helix/channels/followers?broadcaster_id=${this._data.roomId}&first=${USERS_PER_CHUNK}${pagination.length < 1 ? '' : `&after=${pagination}`}`,
                    headers: {
                        Authorization: `Bearer ${this._data.token}`,
                        'Client-ID': this._data.applicationId
                    }
                }

                let parseData = '';
                https.get(options, r => {
                    r.setEncoding('utf8');
                    r.on('data', data => { parseData += data; });
                    r.on('end', _ => {
                        const json = JSON.parse(parseData);
                        if (json === undefined) { log.warn('Failed to parse follower data:', SOURCE); log.data(parseData, SOURCE); done = true; return; }
                        if (json.status) { if (json.status === 401) { log.error('Token expired!'); done = true; return; } }
                        const next = `${json.pagination.cursor}`.toString();
                        done = next.length < 10; // if pagination is too short we end or expect there to be no pagination
                        if (!done) { pagination = next; }
                        for (let i = 0; i < json.data.length; i++) {
                            followers.push({
                                id: json.data[i].user_id,
                                name: `${json.data[i].user_name}`,
                                time: new Date(json.data[i].followed_at)
                            });
                        }
                    });
                });
                if (!done) { await sleep(3); } // throttle requests to make sure we dont hit requests per minute limits
                else { log.info('Finished loading follower data', SOURCE); }
            }
        }

        return followers;
    }

    async getFollowerData() {
        const result = {};

        if (!this.isReady()) { log.error('Missing data for getFollowerData to request the needed data from twitch!', SOURCE); }
        else {
            // TODO
        }

        return result;
    }
}