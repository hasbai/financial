"""Provision the Worker resource and its Git-integrated production build.
Reads a Cloudflare user-scoped API token from stdin; never deploys a Worker version.
"""
import json, sys, urllib.request, urllib.error
ACCOUNT='5cecc63c78acf8f5473f8745f4244448'
BASE=f'https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/'
token=sys.stdin.read().strip()
if not token: raise SystemExit('Cloudflare API token required on stdin')
def api(method,path,data=None):
    req=urllib.request.Request(BASE+path,method=method,data=json.dumps(data).encode() if data is not None else None,headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(req,timeout=30) as response: value=json.load(response)
    except urllib.error.HTTPError as error:
        raise RuntimeError(f'Cloudflare {method} {path}: HTTP {error.code}') from None
    if not value.get('success'): raise RuntimeError('Cloudflare API rejected '+path)
    return value['result']
workers=api('GET','workers/scripts')
worker=next((w for w in workers if w['id']=='tavern'),None)
if worker:
    worker_id=worker['tag']
else:
    created=api('POST','workers/workers',{'name':'tavern','observability':{'enabled':True,'head_sampling_rate':0.1,'traces':{'enabled':True,'head_sampling_rate':0.1}}})
    worker_id=created['id']
triggers=api('GET',f'builds/workers/{worker_id}/triggers')
existing=next((t for t in triggers if t.get('branch_includes')==['main']),None)
config={'external_script_id':worker_id,'repo_connection_uuid':'15057c45-fe8f-4114-865e-e91e948ef5c6','build_token_uuid':'dc39310a-c07e-4c39-87de-94ee4c73764d','trigger_name':'Tavern production','build_command':'pnpm --filter tavern build','deploy_command':'pnpm --filter tavern exec wrangler deploy','root_directory':'/','branch_includes':['main'],'branch_excludes':[],'path_includes':['apps/tavern/**','packages/**','pnpm-lock.yaml','pnpm-workspace.yaml','package.json'],'path_excludes':[],'build_caching_enabled':False}
result=api('PATCH',f"builds/triggers/{existing['trigger_uuid']}",config) if existing else api('POST','builds/triggers',config)
verified=api('GET',f'builds/workers/{worker_id}/triggers')
match=next(t for t in verified if t.get('trigger_name')=='Tavern production')
if match['build_command']!=config['build_command'] or match['branch_includes']!=['main']: raise RuntimeError('Build trigger verification failed')
print(json.dumps({'worker':'tavern','workerTag':worker_id,'triggerId':match['trigger_uuid'],'mainAutoDeploy':True,'paths':match['path_includes']}))
