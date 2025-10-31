import https from 'https';
import { log, sleep } from '../utils.mjs';

const requestOptions = {
    hostname: 'icanhazdadjoke.com',
    headers: { Accept: 'text/plain' }
}

export default {
    name: 'joke',
    async reply(params, client, event) { client.sendMessage(await getDadJoke()); }
};

async function getDadJoke() {
    let responsetext = '';
    let done = false;
    https.get(requestOptions, r => {
        r.setEncoding('utf8');
        r.on('data', data => { responsetext = responsetext + data; });
        r.on('end', _ => { done = true; });
    }).on('error', err => { log.error(err, 'commands/joke.mjs'); });
    while (!done) { await sleep(0.25); }
    return responsetext;
}
