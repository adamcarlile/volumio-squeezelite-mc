import EventEmitter from 'events';
import sm from './SqueezeliteMCContext';
import { Notification, NotificationListener } from 'lms-cli-notifications';
import Player, { PlayerStatus } from './types/Player';
import { ServerCredentials } from './types/Server';
import { getServerConnectParams } from './Util';
import { sendRpcRequest } from './RPC';
import { AbortController } from 'node-abort-controller';

export default class PlayerStatusMonitor extends EventEmitter {
  #player: Player;
  #serverCredentials: ServerCredentials;
  #notificationListener: NotificationListener | null;
  #statusRequestTimer: NodeJS.Timeout | null;
  #statusRequestController: AbortController | null;
  #syncMaster: string | null;
  #isMusicAssistant: boolean;
  #pollingInterval: NodeJS.Timeout | null;
  #pollingIntervalMs: number;

  constructor(player: Player, serverCredentials: ServerCredentials) {
    super();
    this.#player = player;
    this.#serverCredentials = serverCredentials;
    this.#notificationListener = null;
    this.#statusRequestTimer = null;
    this.#statusRequestController = null;
    this.#syncMaster = null;
    this.#isMusicAssistant = false;
    this.#pollingInterval = null;
    this.#pollingIntervalMs = 1000; // Poll every 1 second for Music Assistant
  }

  async start() {
    // Detect if server is Music Assistant
    this.#isMusicAssistant = await this.#detectMusicAssistant();

    if (this.#isMusicAssistant) {
      sm.getLogger().info('[squeezelite_mc] Music Assistant server detected. Using polling mode instead of event subscription.');
      // Start polling for Music Assistant
      this.#startPolling();
    }
    else {
      // Use notification listener for standard LMS
      try {
        this.#notificationListener = await this.#createAndStartNotificationListener();
      }
      catch (error) {
        sm.getLogger().error(sm.getErrorMessage('[squeezelite_mc] Failed to start notification listener, falling back to polling mode: ', error));
        // Fall back to polling if notification listener fails (e.g., Music Assistant not detected properly)
        this.#isMusicAssistant = true;
        this.#startPolling();
      }
    }

    this.#syncMaster = (await this.#getPlayerSyncMaster()).syncMaster;
    if (this.#syncMaster) {
      sm.getLogger().info(`[squeezelite_mc] Squeezelite in sync group with sync master ${this.#syncMaster}.`);
    }
    await this.#getStatusAndEmit();
  }

  async stop() {
    if (this.#notificationListener) {
      await this.#notificationListener.stop();
    }
    if (this.#pollingInterval) {
      clearInterval(this.#pollingInterval);
      this.#pollingInterval = null;
    }
  }

  getPlayer() {
    return this.#player;
  }

  requestUpdate() {
    this.#getStatusAndEmit();
  }

  #handleDisconnect() {
    if (!this.#notificationListener) {
      return;
    }
    this.#notificationListener.removeAllListeners('notification');
    this.#notificationListener.removeAllListeners('disconnect');
    this.#notificationListener = null;
    this.#abortCurrentAndPendingStatusRequest();

    this.emit('disconnect', this.#player);
  }

  #handleNotification(data: Notification) {
    let preRequestStatus = Promise.resolve();
    if (data.notification === 'sync') {
      if (data.params[0] === '-') {
        if (data.playerId === this.#player.id) { // Unsynced
          sm.getLogger().info('[squeezelite_mc] Squeezelite removed from sync group.');
          this.#syncMaster = null;
        }
        else if (data.playerId === this.#syncMaster) { // Sync master itself unsynced
          sm.getLogger().info(`[squeezelite_mc] Squeezelite's sync master (${this.#syncMaster}) removed from sync group.`);
          // Need to get updated sync master, if any.
          preRequestStatus = this.#getPlayerSyncMaster().then((result) => {
            if (result.syncMaster) {
              sm.getLogger().info(`[squeezelite_mc] Squeezelite is now in sync group with sync master ${result.syncMaster}.`);
            }
            else if (!result.error) {
              sm.getLogger().info('[squeezelite_mc] Squeezelite is now unsynced or in a sync group with itself as the sync master.');
            }
            this.#syncMaster = result.syncMaster;
          });
        }
      }
      else if (data.playerId && data.params[0] === this.#player.id) { // Synced
        this.#syncMaster = data.playerId;
        sm.getLogger().info(`[squeezelite_mc] Squeezelite joined sync group with sync master ${this.#syncMaster}.`);
      }
    }
    if (data.playerId === this.#player.id || data.notification === 'sync' ||
      (this.#syncMaster && data.playerId === this.#syncMaster)) {
      this.#abortCurrentAndPendingStatusRequest();
      preRequestStatus.finally(() => {
        this.#abortCurrentAndPendingStatusRequest();
        this.#statusRequestTimer = setTimeout(this.#getStatusAndEmit.bind(this), 200);
      });
    }
  }

  async #getStatusAndEmit() {
    this.#abortCurrentAndPendingStatusRequest();
    this.#statusRequestController = new AbortController();

    try {
      const playerStatus = await this.#requestPlayerStatus(this.#statusRequestController);
      if (playerStatus._requestAborted !== undefined && playerStatus._requestAborted) {
        return;
      }

      // Check if we got a valid result
      if (!playerStatus.result) {
        sm.getLogger().warn('[squeezelite_mc] Player status request returned no result.');
        return;
      }

      // For Music Assistant, ensure we parse the result even when in a sync group
      // The status command should return the correct information including sync state
      this.emit('update', {
        player: this.#player,
        status: this.#parsePlayerStatusResult(playerStatus.result)
      });
    }
    catch (error) {
      sm.getLogger().error(sm.getErrorMessage('[squeezelite_mc] Error getting player status: ', error));
    }
  }

  #abortCurrentAndPendingStatusRequest() {
    if (this.#statusRequestTimer) {
      clearTimeout(this.#statusRequestTimer);
      this.#statusRequestTimer = null;
    }
    if (this.#statusRequestController) {
      this.#statusRequestController.abort();
      this.#statusRequestController = null;
    }
  }

  async #createAndStartNotificationListener() {
    const notificationListener = new NotificationListener({
      server: getServerConnectParams(this.#player.server, this.#serverCredentials, 'cli'),
      subscribe: [ 'play', 'stop', 'pause', 'playlist', 'mixer', 'sync' ]
    });
    notificationListener.on('notification', this.#handleNotification.bind(this));
    notificationListener.on('disconnect', this.#handleDisconnect.bind(this));
    await notificationListener.start();
    return notificationListener;
  }

  async #detectMusicAssistant() {
    const connectParams = getServerConnectParams(this.#player.server, this.#serverCredentials, 'rpc');

    // Add timeout and retry logic for more robust detection
    const maxRetries = 3;
    const retryDelay = 1000; // 1 second

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

        const response = await sendRpcRequest(connectParams, [
          '',
          [ 'serverstatus' ]
        ], controller);

        clearTimeout(timeoutId);

        if (response.result && response.result.uuid === 'aioslimproto') {
          sm.getLogger().info('[squeezelite_mc] Server identified as Music Assistant');
          return true;
        }
        sm.getLogger().info('[squeezelite_mc] Server identified as standard LMS');
        return false;
      }
      catch (error) {
        if (attempt < maxRetries) {
          sm.getLogger().warn(`[squeezelite_mc] Error detecting server type (attempt ${attempt}/${maxRetries}), retrying...`);
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
        }
        else {
          sm.getLogger().error(sm.getErrorMessage('[squeezelite_mc] Error detecting server type after multiple attempts: ', error));
          // Default to standard LMS behavior on error
          return false;
        }
      }
    }
    return false;
  }

  #startPolling() {
    if (this.#pollingInterval) {
      clearInterval(this.#pollingInterval);
    }
    this.#pollingInterval = setInterval(async () => {
      try {
        // Check for sync master changes when using Music Assistant
        const syncResult = await this.#getPlayerSyncMaster();
        if (syncResult.syncMaster !== this.#syncMaster) {
          if (syncResult.syncMaster) {
            sm.getLogger().info(`[squeezelite_mc] Squeezelite sync master changed to ${syncResult.syncMaster}.`);
          }
          else if (this.#syncMaster) {
            sm.getLogger().info('[squeezelite_mc] Squeezelite removed from sync group.');
          }
          this.#syncMaster = syncResult.syncMaster;
        }
        await this.#getStatusAndEmit();
      }
      catch (error) {
        sm.getLogger().error(sm.getErrorMessage('[squeezelite_mc] Error in polling loop: ', error));
      }
    }, this.#pollingIntervalMs);
  }

  async #requestPlayerStatus(abortController: AbortController) {
    const connectParams = getServerConnectParams(this.#player.server, this.#serverCredentials, 'rpc');
    return sendRpcRequest(connectParams, [
      this.#player.id,
      [
        'status',
        '-',
        1,
        'tags:cgAABbehldiqtyrTISSuoKLNJj'
      ]
    ], abortController);
  }

  // If player is in a sync group, then get the master player of the group.
  // Returns null if player is not in a sync group or it is the master player itself.
  async #getPlayerSyncMaster() {
    const connectParams = getServerConnectParams(this.#player.server, this.#serverCredentials, 'rpc');
    try {
      const status = await sendRpcRequest(connectParams, [
        this.#player.id,
        [
          'status'
        ]
      ]);
      return {
        syncMaster: status.result.sync_master !== this.#player.id ? status.result.sync_master : null
      };
    }
    catch (error) {
      sm.getLogger().error(sm.getErrorMessage('[squeezelite_mc] Error in getting Squeezelite\'s sync master: ', error));
      return {
        error: error
      };
    }
  }

  #parsePlayerStatusResult(data: any) {
    if (!data) {
      sm.getLogger().warn('[squeezelite_mc] Received null or undefined data in parsePlayerStatusResult');
      return {
        mode: 'stop',
        time: 0,
        volume: 0,
        repeatMode: 0,
        shuffleMode: 0,
        canSeek: 0
      } as PlayerStatus;
    }

    const result: PlayerStatus = {
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
  }

  on(event: 'update', listener: (data: {player: Player; status: PlayerStatus}) => void): this;
  on(event: 'disconnect', listener: (player: Player) => void): this;
  on(event: string | symbol, listener: (...args: any[]) => void): this {
    return super.on(event, listener);
  }
}
