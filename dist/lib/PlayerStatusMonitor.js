"use strict";
var __classPrivateFieldSet = (this && this.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _PlayerStatusMonitor_instances, _PlayerStatusMonitor_player, _PlayerStatusMonitor_serverCredentials, _PlayerStatusMonitor_notificationListener, _PlayerStatusMonitor_statusRequestTimer, _PlayerStatusMonitor_statusRequestController, _PlayerStatusMonitor_syncMaster, _PlayerStatusMonitor_isMusicAssistant, _PlayerStatusMonitor_pollingInterval, _PlayerStatusMonitor_pollingIntervalMs, _PlayerStatusMonitor_handleDisconnect, _PlayerStatusMonitor_handleNotification, _PlayerStatusMonitor_getStatusAndEmit, _PlayerStatusMonitor_abortCurrentAndPendingStatusRequest, _PlayerStatusMonitor_createAndStartNotificationListener, _PlayerStatusMonitor_detectMusicAssistant, _PlayerStatusMonitor_startPolling, _PlayerStatusMonitor_requestPlayerStatus, _PlayerStatusMonitor_getPlayerSyncMaster, _PlayerStatusMonitor_parsePlayerStatusResult;
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = __importDefault(require("events"));
const SqueezeliteMCContext_1 = __importDefault(require("./SqueezeliteMCContext"));
const lms_cli_notifications_1 = require("lms-cli-notifications");
const Util_1 = require("./Util");
const RPC_1 = require("./RPC");
const node_abort_controller_1 = require("node-abort-controller");
class PlayerStatusMonitor extends events_1.default {
    constructor(player, serverCredentials) {
        super();
        _PlayerStatusMonitor_instances.add(this);
        _PlayerStatusMonitor_player.set(this, void 0);
        _PlayerStatusMonitor_serverCredentials.set(this, void 0);
        _PlayerStatusMonitor_notificationListener.set(this, void 0);
        _PlayerStatusMonitor_statusRequestTimer.set(this, void 0);
        _PlayerStatusMonitor_statusRequestController.set(this, void 0);
        _PlayerStatusMonitor_syncMaster.set(this, void 0);
        _PlayerStatusMonitor_isMusicAssistant.set(this, void 0);
        _PlayerStatusMonitor_pollingInterval.set(this, void 0);
        _PlayerStatusMonitor_pollingIntervalMs.set(this, void 0);
        __classPrivateFieldSet(this, _PlayerStatusMonitor_player, player, "f");
        __classPrivateFieldSet(this, _PlayerStatusMonitor_serverCredentials, serverCredentials, "f");
        __classPrivateFieldSet(this, _PlayerStatusMonitor_notificationListener, null, "f");
        __classPrivateFieldSet(this, _PlayerStatusMonitor_statusRequestTimer, null, "f");
        __classPrivateFieldSet(this, _PlayerStatusMonitor_statusRequestController, null, "f");
        __classPrivateFieldSet(this, _PlayerStatusMonitor_syncMaster, null, "f");
        __classPrivateFieldSet(this, _PlayerStatusMonitor_isMusicAssistant, false, "f");
        __classPrivateFieldSet(this, _PlayerStatusMonitor_pollingInterval, null, "f");
        __classPrivateFieldSet(this, _PlayerStatusMonitor_pollingIntervalMs, 1000, "f"); // Poll every 1 second for Music Assistant
    }
    async start() {
        // Detect if server is Music Assistant
        __classPrivateFieldSet(this, _PlayerStatusMonitor_isMusicAssistant, await __classPrivateFieldGet(this, _PlayerStatusMonitor_instances, "m", _PlayerStatusMonitor_detectMusicAssistant).call(this), "f");
        if (__classPrivateFieldGet(this, _PlayerStatusMonitor_isMusicAssistant, "f")) {
            SqueezeliteMCContext_1.default.getLogger().info('[squeezelite_mc] Music Assistant server detected. Using polling mode instead of event subscription.');
            // Start polling for Music Assistant
            __classPrivateFieldGet(this, _PlayerStatusMonitor_instances, "m", _PlayerStatusMonitor_startPolling).call(this);
        }
        else {
            // Use notification listener for standard LMS
            __classPrivateFieldSet(this, _PlayerStatusMonitor_notificationListener, await __classPrivateFieldGet(this, _PlayerStatusMonitor_instances, "m", _PlayerStatusMonitor_createAndStartNotificationListener).call(this), "f");
        }
        __classPrivateFieldSet(this, _PlayerStatusMonitor_syncMaster, (await __classPrivateFieldGet(this, _PlayerStatusMonitor_instances, "m", _PlayerStatusMonitor_getPlayerSyncMaster).call(this)).syncMaster, "f");
        if (__classPrivateFieldGet(this, _PlayerStatusMonitor_syncMaster, "f")) {
            SqueezeliteMCContext_1.default.getLogger().info(`[squeezelite_mc] Squeezelite in sync group with sync master ${__classPrivateFieldGet(this, _PlayerStatusMonitor_syncMaster, "f")}.`);
        }
        await __classPrivateFieldGet(this, _PlayerStatusMonitor_instances, "m", _PlayerStatusMonitor_getStatusAndEmit).call(this);
    }
    async stop() {
        if (__classPrivateFieldGet(this, _PlayerStatusMonitor_notificationListener, "f")) {
            await __classPrivateFieldGet(this, _PlayerStatusMonitor_notificationListener, "f").stop();
        }
        if (__classPrivateFieldGet(this, _PlayerStatusMonitor_pollingInterval, "f")) {
            clearInterval(__classPrivateFieldGet(this, _PlayerStatusMonitor_pollingInterval, "f"));
            __classPrivateFieldSet(this, _PlayerStatusMonitor_pollingInterval, null, "f");
        }
    }
    getPlayer() {
        return __classPrivateFieldGet(this, _PlayerStatusMonitor_player, "f");
    }
    requestUpdate() {
        __classPrivateFieldGet(this, _PlayerStatusMonitor_instances, "m", _PlayerStatusMonitor_getStatusAndEmit).call(this);
    }
    on(event, listener) {
        return super.on(event, listener);
    }
}
exports.default = PlayerStatusMonitor;
_PlayerStatusMonitor_player = new WeakMap(), _PlayerStatusMonitor_serverCredentials = new WeakMap(), _PlayerStatusMonitor_notificationListener = new WeakMap(), _PlayerStatusMonitor_statusRequestTimer = new WeakMap(), _PlayerStatusMonitor_statusRequestController = new WeakMap(), _PlayerStatusMonitor_syncMaster = new WeakMap(), _PlayerStatusMonitor_isMusicAssistant = new WeakMap(), _PlayerStatusMonitor_pollingInterval = new WeakMap(), _PlayerStatusMonitor_pollingIntervalMs = new WeakMap(), _PlayerStatusMonitor_instances = new WeakSet(), _PlayerStatusMonitor_handleDisconnect = function _PlayerStatusMonitor_handleDisconnect() {
    if (!__classPrivateFieldGet(this, _PlayerStatusMonitor_notificationListener, "f")) {
        return;
    }
    __classPrivateFieldGet(this, _PlayerStatusMonitor_notificationListener, "f").removeAllListeners('notification');
    __classPrivateFieldGet(this, _PlayerStatusMonitor_notificationListener, "f").removeAllListeners('disconnect');
    __classPrivateFieldSet(this, _PlayerStatusMonitor_notificationListener, null, "f");
    __classPrivateFieldGet(this, _PlayerStatusMonitor_instances, "m", _PlayerStatusMonitor_abortCurrentAndPendingStatusRequest).call(this);
    this.emit('disconnect', __classPrivateFieldGet(this, _PlayerStatusMonitor_player, "f"));
}, _PlayerStatusMonitor_handleNotification = function _PlayerStatusMonitor_handleNotification(data) {
    let preRequestStatus = Promise.resolve();
    if (data.notification === 'sync') {
        if (data.params[0] === '-') {
            if (data.playerId === __classPrivateFieldGet(this, _PlayerStatusMonitor_player, "f").id) { // Unsynced
                SqueezeliteMCContext_1.default.getLogger().info('[squeezelite_mc] Squeezelite removed from sync group.');
                __classPrivateFieldSet(this, _PlayerStatusMonitor_syncMaster, null, "f");
            }
            else if (data.playerId === __classPrivateFieldGet(this, _PlayerStatusMonitor_syncMaster, "f")) { // Sync master itself unsynced
                SqueezeliteMCContext_1.default.getLogger().info(`[squeezelite_mc] Squeezelite's sync master (${__classPrivateFieldGet(this, _PlayerStatusMonitor_syncMaster, "f")}) removed from sync group.`);
                // Need to get updated sync master, if any.
                preRequestStatus = __classPrivateFieldGet(this, _PlayerStatusMonitor_instances, "m", _PlayerStatusMonitor_getPlayerSyncMaster).call(this).then((result) => {
                    if (result.syncMaster) {
                        SqueezeliteMCContext_1.default.getLogger().info(`[squeezelite_mc] Squeezelite is now in sync group with sync master ${result.syncMaster}.`);
                    }
                    else if (!result.error) {
                        SqueezeliteMCContext_1.default.getLogger().info('[squeezelite_mc] Squeezelite is now unsynced or in a sync group with itself as the sync master.');
                    }
                    __classPrivateFieldSet(this, _PlayerStatusMonitor_syncMaster, result.syncMaster, "f");
                });
            }
        }
        else if (data.playerId && data.params[0] === __classPrivateFieldGet(this, _PlayerStatusMonitor_player, "f").id) { // Synced
            __classPrivateFieldSet(this, _PlayerStatusMonitor_syncMaster, data.playerId, "f");
            SqueezeliteMCContext_1.default.getLogger().info(`[squeezelite_mc] Squeezelite joined sync group with sync master ${__classPrivateFieldGet(this, _PlayerStatusMonitor_syncMaster, "f")}.`);
        }
    }
    if (data.playerId === __classPrivateFieldGet(this, _PlayerStatusMonitor_player, "f").id || data.notification === 'sync' ||
        (__classPrivateFieldGet(this, _PlayerStatusMonitor_syncMaster, "f") && data.playerId === __classPrivateFieldGet(this, _PlayerStatusMonitor_syncMaster, "f"))) {
        __classPrivateFieldGet(this, _PlayerStatusMonitor_instances, "m", _PlayerStatusMonitor_abortCurrentAndPendingStatusRequest).call(this);
        preRequestStatus.finally(() => {
            __classPrivateFieldGet(this, _PlayerStatusMonitor_instances, "m", _PlayerStatusMonitor_abortCurrentAndPendingStatusRequest).call(this);
            __classPrivateFieldSet(this, _PlayerStatusMonitor_statusRequestTimer, setTimeout(__classPrivateFieldGet(this, _PlayerStatusMonitor_instances, "m", _PlayerStatusMonitor_getStatusAndEmit).bind(this), 200), "f");
        });
    }
}, _PlayerStatusMonitor_getStatusAndEmit = async function _PlayerStatusMonitor_getStatusAndEmit() {
    __classPrivateFieldGet(this, _PlayerStatusMonitor_instances, "m", _PlayerStatusMonitor_abortCurrentAndPendingStatusRequest).call(this);
    __classPrivateFieldSet(this, _PlayerStatusMonitor_statusRequestController, new node_abort_controller_1.AbortController(), "f");
    try {
        const playerStatus = await __classPrivateFieldGet(this, _PlayerStatusMonitor_instances, "m", _PlayerStatusMonitor_requestPlayerStatus).call(this, __classPrivateFieldGet(this, _PlayerStatusMonitor_statusRequestController, "f"));
        if (playerStatus._requestAborted !== undefined && playerStatus._requestAborted) {
            return;
        }
        // Check if we got a valid result
        if (!playerStatus.result) {
            SqueezeliteMCContext_1.default.getLogger().warn('[squeezelite_mc] Player status request returned no result.');
            return;
        }
        // For Music Assistant, ensure we parse the result even when in a sync group
        // The status command should return the correct information including sync state
        this.emit('update', {
            player: __classPrivateFieldGet(this, _PlayerStatusMonitor_player, "f"),
            status: __classPrivateFieldGet(this, _PlayerStatusMonitor_instances, "m", _PlayerStatusMonitor_parsePlayerStatusResult).call(this, playerStatus.result)
        });
    }
    catch (error) {
        SqueezeliteMCContext_1.default.getLogger().error(SqueezeliteMCContext_1.default.getErrorMessage('[squeezelite_mc] Error getting player status: ', error));
    }
}, _PlayerStatusMonitor_abortCurrentAndPendingStatusRequest = function _PlayerStatusMonitor_abortCurrentAndPendingStatusRequest() {
    if (__classPrivateFieldGet(this, _PlayerStatusMonitor_statusRequestTimer, "f")) {
        clearTimeout(__classPrivateFieldGet(this, _PlayerStatusMonitor_statusRequestTimer, "f"));
        __classPrivateFieldSet(this, _PlayerStatusMonitor_statusRequestTimer, null, "f");
    }
    if (__classPrivateFieldGet(this, _PlayerStatusMonitor_statusRequestController, "f")) {
        __classPrivateFieldGet(this, _PlayerStatusMonitor_statusRequestController, "f").abort();
        __classPrivateFieldSet(this, _PlayerStatusMonitor_statusRequestController, null, "f");
    }
}, _PlayerStatusMonitor_createAndStartNotificationListener = async function _PlayerStatusMonitor_createAndStartNotificationListener() {
    const notificationListener = new lms_cli_notifications_1.NotificationListener({
        server: (0, Util_1.getServerConnectParams)(__classPrivateFieldGet(this, _PlayerStatusMonitor_player, "f").server, __classPrivateFieldGet(this, _PlayerStatusMonitor_serverCredentials, "f"), 'cli'),
        subscribe: ['play', 'stop', 'pause', 'playlist', 'mixer', 'sync']
    });
    notificationListener.on('notification', __classPrivateFieldGet(this, _PlayerStatusMonitor_instances, "m", _PlayerStatusMonitor_handleNotification).bind(this));
    notificationListener.on('disconnect', __classPrivateFieldGet(this, _PlayerStatusMonitor_instances, "m", _PlayerStatusMonitor_handleDisconnect).bind(this));
    await notificationListener.start();
    return notificationListener;
}, _PlayerStatusMonitor_detectMusicAssistant = async function _PlayerStatusMonitor_detectMusicAssistant() {
    const connectParams = (0, Util_1.getServerConnectParams)(__classPrivateFieldGet(this, _PlayerStatusMonitor_player, "f").server, __classPrivateFieldGet(this, _PlayerStatusMonitor_serverCredentials, "f"), 'rpc');
    try {
        const response = await (0, RPC_1.sendRpcRequest)(connectParams, [
            '',
            ['serverstatus']
        ]);
        if (response.result && response.result.uuid === 'aioslimproto') {
            return true;
        }
        return false;
    }
    catch (error) {
        SqueezeliteMCContext_1.default.getLogger().error(SqueezeliteMCContext_1.default.getErrorMessage('[squeezelite_mc] Error detecting server type: ', error));
        // Default to standard LMS behavior on error
        return false;
    }
}, _PlayerStatusMonitor_startPolling = function _PlayerStatusMonitor_startPolling() {
    if (__classPrivateFieldGet(this, _PlayerStatusMonitor_pollingInterval, "f")) {
        clearInterval(__classPrivateFieldGet(this, _PlayerStatusMonitor_pollingInterval, "f"));
    }
    __classPrivateFieldSet(this, _PlayerStatusMonitor_pollingInterval, setInterval(async () => {
        try {
            // Check for sync master changes when using Music Assistant
            const syncResult = await __classPrivateFieldGet(this, _PlayerStatusMonitor_instances, "m", _PlayerStatusMonitor_getPlayerSyncMaster).call(this);
            if (syncResult.syncMaster !== __classPrivateFieldGet(this, _PlayerStatusMonitor_syncMaster, "f")) {
                if (syncResult.syncMaster) {
                    SqueezeliteMCContext_1.default.getLogger().info(`[squeezelite_mc] Squeezelite sync master changed to ${syncResult.syncMaster}.`);
                }
                else if (__classPrivateFieldGet(this, _PlayerStatusMonitor_syncMaster, "f")) {
                    SqueezeliteMCContext_1.default.getLogger().info('[squeezelite_mc] Squeezelite removed from sync group.');
                }
                __classPrivateFieldSet(this, _PlayerStatusMonitor_syncMaster, syncResult.syncMaster, "f");
            }
            await __classPrivateFieldGet(this, _PlayerStatusMonitor_instances, "m", _PlayerStatusMonitor_getStatusAndEmit).call(this);
        }
        catch (error) {
            SqueezeliteMCContext_1.default.getLogger().error(SqueezeliteMCContext_1.default.getErrorMessage('[squeezelite_mc] Error in polling loop: ', error));
        }
    }, __classPrivateFieldGet(this, _PlayerStatusMonitor_pollingIntervalMs, "f")), "f");
}, _PlayerStatusMonitor_requestPlayerStatus = async function _PlayerStatusMonitor_requestPlayerStatus(abortController) {
    const connectParams = (0, Util_1.getServerConnectParams)(__classPrivateFieldGet(this, _PlayerStatusMonitor_player, "f").server, __classPrivateFieldGet(this, _PlayerStatusMonitor_serverCredentials, "f"), 'rpc');
    return (0, RPC_1.sendRpcRequest)(connectParams, [
        __classPrivateFieldGet(this, _PlayerStatusMonitor_player, "f").id,
        [
            'status',
            '-',
            1,
            'tags:cgAABbehldiqtyrTISSuoKLNJj'
        ]
    ], abortController);
}, _PlayerStatusMonitor_getPlayerSyncMaster = 
// If player is in a sync group, then get the master player of the group.
// Returns null if player is not in a sync group or it is the master player itself.
async function _PlayerStatusMonitor_getPlayerSyncMaster() {
    const connectParams = (0, Util_1.getServerConnectParams)(__classPrivateFieldGet(this, _PlayerStatusMonitor_player, "f").server, __classPrivateFieldGet(this, _PlayerStatusMonitor_serverCredentials, "f"), 'rpc');
    try {
        const status = await (0, RPC_1.sendRpcRequest)(connectParams, [
            __classPrivateFieldGet(this, _PlayerStatusMonitor_player, "f").id,
            [
                'status'
            ]
        ]);
        return {
            syncMaster: status.result.sync_master !== __classPrivateFieldGet(this, _PlayerStatusMonitor_player, "f").id ? status.result.sync_master : null
        };
    }
    catch (error) {
        SqueezeliteMCContext_1.default.getLogger().error(SqueezeliteMCContext_1.default.getErrorMessage('[squeezelite_mc] Error in getting Squeezelite\'s sync master: ', error));
        return {
            error: error
        };
    }
}, _PlayerStatusMonitor_parsePlayerStatusResult = function _PlayerStatusMonitor_parsePlayerStatusResult(data) {
    if (!data) {
        SqueezeliteMCContext_1.default.getLogger().warn('[squeezelite_mc] Received null or undefined data in parsePlayerStatusResult');
        return {
            mode: 'stop',
            time: 0,
            volume: 0,
            repeatMode: 0,
            shuffleMode: 0,
            canSeek: 0
        };
    }
    const result = {
        mode: data.mode || 'stop',
        time: data.time,
        volume: data['mixer volume'],
        repeatMode: data['playlist repeat'],
        shuffleMode: data['playlist shuffle'],
        canSeek: data['can_seek']
    };
    // Safely check for playlist_loop array and first track
    if (data.playlist_loop && Array.isArray(data.playlist_loop) && data.playlist_loop.length > 0) {
        const track = data.playlist_loop[0];
        if (track) {
            result.currentTrack = {
                type: track.type,
                title: track.title,
                artist: track.artist,
                trackArtist: track.trackartist,
                albumArtist: track.albumartist,
                album: track.album,
                remoteTitle: track.remote_title,
                artworkUrl: track.artwork_url,
                coverArt: track.coverart,
                duration: track.duration,
                sampleRate: track.samplerate,
                sampleSize: track.samplesize,
                bitrate: track.bitrate
            };
        }
    }
    return result;
};
//# sourceMappingURL=PlayerStatusMonitor.js.map