# Restore the Jukebox card controls

## Regression

[Upstream #32](https://github.com/lukx/home-assistant-jukebox/issues/32)
reports the card broken starting with Home Assistant 2025.5.0.
[Upstream #33](https://github.com/lukx/home-assistant-jukebox/issues/33)
describes broken speaker selection and station labels without clear separation.
2025.5.0 is the first version named in the reports.

The fork uses `paper-tabs` and `paper-tab` to generate a custom selection
event and `mwc-button` to render station controls. Without those elements
registered, the card cannot rely on their interaction or styling. Its
volume control also relies on `ha-slider` and its event behavior.

## Acceptance criteria

| ID | Scenario | Expected result |
| --- | --- | --- |
| UI-1 | Load an existing card with the legacy controls absent | The configured speakers and stations render as labeled controls. Speakers can be selected with a pointer or keyboard. The selected speaker is visibly and programmatically indicated. |
| UI-2 | Open a card with multiple speakers | Select the first configured speaker currently playing, or the first speaker present in Home Assistant state. A missing entity earlier in the list does not shift the selection. Without a known speaker, playback and volume controls cannot send commands. |
| UI-3 | Show several stations in a narrow card | Buttons have clear boundaries and wrap onto additional rows. The station matching the selected speaker's reported playing URL is visibly marked. The indicator updates on a speaker switch and on Home Assistant state updates. |
| UI-4 | Start a station and select another speaker during playback startup | Send the configured URL, media content type, stream type and original station name to the speaker selected at activation. Chromecast follow-up calls keep targeting that speaker. The existing defaults are `music` and `LIVE`. |
| UI-5 | Switch between speakers with different volume and playback states | The volume, mute, and stop controls reflect the selected speaker. Committing a volume change sends one `volume_set` call with a value from 0 to 1. Mute and stop use the selected speaker. |
| UI-6 | Load the updated resource in Home Assistant | The existing `custom:jukebox-card`, `entities`, and `links` configuration works with the updated JavaScript. Confirm the browser has loaded the new resource before evaluating the card. |

## Implementation approach

Use native speaker and station buttons with scoped CSS. Use a native range
input for volume. Keep the Home Assistant card and icon elements. Use the
existing speaker and station state to drive the visual and accessibility
indicators.

The [first community workaround](https://github.com/lukx/home-assistant-jukebox/issues/32#issuecomment-2868901315)
demonstrated native speaker buttons. It kept `mwc-button` for stations,
and [users still reported layout problems](https://github.com/lukx/home-assistant-jukebox/issues/33#issuecomment-3182837197).
A [later proposal](https://github.com/lukx/home-assistant-jukebox/issues/32#issuecomment-3558818030)
also used a native range input. Apply these control changes to the fork's
existing code so its station metadata and Chromecast playback behavior carry
through.

## Verification

Serve the checkout with `python3 -m http.server` and open
`/tests/jukebox-ui.html` in a browser to exercise UI-1 through UI-5 with
simulated Home Assistant state and recorded service calls. The fixture
checks focusability. Use Tab and Enter or Space on the installed card to
confirm keyboard interaction. For UI-6, use the affected Home Assistant
installation with the same card YAML, then play a station on each of two
speakers and try volume, mute, and stop. For manual HACS file replacement,
back up the existing resource and move any stale `jukebox-card.js.gz`
aside before reloading the browser. A stale compressed file
[masked a previous workaround](https://github.com/lukx/home-assistant-jukebox/issues/32#issuecomment-2870945641).
