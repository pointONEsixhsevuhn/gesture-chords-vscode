# Gesture Chords

A small browser instrument that uses your webcam to turn hand gestures into synthesized chords.

## Run it in VS Code

1. Open this folder in VS Code.
2. Install the **Live Server** extension if you do not have it already.
3. Right-click `index.html` and choose **Open with Live Server**.
4. Click **Enable camera** and allow camera access.

Use a secure browser context such as `localhost` (Live Server provides one). Hand tracking loads MediaPipe files from public CDNs, so the first run needs an internet connection. Your camera stream stays in the browser and is not uploaded by this app.

## Gestures

Choose the key and Major or Natural minor chord family. Each of the ten fingertips plays a full diatonic triad. Extend to play and curl to stop; extend thumbs outward.

For C major, left thumb through little finger: C, Dm, Em, F, G. Right thumb through little finger: Am, Bdim, C, Dm, Em. The last three chords repeat an octave higher.

For A natural minor: Am, Bdim, C, Dm, Em, F, G, Am, Bdim, C. Changing the family updates all fingertip labels and stops previous chords. Use Test fingertip and Play to try any assigned chord without the camera.

This is a learning prototype. Hand tracking can be sensitive to lighting, camera angle, and hand orientation.

## Record and save

Choose System audio, Microphone + chords, or Camera + microphone + chords. Click Record, grant the requested browser access, perform, then Stop recording and Save recording.

System audio uses the sharing picker: choose a tab or screen and enable Share audio. Availability depends on the browser and shared source; tab sharing in desktop Chrome or Edge is often the simplest option. Shared audio is saved without screen video.

Microphone mode mixes singing and synthesized chords into an audio file. Camera mode also records webcam video, with a muted live preview. Neither mode sends live microphone sound to speakers. Existing hand-tracking camera access is reused without stopping tracking when recording ends. Headphones reduce chord sound leaking into the microphone.

Capture access ends when recording stops. Save before refreshing or closing; recordings are held in the browser until downloaded. Files use WebM, Ogg, M4A or MP4 according to browser support.


## Camera workspace

The camera occupies the main workspace, with chord-family and recording controls beside it. Lyrics and song search are no longer displayed. Launch start.bat and open http://localhost:3000, or use Live Server.

## Sound and mixing

Sound & mix opens four synthesized instrument presets: Piano, Acoustic guitar, Organ, and Synth. Piano/guitar use harmonic pluck envelopes rather than recorded samples. Choose Chord, Strum (55 ms between notes), or Arpeggio (180 ms steps). Hold to play stops when a finger curls; Play once per raise plays a short phrase without retriggering until the finger lowers and rises again. Hold mode sustains every instrument continuously, including piano/guitar after their initial attack. Curling a finger stops its held chord with a short fade, and removing both hands stops all sounds. One-shot mode plays one short chord or arpeggio per raise. Test Play toggles a held chord on/off. Family or sound-setting changes, Stop all sounds, and leaving the browser window cancel active notes and arpeggio timers.

Instrument volume affects speakers and mic/camera recordings. Microphone volume affects the recorded voice only (up to 150%). Peak meters show instrument, microphone, and current recording levels; the microphone meter activates only during recording with microphone access. System-audio mode records the shared source directly and uses its own source volume; it is not mixed with duplicate instrument audio.

## Magical visuals

The enchanted theme includes a star field, moon, glowing keys and chord spell effects. Actual chord triggers (manual or camera) create floating chord names, expanding rings and sparks that fade automatically; arpeggios emit a spell each cycle. Magic effects can be switched off. Reduced-motion preferences use a short stationary fade. Effects are capped and cleaned up, do not block controls or change audio, and are decorative only (not included in recorded webcam video).

Finger triggers require 180 ms of continuous extension, with stronger straightness checks for the four non-thumb fingers. Lowering a finger resets its pending trigger immediately.

## Recording controls

Choose a 3- or 5-second countdown, or Off. Countdown begins after camera/microphone/sharing permissions are granted; Stop cancels it without producing a new file. Pause and Resume keep the performance in a single file, excluding paused time. The visible timer shows captured duration and stays at the final duration after Stop. Microphone/camera access remains active while paused and ends on Stop.

Finger sensitivity in Sound & mix adjusts the index, middle, ring, and little fingers using extension normalized to each finger length, instead of the previous strict wrist-distance threshold. Default: 65%. Raise it if straight fingers are missed; lower it for fewer accidental triggers. Thumb safeguards and the 180 ms stability delay remain unchanged.
