import { log } from '../utils.mjs';

const SOURCE = 'gptrecap.mjs';

const system_prompt =   'Tone: Playful and joyful\n' +
                        'Recapitulation: Summarize key points or highlights from previous interactions\n' +
                        'Recapitulation: Go for engagement, include all persons at least once\n' +
                        'Recapitulation: As short and concise as possible.';

export default {
    name: 'gptrecap',
    systems: ['gptrecap'],
    aliases: ['tldr'],
    async reply(params, client, event) {
        if (event.privileges.super || event.privileges.broadcaster || event.privileges.moderator) {
            try {
                const system = client.getSystem('gptrecap');
                const channelData = system.data[client.channel];
                let chatHistory = '';
                if (channelData) {
                    const userMessages = channelData.userMessages;
                    if (typeof userMessages === 'object' && userMessages !== null) {
                        for (const [username, messagesArray] of Object.entries(userMessages)) {
                            if (Array.isArray(messagesArray)) { messagesArray.forEach(message => { const messageText = message.message || JSON.stringify(message); chatHistory += `${username}: ${messageText}\n`; }); }
                        }
                    }
                }
                chatHistory = chatHistory.trim();
                if (!chatHistory) { client.sendMessage(`No chat history available to recap, ${event.username}.`); return; }
                const response = await system.getResponse([ { role: system.ROLES.SYSTEM, content: system_prompt }, { role: system.ROLES.USER, content: chatHistory }]);
                client.sendMessage(response.message.content);
                system.data[client.channel].userMessages = {};
            } catch (err) {
                log.error(`Something went wrong trying to get the response from the GPT: ${err}`, SOURCE);
                client.sendMessage(`Something went wrong trying to get a response from the GPT ${event.username}.`);
            }
        } else { client.sendMessage(`You need to be at least a subscriber or VIP to use this command ${event.username}.`); }
    }
}
