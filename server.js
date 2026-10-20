'use strict';
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = __dirname;
const cache = new Map();
const files = new Set(['index.html','style.css','app.js','songs.js']);
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'};
async function upstream(url) {
  const previous = cache.get(url);
  if (previous && Date.now()-previous.time<60000) return previous.data;
  const headers = previous?.etag ? {'If-None-Match':previous.etag} : {};
  const response = await fetch(url,{headers,signal:AbortSignal.timeout(15000),redirect:'error'});
  if(response.status===304 && previous){previous.time=Date.now();return previous.data;}
  if(!response.ok) throw new Error('Song provider returned '+response.status+'. Try again later.');
  const data = await response.json();
  if(cache.size>=100)cache.delete(cache.keys().next().value);
  cache.set(url,{data,etag:response.headers.get('etag'),time:Date.now()});return data;
}
const server = http.createServer(async(req,res)=>{
  const reply=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  try {
    if(req.method!=='GET'){reply(405,{error:'GET only'});return;}
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/api/song-search'){
      const query=(url.searchParams.get('q')||'').trim().slice(0,160);
      if(query.length<2){reply(400,{error:'Enter at least two characters.'});return;}
      reply(200,await upstream('https://www.startjamming.com/api/songs/search?for=agent&limit=12&q='+encodeURIComponent(query)));return;
    }
    if(url.pathname==='/api/song'){
      const target=new URL(url.searchParams.get('url')||'https://invalid.invalid');
      if(target.origin!=='https://www.startjamming.com' || !/^\/api\/songs\/[a-z0-9-]+\/full$/.test(target.pathname)){reply(400,{error:'Invalid song URL.'});return;}
      // Never forward arbitrary hosts, paths or caller-supplied query parameters.
      reply(200,await upstream(target.origin+target.pathname+'?for=agent'));return;
    }
    const filename=url.pathname==='/'?'index.html':url.pathname.slice(1);
    if(!files.has(filename)){reply(404,{error:'Not found'});return;}
    res.writeHead(200,{'Content-Type':types[path.extname(filename)],'Cache-Control':'no-cache'});res.end(await fs.readFile(path.join(root,filename)));
  } catch(error){reply(502,{error:error.name==='TimeoutError'?'Song service timed out. Try again.':error.message || 'Song service unavailable.'});}
});
server.listen(Number(process.env.PORT)||3000,'127.0.0.1',()=>console.log('Gesture Chords: http://localhost:'+server.address().port));
