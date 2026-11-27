const CONNECTION_LOST_MESSAGE = 'Connection to Home Assistant lost. Select a station again after reconnecting.';
const STARTUP_RETRY_INTERVAL_MS = 100;
const STARTUP_RETRY_WINDOW_MS = 15000;
const FOLLOW_UP_RETRY_LIMIT = 50;
const FOLLOW_UP_RETRY_WINDOW_MS = 5000;

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

class JukeboxCard extends HTMLElement {
    _playbackAttempts = new Map();
    _connectionRevision = 0;

    set hass(hass) {
        if (!this.content) {
            this._hassObservers = [];
            this.appendChild(getStyle());
            const card = document.createElement('ha-card');
            this.content = document.createElement('div');
            card.appendChild(this.content);
            this.appendChild(card);

            this.content.appendChild(this.buildSpeakerSwitches(hass));
            this._status = document.createElement('div');
            this._status.className = 'jukebox-status';
            this._status.setAttribute('role', 'status');
            this.content.appendChild(this._status);
            this.content.appendChild(this.buildVolumeSlider());
            this.content.appendChild(this.buildStationList());
        }

        this._hass = hass;
        this.syncConnection();
        for (const speaker of this._playbackAttempts.keys()) {
            if (!this.isSpeakerAvailable(speaker)) this._playbackAttempts.delete(speaker);
        }
        this.refreshControls();
    }

    disconnectedCallback() {
        this._playbackAttempts.clear();
        this._connectionRevision++;
    }

    get hass() {
        return this._hass;
    }

    isOnline() {
        return this.hass.connected !== false && this.hass.connection?.connected !== false;
    }

    isSpeakerAvailable(speaker) {
        const state = this.hass.states[speaker]?.state;
        return !!state && state !== 'unavailable' && state !== 'unknown';
    }

    canControl(speaker) {
        return this.isConnected && this.isOnline() && this.isSpeakerAvailable(speaker);
    }

    syncConnection() {
        const online = this.isOnline();
        if (online !== this._online) {
            this._connectionRevision++;
            this._actionError = '';
            this._online = online;
        }
        if (!online) this._playbackAttempts.clear();
    }

    refreshControls() {
        this._hassObservers.forEach(listener => listener(this.hass));
        const message = this.isOnline() ? this._actionError || '' : CONNECTION_LOST_MESSAGE;
        if (this._status.textContent !== message) this._status.textContent = message;
    }

    callMediaService(service, data) {
        // This card owns the error message, including errors from internal retries.
        return this.hass.callService('media_player', service, data, undefined, false);
    }

    showActionError(message) {
        this.syncConnection();
        if (this.isOnline()) this._actionError = message;
        this.refreshControls();
    }

    buildSpeakerSwitches(hass) {
        const speakers = document.createElement('div');
        speakers.className = 'speaker-list';
        speakers.setAttribute('role', 'group');
        speakers.setAttribute('aria-label', 'Speakers');
        this._speakerButtons = [];

        this.config.entities.forEach(entityId => {
            if (!hass.states[entityId]) {
                console.log('Jukebox: No State for entity', entityId);
                return;
            }
            const button = this.buildSpeakerSwitch(entityId, hass);
            this._speakerButtons.push(button);
            speakers.appendChild(button);
        });

        // automatically activate the first speaker that's playing
        const playingSpeaker = this._speakerButtons.find(button => hass.states[button.entityId].state === 'playing');
        this._selectedSpeaker = (playingSpeaker || this._speakerButtons[0])?.entityId;
        this.updateSpeakerSelection();

        return speakers;
    }

    buildStationList() {
        this._stationButtons = [];

        const stationList = document.createElement('div');
        stationList.classList.add('station-list');

        this.config.links.forEach(linkCfg => {
            const stationButton = this.buildStationSwitch(linkCfg.name, linkCfg.url, linkCfg.media_content_type, linkCfg.stream_type)
            this._stationButtons.push(stationButton);
            stationList.appendChild(stationButton);
        });

        // make sure the update method is notified of a change
        this._hassObservers.push(this.updateStationSwitchStates.bind(this));

        return stationList;
    }

    buildVolumeSlider() {
        const volumeContainer = document.createElement('div');
        volumeContainer.className = 'volume';

        const muteButton = document.createElement('ha-icon-button');
        muteButton.label = 'Mute';
        muteButton.isMute = false;
        muteButton.addEventListener('click', this.onMuteUnmute.bind(this));

        const haIconMute = document.createElement('ha-icon');
        haIconMute.icon = 'hass:volume-high';
        muteButton.appendChild(haIconMute);

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.setAttribute('aria-label', 'Volume');
        slider.min = 0;
        slider.max = 100;
        slider.addEventListener('change', this.onChangeVolumeSlider.bind(this));
        slider.className = 'volume-slider';

        const stopButton = document.createElement('ha-icon-button')
        stopButton.label = 'Stop';
        stopButton.setAttribute('disabled', true);
        stopButton.addEventListener('click', this.onStop.bind(this));

        const haIconStop = document.createElement('ha-icon');
        haIconStop.icon = 'hass:stop';
        stopButton.appendChild(haIconStop);

        this._hassObservers.push(hass => {
            const speaker = this._selectedSpeaker;
            const entity = hass.states[speaker];
            const attributes = entity?.attributes;
            const enabled = this.isOnline() && this.isSpeakerAvailable(speaker);
            const starting = this._playbackAttempts.has(speaker);
            const hasVolume = Object.hasOwn(attributes ?? {}, 'volume_level');
            const hasMute = Object.hasOwn(attributes ?? {}, 'is_volume_muted');

            volumeContainer.hidden = !entity;
            slider.hidden = !hasVolume;
            slider.disabled = !enabled || !hasVolume || !!attributes?.is_volume_muted;
            slider.value = hasVolume ? attributes.volume_level * 100 : 0;

            muteButton.toggleAttribute('hidden', !hasMute);
            muteButton.toggleAttribute('disabled', !enabled || !hasMute);
            muteButton.isMute = !!attributes?.is_volume_muted;
            muteButton.label = muteButton.isMute ? 'Unmute' : 'Mute';
            haIconMute.icon = muteButton.isMute ? 'hass:volume-off' : 'hass:volume-high';

            stopButton.toggleAttribute('hidden', !hasVolume && !starting);
            stopButton.toggleAttribute('disabled', !enabled || (!starting && (!hasVolume || entity.state !== 'playing')));
        });

        volumeContainer.appendChild(muteButton);
        volumeContainer.appendChild(slider);
        volumeContainer.appendChild(stopButton);
        return volumeContainer;
    }

    onSpeakerSelect(entityId) {
        this._selectedSpeaker = entityId;
        this.updateSpeakerSelection();
        this.refreshControls();
    }

    updateSpeakerSelection() {
        this._speakerButtons.forEach(button => {
            button.setAttribute('aria-pressed', String(button.entityId === this._selectedSpeaker));
        });
    }

    onChangeVolumeSlider(e) {
        if (e.currentTarget.disabled) return;
        this.runMediaAction('volume_set', {
            volume_level: Number(e.currentTarget.value) / 100,
        }, 'Could not set the volume.');
    }

    onMuteUnmute(e) {
        if (e.currentTarget.hasAttribute('disabled')) return;
        this.runMediaAction('volume_mute', {
            is_volume_muted: !e.currentTarget.isMute,
        }, 'Could not change mute.');
    }

    onStop(e) {
        if (e.currentTarget.hasAttribute('disabled')) return;
        this._playbackAttempts.delete(this._selectedSpeaker);
        this.runMediaAction('media_stop', {}, 'Could not stop playback.');
    }

    async runMediaAction(service, data, errorMessage) {
        const speaker = this._selectedSpeaker;
        if (!this.canControl(speaker)) return;
        const revision = this._connectionRevision;
        this._actionError = '';
        this.refreshControls();
        try {
            await this.callMediaService(service, { ...data, entity_id: speaker });
        } catch {
            if (this.isConnected && this._connectionRevision === revision) {
                this.showActionError(errorMessage);
            }
        }
    }

    updateStationSwitchStates(hass) {
        let playingUrl = null;
        const selectedSpeaker = this._selectedSpeaker;

        if (hass.states[selectedSpeaker] && hass.states[selectedSpeaker].state === 'playing') {
            playingUrl = hass.states[selectedSpeaker].attributes.media_content_id;
        }

        this._stationButtons.forEach(stationSwitch => {
            stationSwitch.disabled = !this.isOnline() || !this.isSpeakerAvailable(selectedSpeaker);
            stationSwitch.setAttribute('aria-pressed', String(stationSwitch.stationUrl === playingUrl));
        });
    }

    buildStationSwitch(name, url, media_content_type='music', stream_type='LIVE') {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.stationUrl = url;
        btn.stationName = name;
        btn.stationMediaContentType = media_content_type;
        btn.stationStreamType = stream_type;
        btn.className = 'juke-toggle';
        btn.textContent = name;
        btn.addEventListener('click', this.onStationSelect.bind(this));
        return btn;
    }

    async onStationSelect(e) {
        const speaker = this._selectedSpeaker;
        if (!this.canControl(speaker)) return;

        const { stationUrl, stationName, stationMediaContentType, stationStreamType } = e.currentTarget;
        const attempt = {};
        this._playbackAttempts.set(speaker, attempt);
        this._actionError = '';
        this.refreshControls();

        const isCurrent = () => this._playbackAttempts.get(speaker) === attempt;
        const canContinue = () => isCurrent() && this.canControl(speaker);
        const isStationPlaying = () => {
            const state = this.hass.states[speaker];
            return state?.state === 'playing' && state.attributes.media_content_id === stationUrl;
        };
        // A restart of the same station needs a retry even if the old state still says playing.
        let restart = isStationPlaying();
        const startupDeadline = Date.now() + STARTUP_RETRY_WINDOW_MS;

        try {
            await this.callMediaService('play_media', {
                entity_id: speaker,
                media_content_id: stationUrl,
                media_content_type: stationMediaContentType,
                extra: { stream_type: stationStreamType, title: stationName },
            });

            while (canContinue() && Date.now() < startupDeadline && (restart || !isStationPlaying())) {
                restart = false;
                await this.callMediaService('media_play', { entity_id: speaker });
                if (canContinue()) await wait(STARTUP_RETRY_INTERVAL_MS);
            }

            // Some Chromecast devices report playing before their audio starts.
            const followUpDeadline = Date.now() + FOLLOW_UP_RETRY_WINDOW_MS;
            for (let delay = 1; delay <= FOLLOW_UP_RETRY_LIMIT && canContinue(); delay++) {
                await wait(delay);
                if (!canContinue() || Date.now() >= followUpDeadline) break;
                await this.callMediaService('media_play', { entity_id: speaker });
            }
        } catch {
            if (isCurrent()) this.showActionError('Could not start playback. Select a station to try again.');
        } finally {
            if (isCurrent()) {
                this._playbackAttempts.delete(speaker);
                this.refreshControls();
            }
        }
    }

    buildSpeakerSwitch(entityId, hass) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.entityId = entityId;
        btn.textContent = hass.states[entityId].attributes.friendly_name || entityId;
        btn.addEventListener('click', () => this.onSpeakerSelect(entityId));
        return btn;
    }

    setConfig(config) {
        if (!config.entities) {
            throw new Error('You need to define your media player entities');
        }
        this.config = config;
    }

    getCardSize() {
        return 3;
    }
}

function getStyle() {
    const style = document.createElement('style');
    style.textContent = `
    jukebox-card [hidden] {
        display: none !important;
    }

    jukebox-card .jukebox-status:not(:empty) {
        margin: 8px 12px 0;
        color: var(--error-color, #d32f2f);
    }

    jukebox-card .volume {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 20px;
    }

    jukebox-card .volume-slider {
        flex: 1;
        min-width: 0;
        accent-color: var(--primary-color, #03a9f4);
    }

    jukebox-card .speaker-list,
    jukebox-card .station-list {
        display: flex;
        gap: 6px;
        padding: 8px;
    }

    jukebox-card .speaker-list {
        overflow-x: auto;
        border-bottom: 1px solid var(--divider-color, #aaa);
    }

    jukebox-card .station-list {
        flex-wrap: wrap;
    }

    jukebox-card .speaker-list button,
    jukebox-card .station-list button {
        box-sizing: border-box;
        min-height: 36px;
        padding: 6px 12px;
        border: 1px solid var(--divider-color, #aaa);
        border-radius: 6px;
        background: var(--ha-card-background, var(--card-background-color, transparent));
        color: var(--primary-text-color, inherit);
        font: inherit;
        cursor: pointer;
    }

    jukebox-card .speaker-list button {
        flex: none;
        white-space: nowrap;
    }

    jukebox-card .station-list button {
        max-width: 100%;
        overflow-wrap: anywhere;
    }

    jukebox-card .speaker-list button[aria-pressed='true'],
    jukebox-card .station-list button[aria-pressed='true'] {
        border-color: var(--primary-color, #03a9f4);
        box-shadow: inset 0 -3px var(--primary-color, #03a9f4);
    }

    jukebox-card .speaker-list button:focus-visible,
    jukebox-card .station-list button:focus-visible {
        outline: 2px solid var(--primary-color, #03a9f4);
        outline-offset: 2px;
    }

    jukebox-card .station-list button:disabled {
        opacity: 0.5;
        cursor: default;
    }
    `;
    return style;
}

customElements.define('jukebox-card', JukeboxCard);
