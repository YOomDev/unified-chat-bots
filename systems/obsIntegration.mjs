import { log } from '../utils.mjs';
import { EventTypes } from '../bots/twitch/irc.mjs';

const SOURCE = 'OBS-Integration';

export default {
    name: 'obsIntegration',
    enabled: false,
    integrations: [],

    init(client) {
        // Load configuration
        const settings = client.getSystemConfig(this.name);
        if ('enabled' in settings) { this.enabled = settings.enabled; }
        if ('integrations' in settings) { this.integrations = settings.integrations || []; }
        if (!this.enabled || this.integrations.length === 0) { log.info('OBS Integration disabled or no integrations configured', `${SOURCE}-${client._settings.name}`); return; }

        // Set up event listeners for each configured integration
        for (const integration of this.integrations) {
            if (!integration.event || !integration.actions || !Array.isArray(integration.actions)) { log.warn(`Invalid integration configuration: ${JSON.stringify(integration)}`, `${SOURCE}-${client._settings.name}`); continue; }
            client.on(integration.event, async (event) => { await this.handleEvent(client, integration, event); });
        }

        // Auto-connect OBS when stream goes live
        const liveSystem = client.getSystem('channelLive');
        if (liveSystem.isLive(client.channel)) { this.connectObsClient(client); }
        client.api.addListener(EventTypes.stream_start, () => { this.connectObsClient(client); });
        client.api.addListener(EventTypes.stream_end, () => { this.disconnectObsClient(client); });

        log.info(`OBS Integration loaded with ${this.integrations.length} integrations`, `${SOURCE}-${client._settings.name}`);
    },

    async handleEvent(client, integration, event) {
        if (!client.obsClient) { return; }

        // Cache current scene for this event batch to avoid multiple OBS calls
        let currentSceneCache = null;
        const getCurrentSceneCached = async (obsClient) => { if (currentSceneCache === null) { currentSceneCache = await obsClient.getCurrentScene(); } return currentSceneCache; };

        for (const action of integration.actions) { try { await this.executeAction(client, action, event, getCurrentSceneCached); } catch (error) { log.error(`Failed to execute OBS action: ${error.message}`, `${SOURCE}-${client._settings.name}`); } }
    },

    replaceActionPlaceholders(action, event) {
        // Replaces placeholders in action fields (e.g., '{sourceName}' -> 'Alert-Sound', '{delay}' -> 0)
        const placeholders = {
            '{user_name}': event.user_name || '',
            '{user_login}': event.user_login || '',
            '{display_name}': event.display_name || '',
            '{viewer_count}': event.viewer_count || '',
            '{sourceName}': event.sourceName || '',
            '{delay}': event.delay || 0,
            '{duration}': event.duration || 0
         }
        for (let key in action) { if (typeof action[key] === 'string') { action[key] = action[key].replace(/{user_name}|{user_login}|{display_name}|{viewer_count}|{sourceName}|{delay}|{duration}/g, match => placeholders[match]); } }
        // Convert numeric placeholders to numbers
        if (typeof action.delay === 'string') action.delay = parseInt(action.delay) || 0;
        if (typeof action.duration === 'string') action.duration = parseInt(action.duration) || 0;
    },

    async executeAction(client, action, event, getCurrentSceneCached = null) {
        // Replace placeholders in action fields
        this.replaceActionPlaceholders(action, event);

        const obsClient = client.obsClient;
        if (!obsClient) { throw new Error('No OBS client configured for this channel'); }

        switch (action.type) {
            case 'changeScene':
                if (!action.sceneName) { throw new Error('sceneName required for changeScene action'); }
                await obsClient.changeScene(action.sceneName);
                break;
            case 'setSourceEnabled':
                if (!action.sourceName) { throw new Error('sourceName required for setSourceEnabled action'); }
                const sceneName = action.sceneName || (getCurrentSceneCached ? await getCurrentSceneCached(obsClient) : await obsClient.getCurrentScene());
                const enabled = action.enabled !== false; // Default to true
                const duration = action.duration || 0;
                const delay = action.delay || 0;
                setTimeout(async () => {
                    try { await obsClient.setSourceEnabled(sceneName, action.sourceName, enabled, duration); }
                     catch (error) { log.error(`Failed to execute delayed setSourceEnabled: ${error.message}`, `${SOURCE}-${client._settings.name}`); }
                }, delay * 1000);
                break;
            case 'setTextSource':
                if (!action.sourceName) { throw new Error('sourceName required for setTextSource action'); }
                const textSceneName = action.sceneName || (getCurrentSceneCached ? await getCurrentSceneCached(obsClient) : await obsClient.getCurrentScene());
                let text = action.text || '';
                await obsClient.setTextSource(textSceneName, action.sourceName, text);
                break;
            case 'setAudioMute':
                if (!action.sourceName) { throw new Error('sourceName required for setAudioMute action'); }
                const mute = action.mute === true;
                await obsClient.setAudioMute(action.sourceName, mute);
                break;
            case 'startRecording':
                await obsClient.startRecording();
                break;
            case 'stopRecording':
                await obsClient.stopRecording();
                break;
            case 'startStreaming':
                await obsClient.startStreaming();
                break;
            case 'stopStreaming':
                await obsClient.stopStreaming();
                break;
            default:
                throw new Error(`Unknown action type: ${action.type}`);
        }
    },

    connectObsClient(client) {
        if (!client.obsClient) { return; }
        const obsClient = client.obsClient;
        if (!obsClient.connected) {
            try { obsClient.connect(); log.info('Auto-connected OBS client due to live stream', `${SOURCE}-${client._settings.name}`); }
            catch (error) { log.error(`Failed to auto-connect OBS client: ${error}`, `${SOURCE}-${client._settings.name}`); }
        }
    },

    disconnectObsClient(client) {
        if (!client.obsClient) { return; }
        const obsClient = client.obsClient;
        if (obsClient.connected) {
            try { obsClient.disconnect(); log.info('Auto-disconnected OBS client due to stream end', `${SOURCE}-${client._settings.name}`); }
            catch (error) { log.error(`Failed to auto-disconnect OBS client: ${error}`, `${SOURCE}-${client._settings.name}`); }
        }
    }
}
