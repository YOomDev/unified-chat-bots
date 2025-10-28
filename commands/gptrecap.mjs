import { log } from '../utils.mjs';

const SOURCE = 'gptrecap.mjs';

const system_prompt = 'Please give a recap as short and concise as possible:';

export default {
    name: 'gptrecap',
    systems: ['gptrecap'],
    async reply(params, client, event) {
        if (event.privileges.super       ||
            event.privileges.broadcaster ||
            event.privileges.moderator) {
            try {
                const system = client.getSystem('gptrecap');
                const channelData = system.data[client.channel];
                let chatHistory = '';
                if (channelData) {
                    const userMessages = channelData.userMessages;
                    if (typeof userMessages === 'object' && userMessages !== null) {
                        for (const username in userMessages) {
                            if (userMessages.hasOwnProperty(username)) {
                                const messagesArray = userMessages[username];
                                if (Array.isArray(messagesArray)) {
                                    messagesArray.forEach(message => { const messageText = message.message || JSON.stringify(message); chatHistory += `${username}: ${messageText}\n`; });
                                }
                            }
                        }
                    }
                }
                chatHistory = chatHistory.trim();
                const response = await system.getResponse([
                    { role: system.ROLES.SYSTEM, content: system_prompt },
                    { role: system.ROLES.USER, content: chatHistory }]);
                client.sendMessage(response.message.content);
            } catch (err) {
                log.error(`Something went wrong trying to get the response from the GPT: ${err}`, SOURCE);
                client.sendMessage(`Something went wrong trying to get a response from the GPT ${event.username}.`);
            }
        } else { client.sendMessage(`You need to be at least a subscriber or VIP to use this command ${event.username}.`); }
    }
}
