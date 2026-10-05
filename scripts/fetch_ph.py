#!/usr/bin/env python3
"""Fetch Poly Haven CC0 models (gltf, 1k textures) into public/assets/models/."""
import json, os, sys, time, urllib.request, urllib.parse

UA = {'User-Agent': 'Mozilla/5.0 threshold-assets'}
ROOT = 'public/assets/models'

def get(url):
    req = urllib.request.Request(url, headers=UA)
    return urllib.request.urlopen(req, timeout=120).read()

def fetch(slug):
    meta = json.loads(get(f'https://api.polyhaven.com/files/{slug}'))
    files = meta.get('gltf', {}).get('1k')
    if not files:
        print(f'  !! {slug}: no gltf/1k'); return False
    entry = files.get('gltf')
    if not entry or 'url' not in entry:
        print(f'  !! {slug}: no gltf url'); return False
    outdir = os.path.join(ROOT, slug)
    os.makedirs(outdir, exist_ok=True)
    os.makedirs(os.path.join(outdir, 'textures'), exist_ok=True)
    gltf_url = entry['url']
    raw = get(gltf_url)
    open(os.path.join(outdir, 'model.gltf'), 'wb').write(raw)
    gltf = json.loads(raw)
    for rel, inc in (entry.get('include') or files.get('include') or {}).items():
        u = urllib.parse.unquote(rel)
        dest = os.path.join(outdir, 'textures', os.path.basename(u)) if u.lower().endswith(('.jpg', '.png', '.jpeg', '.webp', '.ktx2')) else os.path.join(outdir, os.path.basename(u))
        try:
            open(dest, 'wb').write(get(inc['url']))
        except Exception as e:
            print(f'    miss {u}: {e}')
    for b in gltf.get('buffers', []):
        if 'uri' in b and not b['uri'].startswith('data:'): b['uri'] = os.path.basename(urllib.parse.unquote(b['uri']))
    for i in gltf.get('images', []):
        if 'uri' in i and not i['uri'].startswith('data:'): i['uri'] = 'textures/' + os.path.basename(urllib.parse.unquote(i['uri']))
    open(os.path.join(outdir, 'model.gltf'), 'w').write(json.dumps(gltf))
    print(f'  ok {slug}')
    return True

if __name__ == '__main__':
    ok = 0
    for slug in sys.argv[1:]:
        try:
            ok += fetch(slug)
        except Exception as e:
            print(f'  !! {slug}: {e}')
        time.sleep(0.25)
    print(f'{ok} fetched')
