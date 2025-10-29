import { equals, log } from '../../utils.mjs';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';

const SOURCE = 'WebConsole';
const MAX_DEPTH = 20;

const app = express();

export class WebConsole {
    getTwitch = 0;
    getDiscord = 0;
    port = 0;
    settings = {};

    constructor(functorTwitch, functorDiscord, settings) {
        this.getTwitch  = functorTwitch;
        this.getDiscord = functorDiscord;
        this.settings = settings;
    }

    async start(port = 0) {
        if (port === 0) {
            log.error(`Unable to start webserver with port 0`, SOURCE);
            return;
        }
        this.port = port;
        if (this.getTwitch === 0 || this.getDiscord === 0) {
            log.error(`No functors obtained for collecting the info to display on the page `, SOURCE);
            return;
        }
        app.get('/', (req, res) => {
            let nav = '';
            let data = '';
            const twitch = this.getTwitch();
            const discord = this.getDiscord();

            for (let i = 0; i < twitch.length; i++) {
                const [objNav, objData] = this.parseObject(twitch[i], `twitch.${i}`);
                nav += `<li>Twitch<ul>${objNav}</ul></li>`;
                data += `${objData}`;
            }
            for (let i = 0; i < discord.length; i++) {
                const [objNav, objData] = this.parseObject(discord[i], `discord.${i}`);
                nav += `<li>Discord<ul>${objNav}</ul></li>`;
                data += `${objData}`;
            }

            res.send(`<ul>${nav}</ul>${data}`);
        });

        // OAuth routes for Twitch should accesible for everyone
        app.get('/oauth/twitch/:index', (req, res) => {
            const index = parseInt(req.params.index);
            if (isNaN(index) || index < 0 || index >= this.settings.twitch.length) { return res.status(400).send('Invalid bot index'); }
            const bot = this.settings.twitch[index];
            if (!bot.secrets.secret) { return res.status(400).send('Client secret not configured for this bot'); }
            const clientId = bot.secrets.id;
            const redirectUri = bot.secrets.redirectUri || `http://localhost:${this.port}/oauth/callback`;
            const scope = bot.secrets.scopes || 'chat:read chat:edit channel:moderate';
            const state = index.toString();
            const authUrl = `https://id.twitch.tv/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&state=${state}`;
            res.redirect(authUrl);
        });
        app.get('/oauth/callback', async (req, res) => {
            const { code, state, error } = req.query;
            if (error) { return res.status(400).send(`OAuth error: ${error}`); }
            const index = parseInt(state);
            if (isNaN(index) || index < 0 || index >= this.settings.twitch.length) { return res.status(400).send('Invalid state'); }
            const bot = this.settings.twitch[index];
            const clientId = bot.secrets.id;
            const clientSecret = bot.secrets.secret;
            const redirectUri = bot.secrets.redirectUri || `http://localhost:${this.port}/oauth/callback`;
            try {
                const response = await fetch('https://id.twitch.tv/oauth2/token', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: new URLSearchParams({
                        client_id: clientId,
                        client_secret: clientSecret,
                        code: code,
                        grant_type: 'authorization_code',
                        redirect_uri: redirectUri,
                    }),
                });
                const data = await response.json();
                if (!response.ok) { return res.status(400).send(`Token exchange failed: ${data.message}`); }
                bot.secrets.usertoken = data.access_token;
                if (data.refresh_token) { bot.secrets.refresh = data.refresh_token; }
                if (data.expires_in) { bot.secrets.expiry = Date.now() + (data.expires_in * 1000); }
                const configPath = path.join(process.cwd(), 'configs', 'secrets.json');
                fs.writeFileSync(configPath, JSON.stringify(this.settings, null, 2));
                res.send('OAuth successful! Tokens updated. You can close this window.');
            } catch (err) {
                log.error(err, SOURCE);
                res.status(500).send('Internal error');
            }
        });

        app.listen(port, _ => { log.info(`WebConsole started on port ${this.port}`, SOURCE) });
    }

    parseObject(obj, prefix = '', depth = 0) {
        let nav = '';
        let data = '';
        if (depth > MAX_DEPTH) { return [nav, data]; }

        // Filter what data is being presented
        const keys = Object.keys(obj);
        const possible = [];
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i].toLowerCase();
            if (!(equals(key, 'secret') || equals(key, 'secrets') || equals(key, 'token') || equals(key, 'refresh') || equals(key, 'tokens') || equals(key, 'client') || equals(key, 'oauth')
                || equals(key, '_events') || equals(key, '_eventsCount') || equals(key, '_maxListeners') || equals(key, 'ws')
                || equals(typeof obj[key], 'function') || equals(typeof obj[key], 'undefined'))) {
                possible.push(keys[i]);
            }
        }

        // Recursively go through objects
        for (let i = 0; i < possible.length; i++) {
            const newPrefix = `${prefix}${prefix.length > 0 ? '.' : ''}${possible[i]}`;
            const key = possible[i];
            const value = obj[key];
            switch ((typeof value).toLowerCase()) {
                case 'object':
                    const [objNav, objData] = this.parseObject(value, depth + 1, `${newPrefix}`);
                    nav += `<li>${key}<ul>${objNav}</ul></li>`;
                    if (objData.length > 0) { data += `<div id="${newPrefix}">${objData}</div>`; }
                    break;
                case 'boolean':
                    nav += `<li>${key}</li>`;
                    data += `<div id="${newPrefix}">${value ? 'true' : 'false'}</div>`;
                    break;
                default:
                    nav += `<li>${key}</li>`;
                    if (value.length > 0) { data += `<div id="${newPrefix}">${value}</div>`; }
                    break;
            }
        }

        return [nav, data];
    }
}
