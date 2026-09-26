"""Check delivered media duration, resolution, frame rate, loop and archive contents."""
from pathlib import Path
import json, subprocess, zipfile, hashlib
from PIL import Image, ImageChops

ROOT=Path(__file__).resolve().parents[1]
data=json.loads((ROOT/'site/manifest.json').read_text())
assert len(data['styles'])==18
assert [s['series'] for s in data['styles']]==['classic']*9+['opus']*9
assert data['sha256']==hashlib.sha256((ROOT/data['source']).read_bytes()).hexdigest()
assert (ROOT/'site/assets/logo.svg').read_bytes()==(ROOT/data['source']).read_bytes()
assert data['assetVersion']==data['sha256'][:12]+'-'+data['renderVersion']
assert data['gifFps']==50
expected=set()
for style in data['styles']:
    info=json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','v:0','-show_entries','stream=r_frame_rate,nb_frames,duration,width,height','-of','json',str(ROOT/'site'/style['video'])]))['streams'][0]
    assert (info['r_frame_rate'],info['nb_frames'],float(info['duration']))==('60/1','270',4.5)
    assert (info['width'],info['height'])==(1080,320)
    for kind in ['gif','compatibleGif']:
        path=ROOT/'site'/style[kind]
        gif=Image.open(path);delays=[]
        first=gif.convert('RGB')
        for i in range(gif.n_frames):
            gif.seek(i);delays.append(gif.info['duration'])
        assert sum(delays)==4500,(path,sum(delays))
        assert gif.info['loop']==0
        assert ImageChops.difference(first,gif.convert('RGB')).getbbox() is None
        assert gif.size==(1080,320)
        assert all(d>=20 and d%20==0 for d in delays), (path, min(delays))
        if kind=='gif':expected.add(path.name)
    for ext in ['mp4','gif']:
        assert style['sizes'][ext]==(ROOT/'site/media'/f'{style["id"]}.{ext}').stat().st_size
    assert style['compatibleSize']==(ROOT/'site'/style['compatibleGif']).stat().st_size
    expected.add(Path(style['video']).name)
    print(f'{style["id"]}: 60 fps / 270 frames / 4.5 s; both GIFs valid')
with zipfile.ZipFile(ROOT/'site/media/motion-collection.zip') as archive:
    assert archive.testzip() is None
    assert expected.issubset(set(archive.namelist()))
    assert len(expected)==36
    assert archive.read('logo.svg')==(ROOT/data['source']).read_bytes()
print('Verified all 36 current animated assets, 18 GIF aliases and archive integrity.')
