import { concat, equals, log, urlToBase64 } from '../utils.mjs';

const SOURCE = 'gptimage.mjs';

const system_prompt = 'Please describe this image as short and concise as possible:';

export default {
    name: 'gptimage',
    systems: ['gptimage'],
    async reply(params, client, event) {
        if (event.privileges.super || event.privileges.broadcaster || event.privileges.moderator || event.privileges.vip || event.privileges.subscriber) {
            if (params.length > 0) {
                try {
                    const system = client.getSystem('gptimage');
                    const messages = [];
                    let content;
                    if (equals(params[0].toLowerCase(), 'live')) {
                        log.info("Grabbing live image", SOURCE);
                        const category = await client.api.getCategory();
                        content = `Current Category: ${category || 'Unknown'}\n${system_prompt}`;
                        // Date.now() so it cannot 'pre cache' the image - has to be refreshed by Twitch
                        const base64Image = await urlToBase64(`https://static-cdn.jtvnw.net/previews-ttv/live_user_${client._settings.settings.channel}-${system.resolution}.jpg?t=${Date.now()}`);
                        messages.push({ role: system.ROLES.USER, content: content, images: [base64Image] });
                    } else if (params[0].startsWith('http') || params[0].startsWith('https')) {
                        log.info("Grabbing image from URL", SOURCE);
                        const base64Image = await urlToBase64(params[0]);
                        messages.push({ role: system.ROLES.USER, content: system_prompt, images: [base64Image] });
                    } else {
                        return client.sendMessage('Invalid input. Please provide a valid live keyword or image URL.');
                    }
                    const response = await system.getResponse(messages);
                    client.sendMessage(response.message.content);
                } catch (err) {
                    log.error(`Something went wrong trying to get the response from the GPT: ${err}`, SOURCE);
                    client.sendMessage(`Something went wrong trying to get a response from the GPT ${event.username}.`);
                }
            } else { client.sendMessage('You need to specify a where the image is, either live image or from a url.'); }
        } else { client.sendMessage(`You need to be at least a subscriber to use this command ${event.username}.`); }
    }
}
