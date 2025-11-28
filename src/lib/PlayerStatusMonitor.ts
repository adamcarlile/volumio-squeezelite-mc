import EventEmitter from 'events';
import sm from './SqueezeliteMCContext';
import { type Notification, NotificationListener } from 'lms-cli-notifications';
import {type PlayerStatus} from './types/Player';
import type Player from './types/Player';
import { type ServerCredentials } from './types/Server';
import { getServerConnectParams } from './Util';
import { sendRpcRequest } from './RPC';

type ServerType = 'lms' | 'music-assistant' | 'unknown';

export default class PlayerStatusMonitor extends EventEmitter {
  #player: Player;
  #serverCredentials: ServerCredentials;
  #notificationListener: NotificationListener | null;
  #statusRequestTimer: NodeJS.Timeout | null;
  #statusRequestController: AbortController | null;
  #syncMaster: string | null;
  #serverType: ServerType;
  #pollingInterval: NodeJS.Timeout | null;

  constructor(player: Player, serverCredentials: ServerCredentials) {
    super();
    this.#player = player;
    this.#serverCredentials = serverCredentials;
    this.#notificationListener = null;
    this.#statusRequestTimer = null;
    this.#statusRequestController = null;
    this.#syncMaster = null;
    this.#serverType = 'unknown';
    this.#pollingInterval = null;
  }

  async start() {
    // Detect server type first
    this.#serverType = await this.#detectServerType();
    sm.getLogger().info(`[squeezelite_mc] Detected server type: ${this.#serverType}`);

    if (this.#serverType === 'music-assistant') {
      // Use polling for Music Assistant
      this.#startPolling();
    } else {
      // Use subscription for LMS
      this.#notificationListener = await this.#createAndStartNotificationListener();
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
      this.#notificationListener = null;
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
    this.#getStatusAndEmit()
      .catch((error: unknown) => {
        this.#stdLogError('#getStatusAndEmit()', error);
      });
  }

  #stdLogError(fn: string, error: unknown, stack = false) {
    sm.getLogger().error(sm.getErrorMessage(`[squeezelite_mc] Caught error in ${fn}:`, error, stack));
  }

  async #detectServerType(): Promise<ServerType> {
    try {
      const connectParams = getServerConnectParams(this.#player.server, this.#serverCredentials, 'rpc');
      
      // Check server status for UUID to identify Music Assistant
      const serverStatusResult = await sendRpcRequest(connectParams, ['', ['serverstatus']]);
      const uuid = serverStatusResult.result.uuid;
      
      if (uuid === 'aioslimproto') {
        return 'music-assistant';
      }
      
      // If UUID is not aioslimproto, assume it's LMS
      return 'lms';
    } catch (error) {
      sm.getLogger().warn(`[squeezelite_mc] Could not detect server type: ${error}. Defaulting to LMS.`);
      return 'lms';
    }
  }

  #startPolling() {
    sm.getLogger().info('[squeezelite_mc] Starting polling mode for Music Assistant server');
    
    // Poll every 1000ms (1 second)
    this.#pollingInterval = setInterval(() => {
      this.#getStatusAndEmit().catch((error: unknown) => {
        this.#stdLogError('#getStatusAndEmit() [polling]', error);
      });
    }, 1000);
    
    // Initial status request
    this.#getStatusAndEmit().catch((error: unknown) => {
      this.#stdLogError('#getStatusAndEmit() [initial polling]', error);
    });
  }

  #handleDisconnect() {
    if (this.#notificationListener) {
      this.#notificationListener.removeAllListeners('notification');
      this.#notificationListener.removeAllListeners('disconnect');
      this.#notificationListener = null;
    }
    
    if (this.#pollingInterval) {
      clearInterval(this.#pollingInterval);
      this.#pollingInterval = null;
    }
    
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
      preRequestStatus
        .catch((error: unknown) => {
          this.#stdLogError('preRequestStatus', error);
        })
        .finally(() => {
          this.#abortCurrentAndPendingStatusRequest();
          this.#statusRequestTimer = setTimeout(() => {
            this.#getStatusAndEmit()
              .catch((error: unknown) => {
                this.#stdLogError('#getStatusAndEmit()', error);
              });
          }, 200);
        });
    }
  }

  async #getStatusAndEmit() {
    this.#abortCurrentAndPendingStatusRequest();
    this.#statusRequestController = new AbortController();

    const playerStatus = await this.#requestPlayerStatus(this.#statusRequestController);
    if (playerStatus._requestAborted !== undefined && playerStatus._requestAborted) {
      return;
    }
    this.emit('update', {
      player: this.#player,
      status: this.#parsePlayerStatusResult(playerStatus.result)
    });
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
    if (this.#serverType === 'music-assistant') {
      throw new Error('Notification listener should not be used with Music Assistant');
    }
    
    const notificationListener = new NotificationListener({
      server: getServerConnectParams(this.#player.server, this.#serverCredentials, 'cli'),
      subscribe: [ 'play', 'stop', 'pause', 'playlist', 'mixer', 'sync' ]
    });
    notificationListener.on('notification', this.#handleNotification.bind(this));
    notificationListener.on('disconnect', this.#handleDisconnect.bind(this));
    await notificationListener.start();
    return notificationListener;
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
    const result: PlayerStatus = {
      mode: data.mode,
      time: data.time,
      volume: data['mixer volume'],
      repeatMode: data['playlist repeat'],
      shuffleMode: data['playlist shuffle'],
      canSeek: data['can_seek']
    };

    const track = data.playlist_loop?.[0];
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

    return result;
  }

  on(event: 'update', listener: (data: {player: Player; status: PlayerStatus}) => void): this;
  on(event: 'disconnect', listener: (player: Player) => void): this;
  on(event: string | symbol, listener: (...args: any[]) => void): this {
    return super.on(event, listener);
  }
}
