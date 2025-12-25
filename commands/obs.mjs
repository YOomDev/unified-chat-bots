export default {
    name: 'obs',
    async reply(params, client, event) {
        if (event.privileges.super || event.privileges.broadcaster || event.privileges.moderator) {
            if (params.length === 0) { client.sendMessage('Usage: !obs stats | !obs reconnect | !obs record start/stop | !obs stream start/stop'); return; }
            const subcommand = params.shift().toLowerCase();
            if (!client.obsClient) { client.sendMessage('OBS not configured for this channel.'); return; }

            const getObsClient = () => client.obsClient;

            if (subcommand === 'stats') {
                const obsClient = getObsClient();
                const stats = await obsClient.getStreamStats();
                if (!stats) { client.sendMessage('Could not retrieve OBS stats.'); return; }
                let msg = `OBS Stats: Streaming: ${stats.outputActive ? 'Active' : 'Inactive'}`;
                if (stats.outputActive) {
                    const bitrate = stats.outputBytes ? Math.round((stats.outputBytes * 8) / (stats.outputDuration / 1000) / 1000) : 0;
                    const fps = stats.outputTotalFrames ? Math.round(stats.outputTotalFrames / (stats.outputDuration / 1000)) : 0;
                    const dropped = stats.outputSkippedFrames || 0;
                    msg += `, Bitrate: ${bitrate} kbps, FPS: ${fps}, Dropped Frames: ${dropped}`;
                }
                client.sendMessage(msg);
            } else if (subcommand === 'reconnect') {
                const obsClient = getObsClient();
                obsClient.reconnect();
                client.sendMessage(`Attempting to reconnect to OBS`);
            } else if (subcommand === 'record') {
                if (params.length < 1) { client.sendMessage('Usage: !obs record start/stop'); return; }
                const action = params.shift().toLowerCase();
                const obsClient = getObsClient();
                try {
                    if (action === 'start') {
                        await obsClient.startRecording();
                        client.sendMessage(`Started recording on OBS`);
                    } else if (action === 'stop') {
                        await obsClient.stopRecording();
                        client.sendMessage(`Stopped recording on OBS`);
                    } else { client.sendMessage('Invalid action. Use start or stop'); }
                } catch (error) { client.sendMessage(`Failed to control recording: ${error.message}`); }
            } else if (subcommand === 'stream') {
                if (params.length < 1) { client.sendMessage('Usage: !obs stream start/stop'); return; }
                const action = params.shift().toLowerCase();
                const obsClient = getObsClient();
                try {
                    if (action === 'start') {
                        await obsClient.startStreaming();
                        client.sendMessage(`Started streaming on OBS`);
                    } else if (action === 'stop') {
                        await obsClient.stopStreaming();
                        client.sendMessage(`Stopped streaming on OBS`);
                    } else { client.sendMessage('Invalid action. Use start or stop'); }
                } catch (error) { client.sendMessage(`Failed to control streaming: ${error.message}`); }
            } else { client.sendMessage('Unknown subcommand. Use !obs stats, !obs reconnect, !obs record, or !obs stream'); }
        } else { client.sendMessage(`You need to be at least a moderator to use this command ${event.username}.`); }
    }
}
