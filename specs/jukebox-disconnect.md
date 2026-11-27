# Handle Home Assistant disconnects in Jukebox

## Regression

During Chromecast startup, Jukebox v0.1.0 sends repeated `media_play`
calls without awaiting their responses. After a WebSocket connection drops,
cached speaker state can still drive the retry loops. Home Assistant can
show an error notification for each failed service call.

## Acceptance criteria

| ID | Scenario | Expected result |
| --- | --- | --- |
| DC-1 | Home Assistant disconnects during a pending startup call or between retries | End all startup attempts on the card. Once the disconnect is known, send no more commands. Show one accessible inline connection message and request no Home Assistant error notifications for actions handled by the card. |
| DC-2 | The card is offline, including first render | Keep speaker and station lists visible. Disable station, volume, mute, and stop actions. Speaker selection remains usable. |
| DC-3 | Home Assistant reconnects | Re-enable actions for available speakers and reflect the reported playing state. An interrupted attempt never resumes. The user can start a new attempt. |
| DC-4 | A media action fails while connected | Show one inline action error. A failed startup call ends that attempt. Other speakers can continue, and a new action can clear the error. |
| DC-5 | Playback starts normally, the user selects another speaker, changes stations, or presses Stop | Preserve the bounded Chromecast retry behavior and station metadata. Await each startup call before sending the next. Retries stay on their original speaker. Starting again on the same speaker, pressing Stop, or removing the card prevents any further retries from the previous attempt. Stop is usable during startup. |

A request already sent may still take effect. A response from a canceled
attempt must not restart it or replace the current status. The card uses
Home Assistant's connection state and keeps the existing dashboard YAML.

## Verification

Run the browser fixtures under `tests/`. The disconnect fixture simulates
a pending WebSocket service call, an outage, reconnection, and action
failures. The existing UI fixture covers layout, media metadata, volume,
and speaker routing. In the HACS beta, start a station, interrupt the
dashboard connection during startup, reconnect, then explicitly start a
station again. Verify ordinary playback and Stop with actual speakers.
