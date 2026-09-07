import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
const base=process.argv[2]||'http://localhost:3013';
const local=new URL(base).hostname==='localhost';
if(!local && base!=='https://retry-trace.carbaj0.chatgpt.site')throw Error('Unrecognized origin');
const op=readFileSync('.env','utf8').match(/^OPERATOR_TOKEN=(.+)$/m)?.[1];
assert(op);
const headers={'Content-Type':'application/json',...(local?{}:{'x-retry-trace-operator':op})};
const checks=[];
const record=name=>{checks.push(name);console.log('PASS',name);};
async function req(path,data,status=200){const response=await fetch(new URL(path,base),{method:data?'POST':'GET',headers,body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(12000)});const value=await response.json();assert.equal(response.status,status,JSON.stringify({status:response.status,error:value.error}));return value;}
const client=new Client({name:'retry-records-operator-qa',version:'1.0.0'});
let outcome='failed',error=null;
try{
  await client.connect(new StreamableHTTPClientTransport(new URL('/api/mcp',base),{requestInit:{headers,signal:AbortSignal.timeout(12000)}}));
  const listing=await client.listTools();assert.equal(listing.tools.length,6);record('MCP exposes six tools');
  async function tool(name,args={}){const result=await client.callTool({name,arguments:args});assert(!result.isError,JSON.stringify(result));return JSON.parse(result.content[0].text);}
  const before=await req('/api/stats');
  const run=await tool('create_retry_run',{status:503,failures:1,delay_seconds:0,discovery:'owner-directed',human_directed:true});
  await req(new URL(run.probe_url).pathname,undefined,503);await req(new URL(run.probe_url).pathname);
  const trace=await tool('read_retry_trace',{run_id:run.run_id});assert.deepEqual(trace.attempts.map(a=>a.status),[503,200]);record('Actual HTTP attempts and trace');
  const payload={participant_token:run.participant_token,run_id:run.run_id,public:true,title:'Operator validation: reusable synthetic record',summary:'Directed functional test of record persistence and reuse. This is not independent participation.',idempotency_key:crypto.randomUUID()};
  const saved=await tool('publish_retry_finding',payload);
  const replay=await req('/api/findings',payload);assert.equal(saved.finding_id,replay.finding_id);assert.equal(saved.url,replay.url);record('Publication and idempotent receipt');
  if(local){
    const fetched=await tool('read_retry_finding',{finding_id:saved.finding_id});assert.equal(fetched.finding.evidence.attempts.length,2);
    assert(!JSON.stringify(fetched).includes(run.participant_token));assert(!JSON.stringify(fetched).includes(run.run_id));
    assert.equal((await req('/api/findings/'+saved.finding_id)).finding.id,saved.finding_id);record('Record URLs and MCP return public-only frozen evidence');
    const next=await req('/api/runs',fetched.finding.reproduce,201);await req(new URL(next.probe_url).pathname,undefined,503);
    const reply=await tool('publish_retry_finding',{...payload,participant_token:next.participant_token,run_id:next.run_id,parent_id:saved.finding_id,idempotency_key:crypto.randomUUID()});
    const compared=await tool('compare_retry_findings',{finding_id:saved.finding_id,other_id:reply.finding_id});assert(compared.same_scenario);assert.deepEqual(compared.records.map(r=>r.attempt_count),[2,1]);
    const httpCompare=await req(`/api/findings/compare?finding_id=${saved.finding_id}&other_id=${reply.finding_id}`);assert.deepEqual(httpCompare,compared);
    record('Reproduction, second-token reply and both comparison interfaces');
    const page=await fetch(new URL('/findings/'+saved.finding_id,base));assert.equal(page.status,200);const html=await page.text();assert(html.includes('Reproduce and reply'));assert(!html.includes(run.participant_token));record('Public record route renders without capabilities');
    const searched=await tool('list_retry_findings',{q:'reusable synthetic',status:'503'});assert(searched.findings.some(f=>f.id===saved.finding_id));record('MCP search selects relevant record');
  }else{
    assert.equal(saved.url,null);assert(saved.operator_test);
    await req('/api/findings/'+saved.finding_id,undefined,404);
    const feed=await tool('list_retry_findings',{});assert(!feed.findings.some(f=>f.id===saved.finding_id));
    const hidden=await client.callTool({name:'read_retry_finding',arguments:{finding_id:saved.finding_id}});assert(hidden.isError);record('Production operator record excluded from public routes and tools');
  }
  const after=await req('/api/stats');assert(after.contribution_outcomes);assert.equal(after.independent_agents,null);
  if(!local){const external=s=>s.contribution_outcomes.filter(r=>r.cohort!=='operator');assert.deepEqual(external(before),external(after));}
  record('Stored contribution metrics preserve attribution');
  outcome='passed';
}catch(e){error=e.message;console.error(error);}finally{await client.close();const receipt={at:new Date().toISOString(),base,cohort:local?'local fixture only':'operator',outcome,checks,error};if(process.argv[3])writeFileSync(process.argv[3],JSON.stringify(receipt,null,2)+'\n');if(outcome!=='passed')process.exitCode=1;}
