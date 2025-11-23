import OBSWebSocket from 'obs-websocket-js';
import { EventEmitter } from 'node:events';
import { log } from '../../utils.mjs';

const SOURCE = 'OBS-Integration';

export class ClientOBS extends EventEmitter {
    constructor(settings) {
        super();

        this._settings = settings;
        this.obs = new OBSWebSocket();
        this.connected = false;
        this.reconnecting = false;
        this.retryDelay = 1000;
        this.maxRetryDelay = 30000;

        // Set up event listeners once
        this.obs.on('ConnectionOpened', () => this.emit('connect'));
        this.obs.on('ConnectionClosed', () => { this.connected = false; this.emit('disconnect'); this.reconnect(); });
        this.obs.on('ConnectionError', () => this.reconnect());
        this.obs.on('CurrentSceneChanged', (data) => this.emit('sceneChanged', data));
        this.obs.on('RecordingStarted', () => this.emit('recordingStarted'));
        this.obs.on('RecordingStopped', () => this.emit('recordingStopped'));
        // Add more events as needed
    }

    // Connection methods
    async connect() {
        try { const { host = 'localhost', port = 4455, password } = this._settings.settings || {}; await this.obs.connect(`ws://${host}:${port}`, password); this.connected = true; log.info('Connected to OBS', `${SOURCE}-${this._settings.name}`); }
        catch (error) { log.error(`Failed to connect to OBS: ${error}`, `${SOURCE}-${this._settings.name}`); this.reconnect(); }
    }

    async reconnect() {
        if (this.reconnecting || this.connected) return;
        this.reconnecting = true;
        try { await this.connect(); this.reconnecting = false; this.retryDelay = 1000; }
        catch (error) {
            log.error(`Reconnect failed, retrying in ${this.retryDelay}ms: ${error}`, `${SOURCE}-${this._settings.name}`);
            setTimeout(() => { this.reconnecting = false; this.retryDelay = Math.min(this.retryDelay * 2, this.maxRetryDelay); this.reconnect(); }, this.retryDelay);
        }
    }

    // Scene methods
    async changeScene(sceneName) {
        if (!this.connected) throw new Error('OBS not connected');
        try { await this.obs.call('SetCurrentProgramScene', { sceneName }); }
        catch (error) { throw new Error(`Failed to change scene: ${error.message}`); }
    }

    async getCurrentScene() {
        if (!this.connected) throw new Error('OBS not connected');
        try { const response = await this.obs.call('GetCurrentProgramScene'); return response.currentProgramSceneName; }
        catch (error) { throw new Error(`Failed to get current scene: ${error.message}`); }
    }

    async getSceneItems(sceneName) {
        if (!this.connected) throw new Error('OBS not connected');
        try { const response = await this.obs.call('GetSceneItemList', { sceneName }); return response.sceneItems; }
        catch (error) { throw new Error(`Failed to get scene items for ${sceneName}: ${error.message}`); }
    }

    // Source methods
    async getSceneItemId(sceneName, sourceName) {
        // First try direct lookup in main scene
        try {
            const idResponse = await this.obs.call('GetSceneItemId', { sceneName, sourceName });
            log.info(`Found ${sourceName} directly with id ${idResponse.sceneItemId}`, `${SOURCE}-${this._settings.name}`);
            return { sceneItemId: idResponse.sceneItemId, groupName: null };
        } catch (error) {
            // Not found directly, search within groups
        }

        // Get all scene items to find groups
        try {
            const sceneItems = await this.obs.call('GetSceneItemList', { sceneName });
            
            for (const item of sceneItems.sceneItems) {
                if (item.isGroup) {
                    try {
                        // Search within this group
                        const groupItems = await this.obs.call('GetGroupSceneItemList', { sceneName: item.sourceName });
                        const foundItem = groupItems.sceneItems.find(groupItem => groupItem.sourceName === sourceName);
                        
                        if (foundItem) {
                            log.info(`Found ${sourceName} in group ${item.sourceName} with id ${foundItem.sceneItemId}`, `${SOURCE}-${this._settings.name}`);
                            return { sceneItemId: foundItem.sceneItemId, groupName: item.sourceName };
                        }
                    } catch (groupError) {
                        // Continue to next group if this one fails
                        continue;
                    }
                }
            }
        }
        catch (error) { log.error(`Failed to search groups: ${error.message}`, `${SOURCE}-${this._settings.name}`); }

        throw new Error(`Scene item ${sourceName} not found in scene ${sceneName} or its groups`);
    }

    async setSourceEnabled(sceneName, sourceName, enabled, duration = 0) {
        if (!this.connected) throw new Error('OBS not connected');
        try {
            const { sceneItemId, groupName } = await this.getSceneItemId(sceneName, sourceName);
            // Use groupName as sceneName if it exists, otherwise use the original sceneName
            const targetSceneName = groupName || sceneName;
            const params = { sceneName: targetSceneName, sceneItemId, sceneItemEnabled: enabled };
            await this.obs.call('SetSceneItemEnabled', params);
            if (duration > 0) { setTimeout(async () => { const revertParams = { sceneName: targetSceneName, sceneItemId, sceneItemEnabled: !enabled }; await this.obs.call('SetSceneItemEnabled', revertParams); }, duration * 1000); }
        } catch (error) {
            throw new Error(`Failed to set source enabled: ${error.message}`);
        }
    }

    async getSourceEnabled(sceneName, sourceName) {
        if (!this.connected) throw new Error('OBS not connected');
        try {
            const { sceneItemId, groupName } = await this.getSceneItemId(sceneName, sourceName);
            // Use groupName as sceneName if it exists, otherwise use the original sceneName
            const targetSceneName = groupName || sceneName;
            const params = { sceneName: targetSceneName, sceneItemId };
            const enabledResponse = await this.obs.call('GetSceneItemEnabled', params);
            return enabledResponse.sceneItemEnabled;
        }
        catch (error) { throw new Error(`Failed to get source enabled for ${sourceName} in ${sceneName}: ${error.message}`); }
    }

    async setTextSource(sceneName, sourceName, text) {
        if (!this.connected) throw new Error('OBS not connected');
        try { await this.obs.call('SetInputSettings', { inputName: sourceName, inputSettings: { text } }); }
        catch (error) { throw new Error(`Failed to set text source: ${error.message}`); }
    }

    // Audio methods
    async setAudioMute(sourceName, mute) {
        if (!this.connected) throw new Error('OBS not connected');
        try { await this.obs.call('SetInputMute', { inputName: sourceName, inputMuted: mute }); }
        catch (error) { throw new Error(`Failed to set audio mute: ${error.message}`); }
    }

    async getAudioMute(sourceName) {
        if (!this.connected) throw new Error('OBS not connected');
        try { const response = await this.obs.call('GetInputMute', { inputName: sourceName }); return response.inputMuted; }
        catch (error) { throw new Error(`Failed to get audio mute: ${error.message}`); }
    }

    // Streaming methods
    async startRecording() {
        if (!this.connected) throw new Error('OBS not connected');
        try { await this.obs.call('StartRecord'); }
        catch (error) { throw new Error(`Failed to start recording: ${error.message}`); }
    }

    async stopRecording() {
        if (!this.connected) throw new Error('OBS not connected');
        try { await this.obs.call('StopRecord'); }
        catch (error) { throw new Error(`Failed to stop recording: ${error.message}`); }
    }

    async startStreaming() {
        if (!this.connected) throw new Error('OBS not connected');
        try { await this.obs.call('StartStream'); }
        catch (error) { throw new Error(`Failed to start streaming: ${error.message}`); }
    }

    async stopStreaming() {
        if (!this.connected) throw new Error('OBS not connected');
        try { await this.obs.call('StopStream'); }
        catch (error) { throw new Error(`Failed to stop streaming: ${error.message}`); }
    }

    // Stats methods
    async getStreamStats() {
        if (!this.connected) throw new Error('OBS not connected');
        try { const response = await this.obs.call('GetStreamStatus'); return response; }
        catch (error) { throw new Error(`Failed to get stream stats: ${error.message}`); }
    }
}
