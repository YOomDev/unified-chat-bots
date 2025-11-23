import { concat, log } from '../utils.mjs';

const SOURCE = 'setgame.mjs';

export default {
    name: 'setgame',
    async reply(params, client, event) {
        if (event.privileges.super || event.privileges.broadcaster || event.privileges.moderator) {
            if (params.length > 0) {
                try {
                    client.api.setCategory(concat(params, ' '));
                } catch (err) {
                    log.error(`Something went wrong trying to set the category: ${err}`, SOURCE);
                    client.sendMessage(`Something went wrong trying to set the category: ${event.username}.`);
                }
            } else { client.sendMessage('You need to specify a new stream title.'); }
        } else { client.sendMessage(`You need to be at least a moderator to use this command ${event.username}.`); }
    }
}
