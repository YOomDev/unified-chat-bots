export default {
    name: 'shoutout',
    aliases: ['so'],
    async reply(params, client, event) {
        if (event.privileges.super || event.privileges.broadcaster || event.privileges.moderator) {
            if (params.length < 1) { client.sendMessage(`You need to specify the Streamer for which you want a shoutout.`); return; }
            let username = params[0];
            if (username && username.startsWith('@')) { username = username.slice(1); }
            try {
                const userInfo = await client.api.getAccountInfo(username);
                if (!userInfo) { client.sendMessage('The Streamer does not exist or there was an error getting the required information.'); return; }
                const streamInfo = await client.api.getStreamInfo(userInfo.id);
                let lastPlayedGame = 'they are not currently streaming';
                const config = client.getCommandConfig('shoutout');
                let messageTemplate;
                if (streamInfo) { lastPlayedGame = streamInfo.game_name; messageTemplate = config.streamingMessage || `BIG SHOUTOUT TO @${username}, they are currently streaming in the ${lastPlayedGame} category @ https://www.twitch.tv/${username}`; }
                else { messageTemplate = config.offlineMessage || `BIG SHOUTOUT TO @${username}, ${lastPlayedGame} @ https://www.twitch.tv/${username}`; }
                const message = messageTemplate.replace(/{username}/g, username).replace(/{lastplayed}/g, lastPlayedGame);
                client.sendMessage(message);
                // sendAnnouncement requires OAuth so is disabled in favor of 60 day token.
                //client.api.sendAnnouncement(userInfo.id, message);
            } catch (error) { client.sendMessage(`Error checking user: ${error}`); }
        } else { client.sendMessage(`You need to be at least a Moderator to use this command ${event.username}.`); }
    },
};
