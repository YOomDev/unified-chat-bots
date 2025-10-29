import { Ollama } from 'ollama';
import { EventTypes } from '../bots/twitch/irc.mjs';
import { log } from '../utils.mjs';

const SOURCE = 'gptrecap.mjs';

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
        // TODO: Re-add this logic
        // Obsolete for now - Might re-add this logic later, if the basics work as intended - Keeping for now
        if ('max_messages'           in config) { this.max_messages  = config.max_messages; }
        if ('message_limit_per_user' in config) { this.message_limit_per_user  = config.message_limit_per_user; }
        if ('message_time_window'    in config) { this.message_time_window  = config.message_time_window; }
        // Obsolete End
        if ('host'                   in config) { this.ollama = new Ollama({ host: config.host }); }
        else { this.ollama = new Ollama(); }
        this.data[client.channel] = this.data[client.channel] || { live: false, userMessages: {} };
        client.api.addListener(EventTypes.stream_start, status => { if (this.data[client.channel].live) { return; } this.data[client.channel].live = true; });
        client.api.addListener(EventTypes.stream_end, status => { if (!this.data[client.channel].live) { return; } this.data[client.channel].live = false; this.data[client.channel].userMessages = {}; log.info(`Clearing GPTRecap information for channel ${client.channel}`, SOURCE); });
        client.on('message', (event) => {
            if (this.data[client.channel].live) {
                this.data[client.channel].userMessages[event.username] = this.data[client.channel].userMessages[event.username] || [];
                this.data[client.channel].userMessages[event.username].push({ message: event.message });
            }
        });
    },

    async getResponse(messages = []) {
        if (!this.ollama) { throw('Unable to contact GPT without its info being initialized.'); }
        return await this.ollama.chat({ model: this.model, stream: false, messages: messages });
    }
}
