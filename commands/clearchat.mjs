export default {
    name: 'clearchat',
    async reply(params, client, event) {
        if (event.privileges.super || event.privileges.broadcaster || event.privileges.moderator) { client.api.clearChat(); }
        else { client.sendMessage(`You need to be at least a Moderator to use this command ${event.username}.`); }
    },
}
