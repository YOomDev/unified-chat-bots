import { getTimeDifference, sleep } from '../utils.mjs';

export default {
    name: 'alarm',
    aliases: ['timer'],
    async reply(params, client, event) {
        if (!event.privileges.moderator && !event.privileges.broadcaster && !event.privileges.super) { client.sendMessage('You need to be a moderator or higher to use this command!'); return; }
        if (params.length < 2) { client.sendMessage('Not enough arguments to run this command!'); return; }
        const name = params[0];
        const minutes = parseInt(params[1]);
        if (isNaN(minutes)) { client.sendMessage('Second argument is not a number!'); return; }
        client.sendMessage(`Timer '${name}' started for ${getTimeDifference(minutes * 60 * 1000)}.`);
        sleep(60 * minutes).then(_ => { client.sendMessage(`Timer '${name}' ended.`); });
    }
}
