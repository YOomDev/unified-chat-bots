import { concat, equals, sleep, log, json } from '../../utils.mjs';
import { EventEmitter } from 'node:events';
import { TwitchIRC, EventTypes } from './irc.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { TwitchAPI } from './api.mjs';

const SOURCE = 'Twitch';

const systemProperties = ['name'];
const commandProperties = ['name', 'reply'];
const neededSettings = [
    'secrets.appToken',
    'secrets.clientId',
    'settings.username',
    'settings.channel',
    'name'
];

const configSystem = json.load('./configs/systems.json');
const configCommand = json.load('./configs/commands.json');

export class ClientTwitch extends EventEmitter {
    constructor(settingsJSON, obsClients = []) {
        super();

        this._settings = settingsJSON;
        this.obsClients = obsClients;
        this._backend = null;
        this._commands = [];
        this._systems = [];
        this._supers = [];
        this._ignore = [];
        this.prefix = '!';
        this.chat_show = true;
        this.chat_delay = 0;
        this.chat_silence = false;
        this.channel = '';

        this.connect = async function() {
            let valid = true;
            // Check if settings seem valid
            try {
                // Check if settings are passed
                if (!this._settings) {
                    valid = false;
                    throw('No config specified');
                }

                // Check if settings have the right parameters with data
                const missingSettings = [];
                for (let i = 0; i < neededSettings.length; i++) {
                    let parts = neededSettings[i].split('.');
                    let inner = this._settings;
                    for (let j = 0; j < parts.length; j++) {
                        if (parts[j] in inner) { inner = inner[parts[j]]; }
                        else { missingSettings.push(neededSettings[i]); break; }
                    }
                }
                if (missingSettings.length > 0) {
                    valid = false;
                    throw(`Missing config info: ${missingSettings}`);
                }
            } catch (err) { log.error(err, SOURCE); }
            if (!valid) { log.warn('Couldn\'t start bot!', SOURCE); }
            else {
                this.channel = this._settings.settings.channel;
                this.api = new TwitchAPI(this._settings.secrets.appToken, this.channel, this._settings.secrets.clientId, this._settings.secrets.clientSecret, this._settings.secrets.botToken, this._settings.secrets.botRefresh, this._settings.secrets.botExpiry, this._settings.secrets.broadcasterToken, this._settings.secrets.broadcasterRefresh, this._settings.secrets.broadcasterExpiry);
                const ircToken = this._settings.settings.ircTokenSource === 'bot' ? this._settings.secrets.botToken : this._settings.secrets.appToken;
                this._backend = new TwitchIRC({ username: this._settings.settings.username, oauth: ircToken, channel: this.channel, chat_show: this._settings.settings.chat_show });
                if ('prefix'           in this._settings.settings) { if (this._settings.settings.prefix.length > 0) { this.prefix = this._settings.settings.prefix; } }
                if ('chat_show'        in this._settings.settings) { this.chat_show = this._settings.settings.chat_show; }
                if ('chat_delay'       in this._settings.settings) { this.chat_delay = this._settings.settings.chat_delay; }
                if ('chat_silence'     in this._settings.settings) { this.chat_silence = this._settings.settings.chat_silence; }
                if ('superusers'       in this._settings.settings) { this._supers = this._settings.settings.superusers; }
                if ('usersIgnore'      in this._settings.settings) { this._ignore = this._settings.settings.usersIgnore; }
                if ('commandsOffline'  in this._settings.settings) { this.commandsOffline = this._settings.settings.commandsOffline; }
                this._setupEvents();
                await this._setupSystems();
                // Call after Systems are ready.
                if ('token_refresh' in this._settings.settings && this._settings.settings.token_refresh) { this.api.startAutoRefresh(); if (this._settings.secrets.broadcasterRefresh) { this.api.startAutoRefresh('broadcaster'); } }
                if ('eventsub' in this._settings.settings && this._settings.settings.eventsub) { this.api.startEventSub(); }
                this._loadCommands().catch(err => { log.error(err, `${SOURCE}-${this._settings.name}`); });
            }
        };

        this._setupEvents = function() {
            // api
            this.api.addListener('error', err => { log.error(err, `${SOURCE}-API`); });
            this.api.addListener('token_refreshed', data => {
                const isBroadcaster = data.type === 'broadcaster';
                const tokenType = isBroadcaster ? 'broadcaster' : 'bot';
                const tokenKey = isBroadcaster ? 'broadcasterToken' : 'botToken';
                const refreshKey = isBroadcaster ? 'broadcasterRefresh' : 'botRefresh';
                const expiryKey = isBroadcaster ? 'broadcasterExpiry' : 'botExpiry';
                if (data.token) {
                    this._settings.secrets[tokenKey] = data.token;
                    this.api._data[tokenKey] = data.token;
                    if (!isBroadcaster && this.api.eventsub) this.api.eventsub.updateToken(data.token);
                    if (!isBroadcaster && this._settings.settings.ircTokenSource === 'bot') this._backend.oauth = `oauth:${data.token}`;
                }
                if (data.refresh) { this._settings.secrets[refreshKey] = data.refresh; this.api._data[refreshKey] = data.refresh; }
                if (data.expiry) { this._settings.secrets[expiryKey] = data.expiry; this.api._data[isBroadcaster ? 'broadcasterTokenExpiry' : 'botTokenExpiry'] = data.expiry; }
                this.api.startAutoRefresh(tokenType);
                const configPath = path.join(process.cwd(), 'configs', 'secrets.json');
                try {
                    const currentSettings = json.load(configPath);
                    const botIndex = currentSettings.twitch.findIndex(b => b.name === this._settings.name);
                    if (botIndex !== -1) {
                        if (data.token) { currentSettings.twitch[botIndex].secrets[tokenKey] = data.token; }
                        if (data.refresh) { currentSettings.twitch[botIndex].secrets[refreshKey] = data.refresh; }
                        if (data.expiry) { currentSettings.twitch[botIndex].secrets[expiryKey] = data.expiry; }
                        fs.writeFileSync(configPath, JSON.stringify(currentSettings, null, 2));
                    } else {
                        log.warn('Could not find bot in settings to update tokens', `${SOURCE}-${this._settings.name}`);
                    }
                } catch (err) {
                    log.error(`Failed to update secrets.json: ${err}`, `${SOURCE}-${this._settings.name}`);
                }
            });
            this.api.addListener('follow', event => {
                log.info(`New follower: ${event.user_name}`, `${SOURCE}-${this._settings.name}`);
                const followersSystem = this.getSystem('followers');
                const existing = followersSystem.followers.find(f => f.id === event.user_id);
                if (!existing) { followersSystem.followers.push({ id: event.user_id, name: event.user_name, time: new Date(event.followed_at) }); }
            });
            // backend
            this._backend.addListener(EventTypes.connect      , event => { log.info(event.message, `${SOURCE}-IRC-${this._settings.name}`); this.emit(EventTypes.connect   , event); });
            this._backend.addListener(EventTypes.disconnect   , event => { log.info(event.message, `${SOURCE}-IRC-${this._settings.name}`); this.emit(EventTypes.disconnect, event); });
            this._backend.addListener(EventTypes.ban          , event => { log.info(event.message, `${SOURCE}-IRC-${this._settings.name}`); this.emit(EventTypes.ban       , event); });
            this._backend.addListener(EventTypes.raid         , event => { log.info(event.message, `${SOURCE}-IRC-${this._settings.name}`); this.emit(EventTypes.raid      , event); });
            this._backend.addListener(EventTypes._roomstate   , event => { if (this.api) { this.api._data.roomId = event.roomId; } });
            this._backend.addListener(EventTypes._botuserstate, event => { if (this.api) { this.api._data.userId = event.userId; } });
            this._backend.addListener(EventTypes.message      , event => {
                for (let i = 0;i < this._ignore.length; i++) { if (equals(this._ignore[i], event.identity)) { return; } } // Ignore messages from certain users
                if (this.chat_show) { log.info(`${event.username}: ${event.message}`, `${SOURCE}-IRC-${this._settings.name}`); }
                if (event.message.startsWith(this.prefix)) {
                    this.emit(EventTypes.command, event);
                    this._parseCommand(event).catch(err => {
                        log.error(err, `${SOURCE}-IRC-${this._settings.name}`);
                    }); }
                else { this.emit(EventTypes.message, event); }
            });
            this._backend.addListener(EventTypes._userstate, event => { this.botBadges = event.badges; });
        };

        this._setupSystems = async function() {
            if (!this.api.isReady()) {
                log.info('Waiting till api has all the data it needs before loading systems...', `${SOURCE}-Systems-${this._settings.name}`);
                while (!this.api.isReady()) { await sleep(0.5); }
            }

            log.info('Started loading systems', `${SOURCE}-Systems-${this._settings.name}`);
            this._systems.slice(0, this._systems.length);
            const folder = new URL('../../systems', import.meta.url);
            const systemFiles = fs.readdirSync(folder).filter(file => file.endsWith('.mjs'));
            for (const file of systemFiles) {
                const filePath = path.join(folder.toString(), file);
                let system = (await import(filePath) .catch(err => { log.error(err, `${SOURCE}-Systems-${this._settings.name}`); }).then(_ => { return _; })).default;

                // Check if system has needed properties
                let failed = false;
                for (let i = 0; i < systemProperties.length; i++) {
                    if (!(systemProperties[i] in system)) {
                        log.warn(`${filePath} is missing '${systemProperties[i]}' property.`, `${SOURCE}-Systems-${this._settings.name}`);
                        failed = true;
                    }
                }
                if (failed) { continue; } // Skip

                // Check if system is ignored
                let ignore = false;
                for (let i = 0; i < this._settings.settings.systemsIgnore.length; i++) {
                    if (equals(this._settings.settings.systemsIgnore[i].toLowerCase(), system.name.toLowerCase())) {
                        ignore = true;
                        break;
                    }
                }
                if (ignore) { continue; } // Skip

                if ('init' in system) { // Initialize system if needed
                    try {
                        system.init(this);
                    } catch (error) {
                        log.error(error, `${SOURCE}-Systems-${this._settings.name}`);
                        continue; // Skip adding it as a successfully loaded system
                    }
                    log.info(`Loaded system '${system.name}'!`, `${SOURCE}-Systems-${this._settings.name}`);
                }
                this._systems.push({ name: system.name.toLowerCase(), system: system });
            }
            log.info('Loaded all possible systems', `${SOURCE}-Systems-${this._settings.name}`);
        };

        this._loadCommands = async function() {
            log.info('Started loading commands', `${SOURCE}-Commands-${this._settings.name}`);
            this._commands.slice(0, this._commands.length);
            const usedNames = new Set();
            const folder = new URL('../../commands', import.meta.url);
            const commandFiles = fs.readdirSync(folder).filter(file => file.endsWith('.mjs'));
            for (const file of commandFiles) {
                const filePath = path.join(folder.toString(), file);
                let command = (await import(filePath) .catch(err => { log.error(err, `${SOURCE}-Commands-${this._settings.name}`); }).then(_ => { return _; })).default;

                // Check if command has all the needed properties
                let failed = false;
                for (let i = 0; i < commandProperties.length; i++) {
                    if (!(commandProperties[i] in command)) {
                        log.warn(`${filePath} is missing '${commandProperties[i]}' property.`, `${SOURCE}-Commands-${this._settings.name}`);
                        failed = true;
                    }
                }
                if (failed) { continue; } // Skip

                // Check if command is ignored
                if ('commandsIgnore' in this._settings.settings) {
                    let ignore = false;
                    for (let i = 0; i < this._settings.settings.commandsIgnore.length; i++) {
                        if (equals(this._settings.settings.commandsIgnore[i].toLowerCase(), command.name.toLowerCase())) {
                            ignore = true;
                            break;
                        }
                    }
                    if (ignore) { continue; } // Skip
                }

                // Check if the command has extra properties
                if ('systems' in command) {
                    for (const system of command.systems) {
                        const find = system.toLowerCase();
                        let found = false;
                        for (let i = 0; i < this._systems.length; i++) {
                            if (equals(this._systems[i].name, find)) {
                                found = true;
                                break;
                            }
                        }
                        if (!found) {
                            log.warn(`${filePath} is missing the '${system}' system it needs to function.`, `${SOURCE}-Commands-${this._settings.name}`);
                            failed = true;
                        }
                    }
                }
                if ('reply' in command) {
                    if (command.reply.constructor.name !== 'AsyncFunction') {
                        failed = false;
                        log.warn(`${filePath}'s reply() is not async!`, `${SOURCE}-Commands-${this._settings.name}`);
                    }
                }
                if (failed) { continue; } // Skip

                // Check for name conflicts
                const commandNameLower = command.name.toLowerCase();
                if (usedNames.has(commandNameLower)) { log.warn(`Command '${command.name}' conflicts with existing command/alias, skipping.`, `${SOURCE}-Commands-${this._settings.name}`); continue; }
                usedNames.add(commandNameLower);
                this._commands.push({ name: commandNameLower, command: command });

                const aliases = command.aliases || [];
                const loadedAliases = [];
                for (const alias of aliases) {
                    const aliasLower = alias.toLowerCase();
                    if (usedNames.has(aliasLower)) { log.warn(`Alias '${alias}' for command '${command.name}' conflicts with existing command/alias, skipping.`, `${SOURCE}-Commands-${this._settings.name}`); continue; }
                    usedNames.add(aliasLower);
                    loadedAliases.push(alias);
                }
                log.info(`Loaded command '${command.name}'${(loadedAliases.length > 0) ? ` with aliases ['${concat(loadedAliases, `', '`)}']` : ''}!`, `${SOURCE}-Commands-${this._settings.name}`);
            }
            log.info('Loaded all possible commands', `${SOURCE}-Commands-${this._settings.name}`);
        };

        this._parseCommand = async function(event) {
            const params = event.message.substring(this.prefix.length, event.message.length).split(' ');
            const commandName = params.shift().toLowerCase(); // Shift removes the first element from the list
            let found = false;
            for (let i = 0; i < this._commands.length; i++) {
                let isCommand = equals(commandName, this._commands[i].name);
                if (!isCommand) { // Check if given command name is the alias of currently checked command
                    for (let alias in this._commands) {
                        if (equals(alias.toLowerCase(), this._commands[i].name)) { isCommand = true; break; }
                    }
                }
                if (isCommand) {
                    const command = this._commands[i].command;

                    // Check if command user is superuser
                    let isSuper = false;
                    for (let i = 0; i < this._supers.length; i++) { if (equals(this._supers[i].toLowerCase(), event.username.toLowerCase())) { isSuper = true; break; } }
                    event.privileges.super = isSuper;

                    // Check if command requires live stream
                    if (!this.commandsOffline.includes(command.name) && !this.getSystem('channelLive').isLive(this.channel)) { return; }

                    command.reply(params, this, event).catch(error => { // Command pass-through
                        log.error(error, `${SOURCE}-command-${command.name.toLowerCase()}`);
                        this.sendMessage('Something went wrong while running the command!');
                    });
                    found = true;
                    break;
                }
            }
            if (!found) { this.sendMessage(`Couldn't find the command that you tried to use ${event.username}...`); }
        }

        this.sendMessage = async function(message) { if (!this.chat_silence) { await sleep(this.chat_delay); this._backend.say(message).catch(err => { log.error(err, `${SOURCE}-${this._settings.name}`); }); } }

        this.getSystem = function(system) {
            const find = system.toLowerCase();
            for (let i = 0; i < this._systems.length; i++) { if (equals(this._systems[i].name, find)) { return this._systems[i].system; } }
            throw(`Unable to find system '${system}'!`);
        }

        this.getCommandConfig = function(commandName) {
            if (commandName in configCommand) { return configCommand[commandName][this._settings.name]; }
            return {};
        }

        this.getSystemConfig = function(systemName) {
            if (systemName in configSystem) { return configSystem[systemName][this._settings.name]; }
            return {};
        }
    }
}
