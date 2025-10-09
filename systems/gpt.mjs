import { Ollama } from 'ollama';

export default {
    name: 'gpt',
    ollama: 0,
    model: 'gemma3:4b-it-qat',
    remembrance: 0,
    ROLES: {
        SYSTEM: 'system',
        USER: 'user',
        GPT: 'assistant'
    },

    init(client) {
        const config = client.getSystemConfig(this.name);
        if ('model'       in config) { this.model  = config.model; }
        if ('host'        in config) { this.ollama = new Ollama({ host: config.host }); }
        if ('remembrance' in config) { this.remembrance = config.remembrance; }
        else { this.ollama = new Ollama(); }
    },

    async getResponse(messages = []) {
        if (!this.ollama) { throw('Unable to contact GPT without its info being initialized.'); }
        return await this.ollama.chat({ model: this.model, stream: false, messages: messages });
    }
}
