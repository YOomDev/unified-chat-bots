import { Ollama } from 'ollama';
import { EventTypes } from '../bots/twitch/irc.mjs';
import { log } from '../utils.mjs';

export default {
    name: 'gptrecap',
    data: {},
    ollama: 0,
    model: 'gemma3:4b-it-qat',
    max_messages: 0,
    message_limit_per_user: 0,
    message_time_window: 60000,
    ROLES: {
        SYSTEM: 'system',
        USER: 'user',
        GPT: 'assistant'
    },

    init(client) {
        const config = client.getSystemConfig(this.name);
        if ('model'                  in config) { this.model  = config.model; }
        if ('max_messages'           in config) { this.max_messages  = config.max_messages; }
        if ('message_limit_per_user' in config) { this.message_limit_per_user  = config.message_limit_per_user; }
        if ('message_time_window'    in config) { this.message_time_window  = config.message_time_window; }
        if ('host'                   in config) { this.ollama = new Ollama({ host: config.host }); }
        else { this.ollama = new Ollama(); }
        client.api.addListener(EventTypes.stream_start, status => {
            if (!(client.channel in this.data)) { this.data[client.channel] = { live: false, chatMessages: [], userMessageCount: {} }; }
            if (this.data[client.channel].live) { return; }
            this.data[client.channel].live = true;
        });
        client.api.addListener(EventTypes.stream_end  , status => {
            if (!(client.channel in this.data)) { this.data[client.channel] = { live: false, chatMessages: [], userMessageCount: {} }; }
            if (!this.data[client.channel].live) { return; }
            if (this.data[client.channel].live) { log.info(`${client.channel} went offline - resetting chat recap history`, 'gptrecap.mjs'); }
            this.data[client.channel].live = false;
            this.data[client.channel].chatMessages = [];
            this.data[client.channel].userMessageCount = {};
        });
        client.on('message', (event) => {
            const currentTime = Date.now();
            if (!this.data[event.channel].userMessageCount[event.username]) {
                this.data[event.channel].userMessageCount[event.username] = [];
            }
            this.data[event.channel].userMessageCount[event.username] = this.data[event.channel].userMessageCount[event.username].filter(time => currentTime - time < this.message_time_window);
            if (this.data[event.channel].userMessageCount[event.username].length >= this.message_limit_per_user) {
                log.warn(`User ${event.username} exceeded message limit on #${event.channel}.`, 'gptrecap.mjs');
                return;
            }
            this.data[event.channel].userMessageCount[event.username].push(currentTime);
            if (this.data[event.channel].chatMessages.length >= this.max_messages) {
                this.data[event.channel].chatMessages.shift();
                log.warn(`User ${event.username} exceeded max messages limit on #${event.channel}. shifting.`, 'gptrecap.mjs');
            }
            this.data[event.channel].chatMessages.push(`${event.username}: ${event.message}`);
        });
    },

    async getResponse(messages = []) {
        if (!this.ollama) { throw('Unable to contact GPT without its info being initialized.'); }
        return await this.ollama.chat({ model: this.model, stream: false, messages: messages });
    }
}
