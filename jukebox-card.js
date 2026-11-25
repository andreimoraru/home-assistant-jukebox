class JukeboxCard extends HTMLElement {
    set hass(hass) {
        if (!this.content) {
            this._hassObservers = [];
            this.appendChild(getStyle());
            const card = document.createElement('ha-card');
            this.content = document.createElement('div');
            card.appendChild(this.content);
            this.appendChild(card);

            this.content.appendChild(this.buildSpeakerSwitches(hass));
            this.content.appendChild(this.buildVolumeSlider());
            this.content.appendChild(this.buildStationList());
        }

        this._hass = hass;
        this._hassObservers.forEach(listener => listener(hass));
    }

    get hass() {
        return this._hass;
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
            const entity = hass.states[this._selectedSpeaker];
            volumeContainer.hidden = !entity;
            if (!entity) return;
            const speakerState = entity.attributes;

            // no speaker level? then hide mute button and volume
            if (!speakerState.hasOwnProperty('volume_level')) {
                slider.setAttribute('hidden', true);
                stopButton.setAttribute('hidden', true)
            } else {
                slider.removeAttribute('hidden');
                stopButton.removeAttribute('hidden')
            }

            if (!speakerState.hasOwnProperty('is_volume_muted')) {
                muteButton.setAttribute('hidden', true);
            } else {
                muteButton.removeAttribute('hidden');
            }

            if (hass.states[this._selectedSpeaker].state === 'playing') {
                stopButton.removeAttribute('disabled');
            } else {
                stopButton.setAttribute('disabled', true);
            }

            slider.value = speakerState.volume_level ? speakerState.volume_level * 100 : 0;

            if (speakerState.is_volume_muted && !slider.disabled) {
                slider.disabled = true;
                haIconMute.icon = 'hass:volume-off';
                muteButton.isMute = true;
            } else if (!speakerState.is_volume_muted && slider.disabled) {
                slider.disabled = false;
                haIconMute.icon = 'hass:volume-high';
                muteButton.isMute = false;
            }
            muteButton.label = muteButton.isMute ? 'Unmute' : 'Mute';
        });

        volumeContainer.appendChild(muteButton);
        volumeContainer.appendChild(slider);
        volumeContainer.appendChild(stopButton);
        return volumeContainer;
    }

    onSpeakerSelect(entityId) {
        this._selectedSpeaker = entityId;
        this.updateSpeakerSelection();
        this._hassObservers.forEach(listener => listener(this.hass));
    }

    updateSpeakerSelection() {
        this._speakerButtons.forEach(button => {
            button.setAttribute('aria-pressed', String(button.entityId === this._selectedSpeaker));
        });
    }

    onChangeVolumeSlider(e) {
        const volPercentage = parseFloat(e.currentTarget.value);
        const vol = (volPercentage > 0 ? volPercentage / 100 : 0);
        this.setVolume(vol);
    }

    onMuteUnmute(e) {
        this.hass.callService('media_player', 'volume_mute', {
            entity_id: this._selectedSpeaker,
            is_volume_muted: !e.currentTarget.isMute
        });
    }

    onStop(e) {
        this.hass.callService('media_player', 'media_stop', {
            entity_id: this._selectedSpeaker
        });
    }

    updateStationSwitchStates(hass) {
        let playingUrl = null;
        const selectedSpeaker = this._selectedSpeaker;

        if (hass.states[selectedSpeaker] && hass.states[selectedSpeaker].state === 'playing') {
            playingUrl = hass.states[selectedSpeaker].attributes.media_content_id;
        }

        this._stationButtons.forEach(stationSwitch => {
            stationSwitch.disabled = !hass.states[selectedSpeaker];
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
        if (!this.hass.states[speaker]) return;

        /** simple sleep() function as per https://blog.devgenius.io/how-to-make-javascript-sleep-or-wait-d95d33c99909 */
        const sleepNow = (delay) => new Promise((resolve) => setTimeout(resolve, delay));

        /** scenario when you hit on hit one more time on a station that is playing
         * 1) setting state field with idle value
        */

        if(this.hass.states[speaker].state === 'playing' && this.hass.states[speaker].attributes.media_content_id === e.currentTarget.stationUrl){
            this.hass.states[speaker].state = "idle"
        }

        /** set a variable to use as a timestamp to compute later the time spend on getting the Chromecast from non-playing state to playing state */
        var startTime = Date.now();
        
        this.hass.callService('media_player', 'play_media', {
            entity_id: speaker,
            media_content_id: e.currentTarget.stationUrl,
            /* media_content_type: 'audio/mpeg' */
            media_content_type: e.currentTarget.stationMediaContentType,
            extra: {
                stream_type: e.currentTarget.stationStreamType,
                title: e.currentTarget.stationName
            }
        });

        /* because e.currentTarget is going to be nulled after the Chromecast has state=playing, we need to store the stationUrl in a local variable */
        var stationUrl = e.currentTarget.stationUrl;

        /** timeout in seconds for waiting for the Chromecast to start playing the media */
        var playTimeout = 50;

        /** how frequent in miliseconds we should send media_play commands for waiting for the Chromecast to start playing the media */
        var playFrequency = 100;

        /** timeout in seconds while we send media_play commands when the device reports back as having state not playing */
        var idleTimeout = 3 * playTimeout * playFrequency;
        
        /**Chromecast device has a buffer to fill in before actually playing any content. The loop below is aiming to send  mediap_play command to Chromecast device until it reports its state as playing.
         * the additional check for media_content_id is required for the scenario when:
         * 1) Chromecast is playing something and obviously its state is playing.
         * 2) you try to play something else. Thus we compare the media_content_id value of whatever Chromecast device reports it is playing with the value of media_content_id that we sent it to play.
         *    If the values are different, then send media_play command repeatedly until Chromecare device reports back a value for media_content_id equal to the one we asked to be played.
         *    Note that condition that state is playing should be filled first.
         * 3) Control loop lenght with a safety timeout of idleTimout seconds
         * 4) In case the Chromecast reports back a playing state, then a message is logged at the developers tools console
         *    Example: playing [MD] MAESTRO FM http://192.168.1.20:8000/md.maestrofm
        */
        while (this.hass.states[speaker] && (this.hass.states[speaker].state !== 'playing' || this.hass.states[speaker].attributes.media_content_id !== stationUrl) && Date.now() - startTime < idleTimeout) {
            this.hass.callService('media_player', 'media_play', {
                entity_id: speaker
            });

            await sleepNow(playFrequency);
            
            const state = this.hass.states[speaker];
            if (state?.state === 'playing' && state.attributes.media_content_id === stationUrl) {
                console.log(state.state, state.attributes.media_title, state.attributes.media_content_id, "after", (Date.now() - startTime)/1000, "seconds");
            }
        }

        /** Loop for sending the media_play command to Chromecast after it is reporting a playing state but doesn't actually play (perhaps the Chromecast device buffer is still filling with media stream data).
         * By trying figured out the appropriate period to send this commands is about 5 seconds after it reported playing state but is not actually playing.
        */
         for (var i = 1; i <= playTimeout; ++i) {
            await sleepNow(i);
            if (!this.hass.states[speaker]) return;
            this.hass.callService('media_player', 'media_play', {
                entity_id: speaker
            });
        }
    }

    setVolume(value) {
        this.hass.callService('media_player', 'volume_set', {
            entity_id: this._selectedSpeaker,
            volume_level: value
        });
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
