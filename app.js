
const NOTES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const CHORDS = {
  major: { label: 'major', intervals: [0,4,7] },
  minor: { label: 'minor', intervals: [0,3,7] },
  diminished: { label: 'diminished', intervals: [0,3,6] },
  maj7: { label: 'major 7', intervals: [0,4,7,11] },
  sus4: { label: 'sus4', intervals: [0,5,7] }
};
const video = document.querySelector('#video');
const canvas = document.querySelector('#overlay');
const ctx = canvas.getContext('2d');
const cameraButton = document.querySelector('#cameraButton');
const cameraMessage = document.querySelector('#cameraMessage');
const placeholder = document.querySelector('#placeholder');
const trackingBadge = document.querySelector('#trackingBadge');
const familyKey = document.querySelector('#familyKey');
const familyMode = document.querySelector('#familyMode');
const testFinger = document.querySelector('#testFinger');
const chordName = document.querySelector('#chordName');
const notePills = document.querySelector('#notePills');
// Bind settings before initializing audio, meters or tracking.
let dialogReturnFocus;
function openAppDialog(dialog){
  if(!dialog)return;
  dialogReturnFocus=document.activeElement;
  if(typeof dialog.showModal==='function'){
    try{if(!dialog.open)dialog.showModal();return;}catch{}
  }
  dialog.setAttribute('open','');dialog.classList.add('dialog-fallback');
  dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');
  dialog.querySelector('button,select,input')?.focus();
}
function closeAppDialog(dialog){
  if(!dialog)return;
  if(typeof dialog.close==='function')dialog.close();
  else {dialog.removeAttribute('open');if(dialog.id==='playbackDialog')document.querySelector('#recordingPlayer')?.pause();}
  dialog.classList.remove('dialog-fallback');dialogReturnFocus?.focus?.();
}
const soundDialog=document.querySelector('#soundDialog');
document.querySelector('#soundButton').addEventListener('click',()=>openAppDialog(soundDialog));
document.querySelectorAll('[data-close-dialog]').forEach(button=>button.addEventListener('click',()=>closeAppDialog(document.getElementById(button.dataset.closeDialog))));
document.addEventListener('keydown',event=>{
  const dialog=document.querySelector('dialog.dialog-fallback[open]');if(!dialog)return;
  if(event.key==='Escape'){event.preventDefault();closeAppDialog(dialog);return;}
  if(event.key==='Tab'){
    const items=[...dialog.querySelectorAll('button:not([disabled]),select,input,a[href]')];
    if(!items.length)return;
    const first=items[0],last=items[items.length-1];
    if(event.shiftKey && document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first.focus();}
  }
});
let recordingDestination, instrumentBus, microphoneBus, mixBus, instrumentMeterNode, microphoneMeterNode, mixMeterNode, systemMeterNode, systemMeterMute;
const instrumentSelect = document.querySelector('#instrumentSelect');
const playStyle = document.querySelector('#playStyle');
const triggerMode = document.querySelector('#triggerMode');
const instrumentVolume = document.querySelector('#instrumentVolume');
const microphoneVolume = document.querySelector('#microphoneVolume');
const heldFingerKeys = new Set();
const soundGroups = new Set();
let manualGroup;
const TIMBRES = {
  piano: {harmonics:[0,1,.45,.2,.1,.06],attack:.008,decay:1.6,level:.024},
  guitar: {harmonics:[0,1,.6,.32,.18,.1,.05],attack:.004,decay:.85,level:.023},
  organ: {harmonics:[0,1,.15,.55,.12,.3,.08],attack:.025,decay:0,level:.018},
  synth: {harmonics:[0,1,0,.11,0,.04],attack:.035,decay:0,level:.025}
};
function setupAudioGraph() {
  recordingDestination = audioContext.createMediaStreamDestination();
  instrumentBus=audioContext.createGain(); microphoneBus=audioContext.createGain();mixBus=audioContext.createGain();
  instrumentBus.gain.value=Number(instrumentVolume.value)/100;
  microphoneBus.gain.value=Number(microphoneVolume.value)/100;
  instrumentMeterNode=audioContext.createAnalyser();microphoneMeterNode=audioContext.createAnalyser();mixMeterNode=audioContext.createAnalyser();
  [instrumentMeterNode,microphoneMeterNode,mixMeterNode].forEach(node=>node.fftSize=256);
  instrumentBus.connect(instrumentMeterNode);instrumentMeterNode.connect(audioContext.destination);instrumentMeterNode.connect(mixBus);
  microphoneBus.connect(microphoneMeterNode);microphoneMeterNode.connect(mixBus);
  mixBus.connect(mixMeterNode);mixMeterNode.connect(recordingDestination);
}
const guitarBuffers=new Map();
function pluckedStringSource(frequency) {
  const sampleRate=audioContext.sampleRate;
  const key=sampleRate+':'+frequency.toFixed(4);
  let entry=guitarBuffers.get(key);
  if(!entry){
    const period=Math.max(8,Math.round(sampleRate/frequency));
    const length=Math.ceil(sampleRate*.6/period)*period;
    const buffer=audioContext.createBuffer(1,length,sampleRate),samples=buffer.getChannelData(0);
    let mean=0;
    for(let i=0;i<period;i++){samples[i]=Math.random()*2-1;mean+=samples[i];}
    mean/=period;for(let i=0;i<period;i++)samples[i]-=mean;
    // Karplus-Strong: a short noise excitation rings through a damped string.
    for(let i=period;i<length;i++)samples[i]=.998*(samples[i-period]+samples[i-period+1])*.5;
    let peak=0;for(const value of samples)peak=Math.max(peak,Math.abs(value));
    for(let i=0;i<length;i++)samples[i]/=Math.max(peak,.001);
    entry={buffer,period};if(guitarBuffers.size>=48)guitarBuffers.delete(guitarBuffers.keys().next().value);guitarBuffers.set(key,entry);
  }
  const source=audioContext.createBufferSource();source.buffer=entry.buffer;source.loop=true;
  source.loopStart=(entry.buffer.length-entry.period)/sampleRate;source.loopEnd=entry.buffer.duration;
  source.playbackRate.value=frequency/(sampleRate/(entry.period-.5));
  return source;
}
function makeVoice(semitone, when, duration) {
  const preset=TIMBRES[instrumentSelect.value] || TIMBRES.piano;
  const frequency=261.63*Math.pow(2,semitone/12);
  const osc=instrumentSelect.value==='guitar'?pluckedStringSource(frequency):audioContext.createOscillator();
  const gain=audioContext.createGain();
  if(instrumentSelect.value!=='guitar'){
    const real=new Float32Array(preset.harmonics.length),imag=new Float32Array(preset.harmonics);
    osc.setPeriodicWave(audioContext.createPeriodicWave(real,imag));osc.frequency.value=frequency;
  }
  gain.gain.setValueAtTime(.0001,when);
  gain.gain.exponentialRampToValueAtTime(preset.level,when+preset.attack);
  if(preset.decay)gain.gain.exponentialRampToValueAtTime(duration ? .0001 : preset.level*.55,when+preset.decay);
  osc.connect(gain);gain.connect(instrumentBus);osc.start(when);
  const voice={osc,gain,when,ended:false};
  if(duration) {
    const end=when+duration;
    const level=preset.decay ? Math.max(.0001,preset.level*Math.pow(.0001/preset.level,Math.max(0,duration-preset.attack)/(preset.decay-preset.attack))) : preset.level;
    gain.gain.cancelScheduledValues(end);gain.gain.exponentialRampToValueAtTime(level,end);gain.gain.exponentialRampToValueAtTime(.0001,end+.12);
    osc.stop(end+.15);
  }
  return voice;
}
function startSoundGroup(chord, oneShot=false) {
  conjureChord(chord.label);
  const group={voices:new Set(),timer:null,closed:false};soundGroups.add(group);
  const addNote=(note,when,duration)=>{
    const voice=makeVoice(note,when,duration);group.voices.add(voice);
    voice.osc.onended=()=>{voice.ended=true;voice.osc.disconnect();voice.gain.disconnect();group.voices.delete(voice);if(!group.voices.size && !group.timer){soundGroups.delete(group);group.closed=true;updatePlayButton();}};
  };
  const now=audioContext.currentTime,style=playStyle.value;
  if(style==='arpeggio') {
    let step=0;
    const tick=()=>{if(group.closed)return;if(step>0 && step%chord.notes.length===0)conjureChord(chord.label);addNote(chord.notes[step++%chord.notes.length],audioContext.currentTime+.01,.16);};
    tick();group.timer=setInterval(tick,180);
    if(oneShot)group.endTimer=setTimeout(()=>releaseSoundGroup(group,true),1100);
  } else {
    chord.notes.forEach((note,index)=>addNote(note,now+.01+(style==='strum'?index*.055:0),oneShot?1.1:undefined));
  }
  return group;
}
function releaseSoundGroup(group, immediate=false) {
  if(!group || group.closed)return;group.closed=true;
  clearInterval(group.timer);group.timer=null;clearTimeout(group.endTimer);
  const now=audioContext.currentTime,tail=immediate ? .06 : .09;
  group.voices.forEach(voice=>{
    if(voice.ended)return;
    const param=voice.gain.gain;
    if(voice.when>now){param.cancelScheduledValues(now);param.setValueAtTime(.0001,now);}
    else if(param.cancelAndHoldAtTime)param.cancelAndHoldAtTime(now);
    else {const value=param.value;param.cancelScheduledValues(now);param.setValueAtTime(Math.max(.0001,value),now);}
    param.exponentialRampToValueAtTime(.0001,now+tail);
    voice.osc.stop(now+tail+.03);
  });
  soundGroups.delete(group);
  updatePlayButton();
}
function updatePlayButton(){
  const button=document.querySelector('#playButton');
  const playing=!!manualGroup && !manualGroup.closed && manualGroup.voices.size>0;
  button.textContent=playing?'\u25a0':'\u25b6';
  button.setAttribute('aria-label',playing?'Stop test chord':'Play test chord');
  button.setAttribute('aria-pressed',String(playing));
}
function stopCameraSounds(){
  for(const group of [...soundGroups])if(group.camera)releaseSoundGroup(group,true);
  fingerVoices.clear();heldFingerKeys.clear();fingerCandidates.clear();
  document.querySelectorAll('[data-finger]').forEach(el=>el.classList.remove('active'));
}
function stopAllSounds() {
  for(const group of [...soundGroups])releaseSoundGroup(group,true);
  fingerVoices.clear();heldFingerKeys.clear();fingerCandidates.clear();clearTimeout(manualStopTimer);manualGroup=null;updatePlayButton();
  document.querySelectorAll('[data-finger]').forEach(el=>el.classList.remove('active'));
}

let landmarker, stream, audioContext, lastVideoTime = -1, manualStopTimer;

function getChord(root, quality) {
  const chord = CHORDS[quality];
  return chord.intervals.map(semitones => (Number(root) + semitones) % 12);
}
function updateChord(root = getFingerChord(Number(testFinger.value)).root, quality = getFingerChord(Number(testFinger.value)).quality) {
  chordName.textContent = `${NOTES[root]} ${CHORDS[quality].label}`;
  notePills.innerHTML = getChord(root, quality).map(note => `<span>${NOTES[note]}</span>`).join('');
}
function setAudioStatus(message) {
  const status = document.querySelector('#audioState');
  status.replaceChildren(document.createElement('span'), document.createTextNode(message));
}
async function ensureAudio() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) throw new Error('This browser does not support audio. Try Chrome or Edge.');
  if (!audioContext || audioContext.state === 'closed') {
    audioContext = new AudioContextClass();
    setupAudioGraph();
    audioContext.onstatechange = () => setAudioStatus(audioContext.state === 'running' ? 'Audio enabled' : 'Click Play to enable audio');
  }
  if (audioContext.state !== 'running') await audioContext.resume();
  if (audioContext.state !== 'running') throw new Error('Click Play to enable audio in your browser.');
  setAudioStatus('Audio enabled');
}
function reportAudioError(error) {
  console.error(error);
  setAudioStatus(error.message || 'Audio could not start. Click Play to retry.');
}
async function playChord() {
  const chord=getFingerChord(Number(testFinger.value));
  await ensureAudio();clearTimeout(manualStopTimer);stopChord();updateChord(chord.root,chord.quality);
  manualGroup=startSoundGroup(chord,triggerMode.value==='once');updatePlayButton();
}
function stopChord() { releaseSoundGroup(manualGroup);manualGroup=null;updatePlayButton(); }
const FINGER_TIPS = [4, 8, 12, 16, 20];
const FINGER_NAMES = ['Thumb', 'Index', 'Middle', 'Ring', 'Little'];
const FAMILIES = {
  major: { steps: [0,2,4,5,7,9,11], qualities: ['major','minor','minor','major','major','minor','diminished'], degrees: ['I','ii','iii','IV','V','vi','vii dim'] },
  minor: { steps: [0,2,3,5,7,8,10], qualities: ['minor','diminished','major','minor','minor','major','major'], degrees: ['i','ii dim','III','iv','v','VI','VII'] }
};
function getFingerChord(index) {
  const family = FAMILIES[familyMode.value];
  const degree = index % 7;
  const root = Number(familyKey.value) + family.steps[degree];
  const quality = family.qualities[degree];
  const label = NOTES[root % 12] + (quality === 'minor' ? 'm' : quality === 'diminished' ? 'dim' : '');
  return { root: root % 12, quality, label, degree: family.degrees[degree],
    notes: CHORDS[quality].intervals.map(interval => root + interval + (index >= 7 ? 12 : 0)) };
}
function updateFamily() {
  stopAllSounds();
  document.querySelectorAll('[data-finger]').forEach(el => {
    const [side,finger] = el.dataset.finger.split('-');
    const chord = getFingerChord(Number(finger) + (side === 'Left' ? 0 : 5));
    el.querySelector('b').textContent = chord.label;
    el.title = chord.degree + ': ' + chord.notes.map(n => NOTES[n % 12]).join(', ');
  });
  testFinger.replaceChildren(...Array.from({length:10},(_,i)=>{
    const option = document.createElement('option'); option.value = String(i);
    option.textContent = (i<5?'Left ':'Right ') + FINGER_NAMES[i%5] + ': ' + getFingerChord(i).label;
    return option;
  }));
  chordName.textContent = NOTES[Number(familyKey.value)] + ' ' + familyMode.value + ' family';
  notePills.innerHTML = '';
}

const fingerVoices = new Map();
const fingerCandidates = new Map();
function stableFingerChords(raw, now) {
  const stable = new Map();
  for(const key of fingerCandidates.keys())if(!raw.has(key))fingerCandidates.delete(key);
  for(const [key,chord] of raw){
    if(heldFingerKeys.has(key)){stable.set(key,chord);continue;}
    if(!fingerCandidates.has(key))fingerCandidates.set(key,now);
    if(now-fingerCandidates.get(key)>=180)stable.set(key,chord);
  }
  return stable;
}
function fingerRaised(hand, finger, wasRaised = false) {
  const tip = FINGER_TIPS[finger];
  const distance = (a,b) => Math.hypot(hand[a].x-hand[b].x, hand[a].y-hand[b].y, (hand[a].z || 0)-(hand[b].z || 0));
  if (finger === 0) {
    // A thumb must be straight AND extend beyond the index side of the palm.
    // Wrist distance alone also accepts a thumb folded across the palm.
    const palmWidth = distance(5,17);
    if (palmWidth < 0.001) return false;
    const vector = (a,b) => [hand[a].x-hand[b].x, hand[a].y-hand[b].y, (hand[a].z || 0)-(hand[b].z || 0)];
    const dot = (a,b) => a.reduce((sum,value,i) => sum + value*b[i],0);
    const outward = vector(5,17).map(value => value/palmWidth);
    const spread = dot(vector(4,5),outward)/palmWidth;
    const distalOutward = dot(vector(4,3),outward)/palmWidth;
    const straightness = dot(vector(3,2),vector(4,3)) / Math.max(distance(3,2)*distance(4,3),0.000001);
    return spread > (wasRaised ? 0.30 : 0.45)
      && distalOutward > (wasRaised ? 0.08 : 0.12)
      && straightness > (wasRaised ? 0.75 : 0.85);
  }
  // Normalize against each finger's own length, so shorter fingers and tilted
  // hands do not need the same wrist-distance ratio as long fingers.
  const control=document.querySelector('#fingerSensitivity');
  const sensitivity=Math.min(1,Math.max(0,Number(control?.value || 65)/100));
  const base=tip-3;
  const length=distance(base,base+1)+distance(base+1,base+2)+distance(base+2,tip);
  if(length<.001)return false;
  const extension=distance(base,tip)/length;
  const outward=distance(tip,0)/Math.max(distance(tip-2,0),.001);
  const extensionThreshold=.95-.14*sensitivity-(wasRaised ? .05 : 0);
  const outwardThreshold=1.18-.15*sensitivity-(wasRaised ? .04 : 0);
  return extension>extensionThreshold && outward>outwardThreshold;

}
function releaseFinger(key) {
  if(triggerMode.value!=='once')releaseSoundGroup(fingerVoices.get(key),true);fingerVoices.delete(key);
}
function syncFingerChords(active) {
  for(const key of heldFingerKeys)if(!active.has(key)){heldFingerKeys.delete(key);releaseFinger(key);}
  if(audioContext?.state==='running')for(const [key,chord] of active){
    if(heldFingerKeys.has(key))continue;
    heldFingerKeys.add(key);const group=startSoundGroup(chord,triggerMode.value==='once');group.camera=true;fingerVoices.set(key,group);
  }
  document.querySelectorAll('[data-finger]').forEach(el=>el.classList.toggle('active',heldFingerKeys.has(el.dataset.finger)));
}
function drawHand(hand) {
  const w = canvas.width, h = canvas.height;
  const links = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
  ctx.strokeStyle = '#9ce8cb'; ctx.lineWidth = Math.max(3,w*.006); ctx.lineCap = 'round';
  links.forEach(([a,b]) => {ctx.beginPath();ctx.moveTo(hand[a].x*w,hand[a].y*h);ctx.lineTo(hand[b].x*w,hand[b].y*h);ctx.stroke();});
  hand.forEach((p,i)=>{ctx.beginPath();ctx.arc(p.x*w,p.y*h,i===8?Math.max(7,w*.014):Math.max(3,w*.007),0,Math.PI*2);ctx.fillStyle=i===8?'#fff':'#9ce8cb';ctx.fill();});
}
let lastCameraFrameAt=0,trackingLoopStarted=false;
function processFrame() {
  try {
  if (!landmarker || video.readyState < 2) { stopCameraSounds();requestAnimationFrame(processFrame); return; }
  if (video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;lastCameraFrameAt=performance.now();
    const result = landmarker.detectForVideo(video, performance.now());
    ctx.clearRect(0,0,canvas.width,canvas.height);
    const active = new Map();
    (result.landmarks || []).forEach((hand, index) => {
      // MediaPipe labels the unmirrored camera image; our preview is mirrored.
      const side = result.handedness?.[index]?.[0]?.categoryName === 'Right' ? 'Left' : 'Right';
      drawHand(hand);
      FINGER_TIPS.forEach((tip, finger) => {
        const key = side + '-' + finger;
        const chord = getFingerChord((side === 'Left' ? 0 : 5) + finger);
        if (fingerRaised(hand, finger, heldFingerKeys.has(key))) active.set(key, chord);
        const x = hand[tip].x * canvas.width, y = hand[tip].y * canvas.height;
        ctx.save(); ctx.translate(x,y); ctx.scale(-1,1);
        ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center';
        ctx.fillStyle = active.has(key) ? '#ffffff' : '#9ce8cb';
        ctx.fillText(chord.label,0,-14);
        ctx.restore();
      });
    });
    if(!result.landmarks?.length){
      stopCameraSounds();if(!manualGroup || manualGroup.closed){notePills.innerHTML='';chordName.textContent='Raise a finger';}
    }
    const stable = stableFingerChords(active,performance.now());
    syncFingerChords(stable);
    trackingBadge.classList.toggle('live', !!result.landmarks?.length);
    trackingBadge.innerHTML = result.landmarks?.length ? '<span></span> Raise fingers to play' : '<span></span> Waiting for hands';
    if (result.landmarks?.length) {
      chordName.textContent = stable.size ? 'Playing family chords' : 'Raise a finger';
      notePills.innerHTML = [...stable.values()].map(chord => '<span>' + chord.label + '</span>').join('');
    }
  }
  if(performance.now()-lastCameraFrameAt>500)stopCameraSounds();
  }catch(error){stopCameraSounds();cameraMessage.textContent='Tracking interrupted. Keep your hands visible or retry the camera.';console.error(error);}
  requestAnimationFrame(processFrame);
}
window.addEventListener('blur', () => { if(audioContext)stopAllSounds(); });
async function startCameraPreview(mediaStream) {
  // Some mobile browsers will not start playback while the video is display:none.
  video.muted=true;video.autoplay=true;video.playsInline=true;
  video.setAttribute('playsinline','');video.setAttribute('webkit-playsinline','');
  video.style.display='block';
  if(video.srcObject!==mediaStream)video.srcObject=mediaStream;
  let timeout;
  try {
    await Promise.race([video.play(),new Promise((_,reject)=>{
      timeout=setTimeout(()=>reject(new Error('Camera preview did not start. Close other camera apps and tap Try camera again.')),12000);
    })]);
  } finally {clearTimeout(timeout);}
  placeholder.style.display='none';
  canvas.width=video.videoWidth || 640;canvas.height=video.videoHeight || 480;
}
async function listCameraDevices(){
  const field=document.querySelector('#cameraDeviceField'),select=document.querySelector('#cameraDevice');
  if(!navigator.mediaDevices?.enumerateDevices)return;
  try{
    const devices=(await navigator.mediaDevices.enumerateDevices()).filter(device=>device.kind==='videoinput');
    const previous=select.value;select.replaceChildren();
    const option=document.createElement('option');option.value='';option.textContent='Browser default camera';select.append(option);
    devices.forEach((device,index)=>{const item=document.createElement('option');item.value=device.deviceId;item.textContent=device.label || 'Camera '+(index+1);select.append(item);});
    if(devices.some(device=>device.deviceId===previous))select.value=previous;
    field.hidden=!devices.length;
  }catch{field.hidden=true;}
}
function cameraVideoConstraints(){
  const selected=document.querySelector('#cameraDevice').value;
  return selected?{deviceId:{exact:selected}}:{facingMode:{ideal:'user'}};
}
async function enableCamera() {
  let previewReady=false;
  cameraButton.disabled=true;cameraButton.textContent='Starting camera...';
  cameraMessage.textContent = 'Allow camera access when your browser asks.';
  try {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('Open this page through localhost or HTTPS to enable your camera.');
    }
    ensureAudio().catch(reportAudioError);
    if(!stream?.getVideoTracks().some(track=>track.readyState==='live')){
      try{stream=await navigator.mediaDevices.getUserMedia({video:cameraVideoConstraints(),audio:false});}
      catch(error){if(error.name!=='OverconstrainedError' || document.querySelector('#cameraDevice').value)throw error;stream=await navigator.mediaDevices.getUserMedia({video:true,audio:false});}
      stream.getVideoTracks().forEach(track=>track.addEventListener('ended',()=>{
        stopCameraSounds();video.style.display='none';placeholder.style.display='';
        cameraButton.disabled=false;cameraButton.textContent='Restart camera';
        cameraMessage.textContent='Camera access ended. Tap Restart camera to reconnect.';
      },{once:true}));
    }
    cameraMessage.textContent='Camera allowed. Starting preview...';
    await startCameraPreview(stream);previewReady=true;
    document.querySelector('#cameraDeviceField').hidden=true;
    cameraMessage.textContent='Camera is on. Loading hand tracking...';
    cameraButton.textContent = 'Camera enabled';
    const { FilesetResolver, HandLandmarker } = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14');
    const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm');
    const options={baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',delegate:'GPU'},runningMode:'VIDEO',numHands:2};
    try{landmarker=await HandLandmarker.createFromOptions(vision,options);}catch{options.baseOptions.delegate='CPU';landmarker=await HandLandmarker.createFromOptions(vision,options);}
    lastVideoTime=-1;
    if(!trackingLoopStarted){trackingLoopStarted=true;processFrame();}
    cameraMessage.textContent='Camera is on. Raise fingers steadily to play.';
  } catch (error) {
    console.error(error);
    if (previewReady) {
      cameraMessage.textContent = 'Camera is on, but tracking could not load. Check your connection and retry.';
      cameraButton.disabled=false;cameraButton.textContent='Retry hand tracking';
      return;
    }
    if (stream) stream.getTracks().forEach(track=>track.stop());
    stream = null;
    video.srcObject = null;
    video.style.display = 'none';
    placeholder.style.display = '';
    cameraButton.disabled = false; cameraButton.textContent = 'Try camera again';
    cameraMessage.textContent = error.name === 'NotAllowedError' ? 'Camera permission was blocked. Allow camera access in your browser settings and try again.' : error.name === 'NotFoundError' ? 'No camera was found. Connect a camera and try again.' : error.name === 'NotReadableError' ? 'Camera is busy or unavailable. Close other camera tabs/apps, check the webcam privacy switch, or choose another camera below and retry.' : error.name === 'OverconstrainedError' ? 'The selected camera is unavailable. Choose another camera below.' : error.name === 'AbortError' ? 'Camera startup was interrupted. Tap Try camera again.' : error.message || 'Could not start the camera. Try again.';
    await listCameraDevices();
  }
}
cameraButton.addEventListener('click', enableCamera);
familyKey.addEventListener('change', updateFamily);
familyMode.addEventListener('change', updateFamily);
testFinger.addEventListener('change',()=>updateChord());
document.querySelector('#playButton').addEventListener('click', async () => {
  try {
    if(triggerMode.value==='hold' && manualGroup && !manualGroup.closed){stopChord();return;}
    await playChord();
  } catch (error) {
    reportAudioError(error);
  }
});
setAudioStatus('Click Play to enable audio');
updateFamily();


const recordButton = document.querySelector('#recordButton');
const stopRecordButton = document.querySelector('#stopRecordButton');
const pauseRecordButton = document.querySelector('#pauseRecordButton');
const countdownSelect = document.querySelector('#countdownSelect');
const countdownOverlay = document.querySelector('#countdownOverlay');
const recordingClock = document.querySelector('#recordingClock');
let cancelCountdown, recordedElapsed = 0, segmentStarted = null;
function recordingMilliseconds(){return recordedElapsed+(segmentStarted===null?0:Date.now()-segmentStarted);}
function updateRecordingClock(){
  const seconds=Math.floor(recordingMilliseconds()/1000);
  recordingClock.textContent=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
}
function freezeRecordingClock(){
  recordedElapsed=recordingMilliseconds();segmentStarted=null;updateRecordingClock();
}
function runCountdown(seconds){
  if(!seconds)return Promise.resolve(true);
  return new Promise(resolve=>{
    let remaining=seconds, timer;
    const finish=ready=>{clearTimeout(timer);cancelCountdown=null;countdownOverlay.hidden=true;resolve(ready);};
    cancelCountdown=()=>finish(false);
    const tick=()=>{
      countdownOverlay.hidden=false;countdownOverlay.textContent=String(remaining);
      recordingStatus.textContent='Recording starts in '+remaining+'...';
      timer=setTimeout(()=>{remaining--;if(remaining>0)tick();else finish(true);},1000);
    };
    tick();
  });
}
const recordingStatus = document.querySelector('#recordingStatus');
const recordingPlayer = document.querySelector('#recordingPlayer');
const recordingPreview = document.querySelector('#recordingPreview');
const saveRecording = document.querySelector('#saveRecording');
const recordingMode = document.querySelector('#recordingMode');
const previewRecording = document.querySelector('#previewRecording');
const playbackDialog = document.querySelector('#playbackDialog');
previewRecording.addEventListener('click', () => openAppDialog(playbackDialog));
playbackDialog.addEventListener('close', () => recordingPlayer.pause());
let recorder, recordingTimer, recordingUrl, captureStream, captureSource;
const recordingHints = {
  system: 'Choose a tab or screen and enable Share audio in the browser prompt. Audio availability depends on your browser and the selected source.',
  mic: 'Record your microphone together with the chords. Headphones help keep your voice clear.',
  camera: 'Record camera video, microphone and chords together. Allow camera and microphone access.'
};
function releaseCapture() {
  if (captureSource) captureSource.disconnect();
  captureSource = null;
  if(systemMeterNode)systemMeterNode.disconnect();if(systemMeterMute)systemMeterMute.disconnect();
  systemMeterNode=null;systemMeterMute=null;
  if (captureStream) captureStream.getTracks().forEach(track => track.stop());
  captureStream = null;
  recordingPreview.srcObject = null;
  recordingPreview.hidden = true;
}
function resetRecordControls() {
  clearInterval(recordingTimer);
  recordButton.disabled = false;
  recordingMode.disabled = false;
  countdownSelect.disabled=false;pauseRecordButton.disabled=true;pauseRecordButton.textContent='Pause';
  countdownOverlay.hidden=true;
  stopRecordButton.disabled = true;
  recordButton.textContent = 'Record';
}
function stopRecording() {
  if(cancelCountdown){cancelCountdown();releaseCapture();resetRecordControls();recordingStatus.textContent='Countdown cancelled.';return;}
  if (!recorder || recorder.state === 'inactive') return;
  clearInterval(recordingTimer);
  freezeRecordingClock();pauseRecordButton.disabled=true;
  stopRecordButton.disabled = true;
  recordingStatus.textContent = 'Finishing recording...';
  recorder.stop();
  releaseCapture();
}
async function startRecording() {
  if (recordButton.disabled || (recorder && recorder.state !== 'inactive')) return;
  recordButton.disabled = true;
  recordingMode.disabled = true;
  countdownSelect.disabled=true;
  const mode = recordingMode.value;
  const withVideo = mode === 'camera';
  recordingPlayer.pause();
  closeAppDialog(playbackDialog);
  recordingStatus.textContent = 'Preparing recording...';
  try {
    if (!window.MediaRecorder) throw new Error('Recording is unavailable in this browser. Try Chrome or Edge.');
    if (mode === 'system') {
      if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('System audio sharing is unavailable. Try Chrome or Edge on a desktop, or choose Microphone.');
      // Request sharing directly from the click so browser user activation is preserved.
      captureStream = await navigator.mediaDevices.getDisplayMedia({video:true,audio:true});
      if (!captureStream.getAudioTracks().length) throw new Error('No system audio was shared. Try again, select a browser tab and enable Share audio.');
    } else {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Open through localhost or HTTPS to use the microphone and camera.');
      const existingVideo = withVideo && stream?.getVideoTracks().find(track => track.readyState === 'live');
      captureStream = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:withVideo && !existingVideo ? {facingMode:'user'} : false});
      if (existingVideo) captureStream.addTrack(existingVideo.clone());
    }
    await ensureAudio();
    let output;
    if (mode === 'system') {
      // Shared audio already includes anything playing in the selected source.
      output = new MediaStream(captureStream.getAudioTracks());
      captureSource=audioContext.createMediaStreamSource(captureStream);
      systemMeterNode=audioContext.createAnalyser();systemMeterNode.fftSize=256;
      systemMeterMute=audioContext.createGain();systemMeterMute.gain.value=0;
      captureSource.connect(systemMeterNode);systemMeterNode.connect(systemMeterMute);systemMeterMute.connect(audioContext.destination);
    } else {
      captureSource = audioContext.createMediaStreamSource(captureStream);
      captureSource.connect(microphoneBus);
      output = new MediaStream([...recordingDestination.stream.getAudioTracks(), ...(withVideo ? captureStream.getVideoTracks() : [])]);
    }
    if (withVideo) {
      recordingPreview.srcObject = captureStream;
      recordingPreview.hidden = false;
      await recordingPreview.play();
    }
    const types = withVideo ? ['video/webm;codecs=vp8,opus','video/webm','video/mp4'] : ['audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/mp4'];
    const mimeType = types.find(type => MediaRecorder.isTypeSupported(type));
    const take = new MediaRecorder(output, mimeType ? {mimeType} : {});
    const chunks = [];
    let failed = false;
    take.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    take.onerror = event => {
      if(recorder!==take)return;
      failed = true;
      releaseCapture();
      recordingStatus.textContent = 'Recording failed: ' + (event.error?.message || 'Please try again.');
      freezeRecordingClock();
      if (take.state !== 'inactive') take.stop();
      else resetRecordControls();
    };
    take.onstop = () => {
      if(recorder!==take)return;
      freezeRecordingClock();
      releaseCapture();
      resetRecordControls();
      if (failed) return;
      if (!chunks.length) { recordingStatus.textContent = 'No recording was captured. Try again.'; return; }
      const type = take.mimeType || chunks[0].type || (withVideo ? 'video/webm' : 'audio/webm');
      const blob = new Blob(chunks, {type});
      if (recordingUrl) URL.revokeObjectURL(recordingUrl);
      recordingUrl = URL.createObjectURL(blob);
      recordingPlayer.src = recordingUrl;
      recordingPlayer.hidden = false;
      recordingPlayer.classList.toggle('audio-only', !withVideo);
      saveRecording.href = recordingUrl;
      const extension = type.includes('mp4') ? (withVideo ? 'mp4' : 'm4a') : type.includes('ogg') ? 'ogg' : 'webm';
      const timestamp = new Date().toISOString().replace(/[:.]/g,'-');
      saveRecording.download = 'gesture-chords-' + mode + '-' + timestamp + '.' + extension;
      saveRecording.hidden = false;
      previewRecording.hidden = false;
      recordingStatus.textContent = 'Recording ready. Play it below or save it to your device.';
    };
    recorder = take;
    recordedElapsed=0;segmentStarted=null;updateRecordingClock();
    captureStream.getTracks().forEach(track => track.addEventListener('ended', stopRecording, {once:true}));
    stopRecordButton.disabled=false;
    if(!await runCountdown(Number(countdownSelect.value)))return;
    if(captureStream.getTracks().some(track=>track.readyState==='ended'))throw new Error('Capture ended before recording started. Try again.');
    take.onpause=()=>{freezeRecordingClock();pauseRecordButton.textContent='Resume';pauseRecordButton.disabled=false;recordButton.textContent='Paused';recordingStatus.textContent='Paused. Resume to continue this recording.';};
    take.onresume=()=>{segmentStarted=Date.now();pauseRecordButton.textContent='Pause';pauseRecordButton.disabled=false;recordButton.textContent='Recording...';recordingStatus.textContent='Recording resumed.';};
    take.start(1000);
    segmentStarted=Date.now();pauseRecordButton.disabled=false;
    recordButton.textContent='Recording...';
    recordingStatus.textContent='Recording. Pause or stop when ready.';
    recordingTimer=setInterval(updateRecordingClock,250);
  } catch (error) {
    releaseCapture();
    resetRecordControls();
    const messages = {NotAllowedError:'Access was denied or sharing was cancelled. Allow access and try again.',NotFoundError:'The selected camera or microphone was not found. Connect the device or choose another option.',NotReadableError:'Could not open the selected device. Close other apps using it and try again.'};
    recordingStatus.textContent = messages[error.name] || error.message || 'Could not start recording. Try again.';
  }
}
recordButton.addEventListener('click', startRecording);
stopRecordButton.addEventListener('click', stopRecording);
pauseRecordButton.addEventListener('click',()=>{
  if(!recorder || !['recording','paused'].includes(recorder.state))return;
  pauseRecordButton.disabled=true;
  try{if(recorder.state==='recording')recorder.pause();else recorder.resume();}
  catch(error){pauseRecordButton.disabled=false;recordingStatus.textContent=error.message || 'Could not pause or resume.';}
});
recordingMode.addEventListener('change', () => { recordingStatus.textContent = recordingHints[recordingMode.value]; });
recordingStatus.textContent = recordingHints[recordingMode.value];
window.addEventListener('beforeunload', () => { releaseCapture(); if (recordingUrl) URL.revokeObjectURL(recordingUrl); });

[instrumentSelect,playStyle,triggerMode].forEach(control=>control.addEventListener('change',()=>{if(audioContext)stopAllSounds();}));
document.querySelector('#silenceButton').addEventListener('click',()=>{if(audioContext)stopAllSounds();});
function bindVolume(control,outputId,bus) {
  control.addEventListener('input',()=>{
    document.querySelector('#'+outputId).textContent=control.value+'%';
    const node=bus();if(node)node.gain.setTargetAtTime(Number(control.value)/100,audioContext.currentTime,.02);
  });
}
bindVolume(instrumentVolume,'instrumentVolumeValue',()=>instrumentBus);
bindVolume(microphoneVolume,'microphoneVolumeValue',()=>microphoneBus);
const meterBuffers=new WeakMap();
function readLevel(node){
  if(!node || audioContext?.state!=='running')return 0;
  let buffer=meterBuffers.get(node);if(!buffer){buffer=new Float32Array(node.fftSize);meterBuffers.set(node,buffer);}
  if(typeof node.getFloatTimeDomainData!=='function')return 0;
  node.getFloatTimeDomainData(buffer);let peak=0;for(const sample of buffer)peak=Math.max(peak,Math.abs(sample));return peak;
}
function paintMeters(){
  const levels=[['instrumentMeter',instrumentMeterNode],['microphoneMeter',microphoneMeterNode],['recordingMeter',recorder?.state==='recording'?(systemMeterNode || mixMeterNode):null]];
  levels.forEach(([id,node])=>{const peak=readLevel(node),meter=document.querySelector('#'+id);meter.value=Math.min(1,peak);meter.title=peak>=.98?'Clipping: lower the volume':Math.round(peak*100)+'% peak';});
  requestAnimationFrame(paintMeters);
}
paintMeters();


function updateSoundSummary(){document.querySelector('#soundSummary').textContent=instrumentSelect.options[instrumentSelect.selectedIndex].text+' / '+playStyle.options[playStyle.selectedIndex].text;}
[instrumentSelect,playStyle].forEach(control=>control.addEventListener('change',updateSoundSummary));
updateSoundSummary();

// Decorative effects follow actual chord triggers, never camera frames.
function conjureChord(label) {
  const stage=document.querySelector('#magicStage');
  const enabled=document.querySelector('#magicEffects');
  if(!enabled?.checked || !stage || typeof stage.append!=='function')return;
  while(stage.children.length>=16)stage.firstElementChild.remove();
  const spell=document.createElement('div');spell.className='chord-spell';
  // Keep decorative chords at the camera edges, away from the performer.
  spell.style.setProperty('--x',((Math.random()<.5?5:85)+Math.random()*10)+'%');
  spell.style.setProperty('--y',(35+Math.random()*35)+'%');
  spell.style.setProperty('--drift',(-12+Math.random()*24)+'px');
  spell.style.setProperty('--hue',String(260+Math.random()*65));
  const name=document.createElement('b');name.textContent=label;
  spell.append(name);
  stage.append(spell);
  spell.addEventListener('animationend',event=>{if(event.target===spell)spell.remove();});
  setTimeout(()=>spell.remove(),3200);
}
document.querySelector('#magicEffects').addEventListener('change',event=>{if(!event.target.checked)document.querySelector('#magicStage').replaceChildren();});

const fingerSensitivity=document.querySelector('#fingerSensitivity');
fingerSensitivity.addEventListener('input',()=>{
  document.querySelector('#fingerSensitivityValue').textContent=fingerSensitivity.value+'%';
  fingerCandidates.clear();
});
