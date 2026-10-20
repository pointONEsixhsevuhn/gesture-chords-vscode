const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const elements = new Map(), oscillators = [], intervals = new Map();
let timerId = 0;
const defaults = {familyKey:'0',familyMode:'major',testFinger:'0',instrumentSelect:'piano',playStyle:'chord',triggerMode:'hold',instrumentVolume:'80',microphoneVolume:'80',recordingMode:'mic',countdownSelect:'0'};
function element(id) {
  if (!elements.has(id)) elements.set(id, {value:defaults[id] || '', checked:false, disabled:false, selectedIndex:0, options:[{text:defaults[id] || ''}], classList:{toggle(){},remove(){}}, getContext:()=>({}), addEventListener(name,handler){this[name]=handler;}, replaceChildren(){}, setAttribute(name,value){this[name]=value;}, pause(){}, close(){}, showModal(){}});
  return elements.get(id);
}
function param() {return {value:0,events:[],setValueAtTime(v,t){this.events.push(['set',v,t]);this.value=v;},exponentialRampToValueAtTime(v,t){this.events.push(['ramp',v,t]);},cancelScheduledValues(){},cancelAndHoldAtTime(){},setTargetAtTime(v){this.value=v;}};}
function node() {return {connections:[],gain:param(),connect(target){this.connections.push(target);},disconnect(){this.disconnected=true;}};}
class AudioContextMock {
  constructor(){this.sampleRate=48000;this.state='running';this.currentTime=0;this.destination=node();}
  createGain(){return node();}
  createAnalyser(){return {...node(),fftSize:256,getFloatTimeDomainData(data){data.fill(.25);}};}
  createMediaStreamDestination(){return {...node(),stream:{getAudioTracks:()=>[{kind:'audio'}]}};}
  createMediaStreamSource(){return node();}
  createBuffer(channels,length,sampleRate){const data=new Float32Array(length);return{length,duration:length/sampleRate,getChannelData:()=>data};}
  createBufferSource(){const source={...node(),playbackRate:param(),start(time){this.started=time;},stop(time){this.stopped=time;}};oscillators.push(source);return source;}
  createPeriodicWave(real,imag){return Array.from(imag);}
  createOscillator(){const osc={...node(),frequency:param(),setPeriodicWave(wave){this.wave=wave;},start(time){this.started=time;},stop(time){this.stopped=time;}};oscillators.push(osc);return osc;}
}
class RecorderMock {
  static isTypeSupported(){return true;}
  constructor(){this.state='inactive';this.mimeType='audio/webm';}
  start(){this.state='recording';}
  pause(){this.state='paused';this.onpause();}
  resume(){this.state='recording';this.onresume();}
  stop(){this.state='inactive';this.ondataavailable({data:new Blob(['test'])});this.onstop();}
}
const micTrack={stop(){this.stopped=true;},addEventListener(){}};
let fakeNow=10000;
class FakeDate extends Date {static now(){return fakeNow;}}
const sandbox={console,Float32Array,Blob,Date:FakeDate,MediaRecorder:RecorderMock,MediaStream:class{constructor(tracks){this.tracks=tracks;}},URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},navigator:{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[micTrack],getAudioTracks:()=>[micTrack]})}},window:{AudioContext:AudioContextMock,MediaRecorder:RecorderMock,addEventListener(){}},requestAnimationFrame(){},setTimeout:()=>++timerId,clearTimeout(){},setInterval(fn){const id=++timerId;intervals.set(id,fn);return id;},clearInterval(id){intervals.delete(id);},document:{querySelector:s=>element(s.slice(1)),querySelectorAll:()=>[],createElement:()=>({}),createTextNode:()=>({})}};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8'),sandbox);
const run = code => vm.runInContext(code,sandbox);
(async()=>{
  await run('ensureAudio()');
  assert.equal(run('instrumentBus.gain.value'),.8);
  assert(run('instrumentMeterNode.connections.includes(audioContext.destination)'));
  assert(!run('microphoneMeterNode.connections.includes(audioContext.destination)'));
  const waves=[];
  for(const preset of ['piano','guitar','organ','synth']){
    element('instrumentSelect').value=preset;
    await run('playChord()');
    const voice=oscillators.at(-1);
    if(preset==='guitar'){assert(voice.buffer);assert(voice.loop);assert(voice.loopEnd>voice.loopStart);assert(voice.buffer.getChannelData(0).every(Number.isFinite));waves.push('plucked-string');}
    else {assert.equal(voice.frequency.value,261.63*Math.pow(2,7/12));waves.push(JSON.stringify(voice.wave));}
  }
  assert.equal(new Set(waves).size,4);
  run('stopAllSounds()');element('instrumentSelect').value='piano';element('playStyle').value='chord';
  await run('playChord()');assert.equal(oscillators.at(-1).stopped,undefined,'held piano must not auto-stop');
  run('stopAllSounds()');
  assert.equal(run('stableFingerChords(new Map([["Left-0",getFingerChord(0)]]),0).size'),0);
  assert.equal(run('stableFingerChords(new Map([["Left-0",getFingerChord(0)]]),179).size'),0);
  assert.equal(run('stableFingerChords(new Map([["Left-0",getFingerChord(0)]]),180).size'),1);
  run('stableFingerChords(new Map(),181)');assert.equal(run('fingerCandidates.size'),0);
  assert.equal(run('stableFingerChords(new Map([["Left-0",getFingerChord(0)]]),190).size'),0,'brief reappearance must not trigger');
  await run('playChord()');run('stopCameraSounds()');assert(!run('manualGroup.closed'),'hand loss must preserve manual test chord');
  assert.equal(element('playButton')['aria-pressed'],'true');
  run('stopAllSounds()');assert.equal(element('playButton')['aria-pressed'],'false');element('playStyle').value='strum';await run('playChord()');
  const notes=oscillators.slice(-3);assert(Math.abs(notes[1].started-notes[0].started-.055)<1e-8);
  run('stopAllSounds()');element('playStyle').value='arpeggio';element('triggerMode').value='hold';
  run('syncFingerChords(new Map([["Left-0",getFingerChord(0)]]))');
  assert.equal(intervals.size,1);const count=oscillators.length;[...intervals.values()][0]();assert.equal(oscillators.length,count+1);
  run('syncFingerChords(new Map())');assert.equal(intervals.size,0);
  element('playStyle').value='chord';element('triggerMode').value='once';
  run('syncFingerChords(new Map([["Left-0",getFingerChord(0)]]))');const onceCount=oscillators.length;
  run('syncFingerChords(new Map([["Left-0",getFingerChord(0)]]))');assert.equal(oscillators.length,onceCount);
  run('syncFingerChords(new Map());syncFingerChords(new Map([["Left-0",getFingerChord(0)]]))');assert.equal(oscillators.length,onceCount+3);
  run('stopAllSounds()');element('triggerMode').value='hold';
  run('syncFingerChords(new Map([["Left-0",getFingerChord(0)]]));syncFingerChords(new Map())');assert.equal(oscillators.at(-1).stopped,.09);
  element('instrumentVolume').value='0';element('instrumentVolume').input();assert.equal(run('instrumentBus.gain.value'),0);
  await run('startRecording()');assert(run('captureSource.connections.includes(microphoneBus)'));
  element('microphoneVolume').value='125';element('microphoneVolume').input();assert.equal(run('microphoneBus.gain.value'),1.25);
  fakeNow+=2500;element('pauseRecordButton').click();assert.equal(run('recorder.state'),'paused');assert.equal(element('recordingClock').textContent,'00:02');
  fakeNow+=9000;run('updateRecordingClock()');assert.equal(element('recordingClock').textContent,'00:02');
  element('pauseRecordButton').click();assert.equal(run('recorder.state'),'recording');fakeNow+=1500;
  run('stopRecording()');assert.equal(element('recordingClock').textContent,'00:04');assert(micTrack.stopped);assert(!element('saveRecording').hidden);
  run('stopAllSounds()');assert.equal(run('soundGroups.size'),0);assert.equal(intervals.size,0);
  const countdown=run('runCountdown(3)');assert.equal(element('countdownOverlay').textContent,'3');run('stopRecording()');assert.equal(await countdown,false);assert(element('countdownOverlay').hidden);
  console.log('Passed: 4 timbres, strum timing, arpeggio cleanup, hold/once triggering, continuous hold, release, stable-trigger filtering, mixer routing/volumes, mic recording, pause/resume timing, and countdown cancellation.');
})().catch(error=>{console.error(error);process.exitCode=1;});
