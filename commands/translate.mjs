import { concat, log } from '../utils.mjs';

const SOURCE = 'translate.mjs';

const system_prompt =   'Translate the following stream chat message into English. Assume the original text is in an unknown language. ' +
                        'Prioritize maintaining the original meaning, *and crucially, attempt to preserve any humorous intent or tone*. ' +
                        'If the message contains idioms, proverbs, or common sayings, translate them with their closest English equivalents. ' +
                        'If there\'s no direct equivalent, convey the intended humorous meaning as accurately as possible. The message is typically under 500 characters long. ' +
                        'Pay close attention to wordplay, sarcasm, and any other forms of comedic expression. Please output the translated text in plain text format.';

export default {
    name: 'translate',
    systems: ['gpt'],
    async reply(params, client, event) {
        if (event.privileges.super || event.privileges.broadcaster || event.privileges.moderator) {
            if (params.length > 0) {
                try {
                    const system = client.getSystem('gpt');
                    const response = await system.getResponse([{ role: system.ROLES.SYSTEM, content: system_prompt }, { role: system.ROLES.USER, content: concat(params, ' ') }]);
                    client.sendMessage(response.message.content);
                } catch (err) {
                    log.error(`Something went wrong trying to get the response from the GPT: ${err}`, SOURCE);
                    client.sendMessage(`Something went wrong trying to get a response from the GPT ${event.username}.`);
                }
            } else { client.sendMessage('You need to specify a prompt for the gpt to be able to reply to.'); }
        } else { client.sendMessage(`You need to be at least a moderator to use this command ${event.username}.`); }
    }
}
