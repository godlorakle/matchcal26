// Cloudflare Pages Function — privacy-first event counter for calendar-adds.
// POST {e:"add_single"} increments that counter; GET returns all counters as JSON.
// Requires a KV namespace bound as STATS in the Pages project (Settings → Functions →
// KV namespace bindings). Until that binding exists it no-ops so the site never breaks.
export async function onRequest(context){
  const {request, env} = context;
  const cors = {
    'Access-Control-Allow-Origin':'*',
    'Access-Control-Allow-Methods':'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers':'Content-Type',
  };
  const json = (o,status=200)=>new Response(JSON.stringify(o,null,2),{status,headers:{...cors,'content-type':'application/json'}});
  if(request.method==='OPTIONS')return new Response(null,{headers:cors});
  if(!env.STATS)return json({error:'KV namespace STATS not bound yet'});

  if(request.method==='POST'){
    let evt='unknown';
    try{const b=await request.json();evt=String(b.e||'unknown').slice(0,40).replace(/[^a-z0-9_]/gi,'');}catch{}
    const key='evt:'+evt;
    const n=parseInt(await env.STATS.get(key)||'0',10)+1;
    await env.STATS.put(key,String(n));
    return json({ok:true,e:evt,n});
  }
  // GET → all counters + total
  const list=await env.STATS.list({prefix:'evt:'});
  const out={}; let total=0;
  for(const k of list.keys){const v=parseInt(await env.STATS.get(k.name)||'0',10);out[k.name.slice(4)]=v;total+=v;}
  return json({total,events:out});
}
