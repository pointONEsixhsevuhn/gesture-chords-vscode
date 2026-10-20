(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  let selected = null, page = 0;
  const pageSize = 4;
  const dialog = byId('songDialog');
  let onlineSearchController, onlineSearchVersion=0;
  async function apiJson(url, signal) {
    let response;
    try{response=await fetch(url,{signal});}catch(error){if(error.name==='AbortError')throw error;throw new Error('Online songs need the local server. Run start.bat and open http://localhost:3000.');}
    const text=await response.text();
    let data;try{data=JSON.parse(text);}catch{throw new Error('Online songs need the local server. Run start.bat and open http://localhost:3000.');}
    if(!response.ok)throw new Error(data.error || 'Song search is unavailable.');
    return data;
  }
  function convertOnlineSong(data, fallback) {
    const keyText=String(data.arrangement?.target_key || (Array.isArray(data.key)?data.key[0]:data.key) || 'C');
    const keyMatch=keyText.match(/^([A-G](?:#|b)?)(m)?$/);
    const roots={C:0,'C#':1,Db:1,D:2,'D#':3,Eb:3,E:4,F:5,'F#':6,Gb:6,G:7,'G#':8,Ab:8,A:9,'A#':10,Bb:10,B:11};
    const sections=Array.isArray(data.arrangement?.sections)?data.arrangement.sections:[];
    const chart=sections.map(section=>section.name+' (x'+(section.repeats || 1)+')\n'+(section.measures || []).map(m=>m.display || m.source || '').join(' | ')).join('\n\n');
    const lyrics=(Array.isArray(data.lyrics)?data.lyrics.join('\n\n'):String(data.lyrics || '')).replace(/<chorus>/gi,'Chorus\n').replace(/<\/chorus>/gi,'');
    const sheet=(chart?'CHORD CHART\n'+chart+'\n\n':'')+(lyrics?'LYRICS\n'+lyrics:'Instrumental (no lyrics supplied).');
    if(!chart)throw new Error('This result has no normalized chord chart. Choose another song.');
    if(sheet.length>50000)throw new Error('This sheet is too large to display.');
    return {id:'startjamming-'+String(data.id || fallback.id),title:String(data.title || fallback.title),artist:String(data.artist || 'Start Jamming'),key:String(roots[keyMatch?.[1]] ?? 0),mode:keyMatch?.[2]?'minor':'major',sheet,sourceUrl:data.url || fallback.url,apiUrl:fallback.api_url,updatedAt:new Date().toISOString()};
  }
  async function selectOnlineSong(result,button) {
    button.disabled=true;byId('songOnlineStatus').textContent='Loading lyrics and chords...';
    try{
      const data=await apiJson('/api/song?url='+encodeURIComponent(result.api_url));
      const song=convertOnlineSong(data,result);openSong(song);
      byId('songOnlineStatus').textContent='Song opened.';
    }catch(error){byId('songOnlineStatus').textContent=error.message;}finally{button.disabled=false;}
  }
  async function searchOnline() {
    const query=byId('songSearch').value.trim();
    onlineSearchController?.abort();const version=++onlineSearchVersion;
    const controller=new AbortController();onlineSearchController=controller;
    byId('songOnlineResults').replaceChildren();
    if(query.length<2){byId('songOnlineStatus').textContent='Enter at least two characters.';return;}
    byId('songOnlineStatus').textContent='Searching Start Jamming...';
    try{
      const data=await apiJson('/api/song-search?q='+encodeURIComponent(query),controller.signal);
      if(version!==onlineSearchVersion)return;
      const matches=Array.isArray(data.results)?data.results:data.api_url?[data]:[];
      matches.filter(item=>typeof item.title==='string' && typeof item.api_url==='string').forEach(result=>{
        const button=document.createElement('button');button.type='button';button.className='song-result';
        const title=document.createElement('b');title.textContent=result.title;
        const info=document.createElement('small');info.textContent='Start Jamming / '+(result.key || 'Song')+(result.type==='fiddle'?' / Instrumental':'');
        button.append(title,info);button.addEventListener('click',()=>selectOnlineSong(result,button));byId('songOnlineResults').append(button);
      });
      byId('songOnlineStatus').textContent=matches.length?'Choose a song to view lyrics and chords.':'No matches. Try another title.';
    }catch(error){if(version===onlineSearchVersion && error.name!=='AbortError')byId('songOnlineStatus').textContent=error.message;}
  }
  byId('searchOnline').addEventListener('click',searchOnline);
  byId('songSearch').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();searchOnline();}});
  let onlineTimer;
  byId('songSearch').addEventListener('input',()=>{clearTimeout(onlineTimer);onlineSearchController?.abort();onlineSearchVersion++;onlineTimer=setTimeout(searchOnline,600);});
  dialog.addEventListener('close',()=>{clearTimeout(onlineTimer);onlineSearchController?.abort();onlineSearchVersion++;});
  function renderSheet() {
    const lines = selected.sheet.replace(/\r/g,'').split('\n');
    const pages = Math.max(1,Math.ceil(lines.length/pageSize)); page = Math.max(0,Math.min(page,pages-1));
    const sheet = byId('songSheet'); sheet.replaceChildren();
    lines.slice(page*pageSize,(page+1)*pageSize).forEach(line => {
      const row = document.createElement('div'); row.className='lyric-line';
      // Build text nodes so pasted HTML can never execute.
      const chunks = line.split(/(\[[^\]\n]{1,24}\])/g);
      chunks.forEach(chunk => {
        if (/^\[[^\]]+\]$/.test(chunk)) { const chord=document.createElement('b'); chord.className='lyric-chord'; chord.textContent=chunk.slice(1,-1); row.append(chord); }
        else row.append(document.createTextNode(chunk));
      });
      if (/^\s*(?:[A-G](?:#|b)?(?:m|maj|min|dim|aug|sus|add)?[0-9]*(?:\/[A-G](?:#|b)?)?\s*)+$/.test(line) && line.trim()) row.classList.add('chord-row');
      sheet.append(row);
    });
    byId('songPage').textContent=(page+1)+' / '+pages;
    byId('songPrevious').disabled=page===0; byId('songNext').disabled=page===pages-1;
  }
  function openSong(song) {
    selected=song;page=0;
    byId('songTitle').textContent=song.title;byId('songArtist').textContent=song.artist || 'Your chord sheet';
    const source=byId('songSource');
    source.hidden=true;
    try{const url=new URL(song.sourceUrl);if(url.origin==='https://www.startjamming.com'){source.href=url.href;source.hidden=false;}}catch{}
    byId('familyKey').value=song.key;byId('familyMode').value=song.mode;
    byId('familyKey').dispatchEvent(new Event('change'));
    renderSheet();dialog.close();
  }
  byId('chooseSong').addEventListener('click',()=>{dialog.showModal();byId('songSearch').focus();});
  byId('songPrevious').addEventListener('click',()=>{page--;renderSheet();});
  byId('songNext').addEventListener('click',()=>{page++;renderSheet();});
})();
