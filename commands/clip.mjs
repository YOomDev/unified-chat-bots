export default {
    name: 'clip',
    async reply(params, client, event) {
        if (!event.privileges.broadcaster && !event.privileges.moderator) { client.sendMessage('You need to be a broadcaster or moderator to create a clip!'); return; }
        try {
            const clipData = await client.api.createClip(client.api._data.roomId, false);
            if (clipData && clipData.id) {
                const clipUrl = `https://clips.twitch.tv/${clipData.id}`;
                client.sendMessage(`Clip created! ${clipUrl}`);
            } else { client.sendMessage('Failed to create clip. The stream might not be live or an error occurred.'); }
        } catch (error) {
            client.sendMessage('Something went wrong while creating the clip!');
            console.error('Clip creation error:', error);
        }
    }
}
