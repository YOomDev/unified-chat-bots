export default {
    name: 'discord',
    async reply(params, client, event) { client.sendMessage(client.getCommandConfig(this.name)); }
};
