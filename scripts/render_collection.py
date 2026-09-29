"""Logo motion collection, rendered from the supplied SVG with slack-gif-creator.

60 fps masters contain 270 frames / 4.5 seconds. GIFs are rendered directly at
50 fps with 20 ms delays to avoid browser clamping of shorter frame delays.
"""
from pathlib import Path
import os, sys, json, math, subprocess, hashlib, zipfile, gc, argparse, shutil, xml.etree.ElementTree as ET
import numpy as np
import cv2
from PIL import Image, ImageDraw, ImageFilter, ImageChops

ROOT = Path(__file__).resolve().parents[1]
SKILL = Path(os.environ.get('GIF_SKILL_PATH', Path.home()/'.agents/skills/slack-gif-creator'))
sys.path.insert(0, str(SKILL))
from core.gif_builder import GIFBuilder
from core.easing import interpolate, ease_out_cubic, ease_back_out, ease_in_out_cubic

OUT = ROOT/'site/media'
OUT.mkdir(parents=True, exist_ok=True)
FPS, GIF_FPS, SECONDS, S = 60, 50, 4.5, 2
RENDER_VERSION = "smooth-v2"
W, H = 1080, 320
SIZE = (W*S, H*S)
SOURCE = ROOT/'high-resolution-reference.svg'
SOURCE_SHA = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
viewbox = [float(v) for v in ET.parse(SOURCE).getroot().attrib['viewBox'].split()]
SHARP = os.environ.get('SHARP_MODULE', 'sharp')
subprocess.run(['node', '-e', f"require({json.dumps(SHARP)})({json.dumps(str(SOURCE))},{{density:144}}).resize({{width:{900*S},height:{round(900*viewbox[3]/viewbox[2])*S},fit:'fill'}}).flatten({{background:'#fff'}}).png().toFile({json.dumps(str(OUT/'source.png'))})"], check=True)
logo = Image.open(OUT/'source.png').convert('RGB')
LW, LH = logo.size
LX, LY = 90*S, (H*S-LH)//2
WHITE = Image.new('RGB', SIZE, 'white')
STATIC = WHITE.copy(); STATIC.paste(logo, (LX, LY))
YY, XX = np.mgrid[0:H*S,0:W*S].astype(np.float32)
ARR = np.array(logo)

STYLES = [
    dict(id='ribbon', name='卷曲展开', en='Ribbon unfold', category='流动', description='沿着一道柔和的卷曲，标识从左向右舒展。保留参考动画的透视与流动感。', mood='舒展 · 连贯 · 经典', number='01', posterTime=.98),
    dict(id='pages', name='书页翻转', en='Turning pages', category='空间', description='以书页翻动为灵感，中文字依次转向正面，英文行随后浮现。', mood='书卷 · 秩序 · 立体', number='02', posterTime=.62),
    dict(id='cascade', name='逐字跃入', en='Letter cascade', category='节奏', description='图标先轻盈落定，文字以错落的节奏跃入，留下克制的回弹。', mood='轻盈 · 明快 · 亲和', number='03', posterTime=.55),
    dict(id='orbit', name='圆心扩展', en='Radial reveal', category='空间', description='从红色书籍标识的圆心向外扩散，让整组文字随圆弧逐渐显现。', mood='聚焦 · 从容 · 开阔', number='04', posterTime=.80),
    dict(id='slices', name='切片汇聚', en='Parallel assembly', category='节奏', description='水平切片从两侧交错汇合，完整拼出标识，呈现更鲜明的现代节奏。', mood='利落 · 交错 · 现代', number='05', posterTime=.52),
    dict(id='ink', name='印迹显影', en='Ink impression', category='笔触', description='先勾勒图标与字形的轮廓，再由线入面，像一页逐渐完成的品牌印稿。', mood='书写 · 精细 · 沉静', number='06', posterTime=.83),
    dict(id='mosaic', name='像素聚合', en='Mosaic convergence', category='构成', description='分散的方形片段从四周聚拢，逐块归位，最终合成完整而清晰的标识。', mood='探索 · 聚合 · 数字', number='07', posterTime=.62),
    dict(id='shutter', name='对开揭幕', en='Center opening', category='空间', description='两道倾斜的幕边从中轴向外打开，让标识在对称的节奏中完整亮相。', mood='仪式 · 对称 · 稳重', number='08', posterTime=.72),
    dict(id='focus', name='景深聚焦', en='Focus pull', category='镜头', description='标识从放大的柔焦中缓缓收拢，细节逐渐清晰，如同镜头完成一次精准对焦。', mood='柔和 · 电影 · 克制', number='09', posterTime=.40),
]
for _style in STYLES:_style['series']='classic'
SERIES=[
    dict(id='classic',number='VOL. 01',name='经典选集',en='The first collection',credit=''),
    dict(id='opus',number='VOL. 02',name='Claude Opus 5.5 选集',en='Designed by Claude Opus 5.5',credit='Claude Opus 5.5'),
]

def clamp(v): return max(0., min(1., v))
def smooth(v):
    v=np.clip(v,0,1); return v*v*(3-2*v)
def paste(canvas, part, x, y, scale_x=1., scale_y=1., opacity=1.):
    if opacity<=0 or scale_x<=.004 or scale_y<=.004:return
    w,h=part.size
    resized=part.resize((max(1,round(w*scale_x)),max(1,round(h*scale_y))),Image.Resampling.BICUBIC)
    if opacity<1: resized=Image.blend(Image.new('RGB',resized.size,'white'),resized,clamp(opacity))
    canvas.paste(resized,(round(x+(w-resized.width)/2),round(y+(h-resized.height)/2)))

def ribbon(t):
    exit_p=clamp((t-3.68)/.68)
    p=clamp((t-.10)/1.65)
    if exit_p>0:p=1-ease_in_out_cubic(exit_p)
    cam=ease_out_cubic(p)
    width=(1050-150*cam)*S
    left=(-105+195*cam)*S if not exit_p else (90+100*exit_p)*S
    scale=width/LW
    u=(XX-left)/scale
    front=p*1.28*LW
    fold=smooth((front-u)/(LW*.235))
    curve=np.sin(u/LW*20-p*8)*(1-fold)*11*S*(1-p)
    v=(YY-H*S/2-curve)/(scale*(.014+.986*fold))+LH/2
    out=cv2.remap(ARR,u.astype(np.float32),v.astype(np.float32),cv2.INTER_CUBIC,borderMode=cv2.BORDER_CONSTANT,borderValue=(255,255,255))
    out[u>front]=255
    return Image.fromarray(out)

# The source is split only for animation; every component returns to its exact position.
scale=LW/1048
parts=[(logo.crop((0,0,round(139*scale),LH)), LX,LY)]
edges=[149,230,312,395,478,560,642,724,807,895,974,1048]
for a,b in zip(edges,edges[1:]):
    x1,x2=round(a*scale),round(b*scale)
    parts.append((logo.crop((x1,0,x2,round(94*scale))),LX+x1,LY))
ex=round(149*scale); ey=round(94*scale)
english=logo.crop((ex,ey,LW,LH))

def pages(t):
    c=WHITE.copy()
    exit_p=ease_in_out_cubic(clamp((t-3.7)/.64))
    for i,(part,x,y) in enumerate(parts):
        p=clamp((t-.08-i*.055)/.62)
        progress=ease_out_cubic(p)*(1-exit_p)
        sx=max(.003,math.sin(progress*math.pi/2))
        paste(c,part,x+(1-progress)*22*S,y+(1-progress)*(-8 if i%2 else 8)*S,sx,1,clamp(p*4)*(1-exit_p))
    ep=interpolate(0,1,clamp((t-.78)/.48),'ease_out')*(1-exit_p)
    paste(c,english,LX+ex,LY+ey+(1-ep)*9*S,1,1,ep)
    return c

def cascade(t):
    c=WHITE.copy()
    for i,(part,x,y) in enumerate(parts):
        p=clamp((t-.08-i*.045)/.67)
        move=ease_back_out(p)
        q=ease_in_out_cubic(clamp((t-3.6-i*.018)/.48))
        paste(c,part,x,y+(1-move)*65*S+q*45*S,1,1,clamp(p*5)*(1-q))
    ep=ease_out_cubic(clamp((t-.63)/.65));q=ease_in_out_cubic(clamp((t-3.75)/.55))
    paste(c,english,LX+ex,LY+ey+(1-ep)*22*S+q*28*S,1,1,ep*(1-q))
    return c

def orbit(t):
    p=clamp((t-.1)/1.65)
    r=ease_in_out_cubic(p)*1040*S
    cx=LX+55*S;cy=H*S/2
    dist=np.sqrt((XX-cx)**2+(YY-cy)**2)
    mask=np.clip((r-dist)/3+.5,0,1)
    q=ease_in_out_cubic(clamp((t-3.65)/.66))
    mask*=1-q
    arr=np.asarray(STATIC)
    result=(255+(arr.astype(np.float32)-255)*mask[:,:,None]).astype('uint8')
    c=Image.fromarray(result)
    if 0<p<1 and 6*S<r<1000*S:
        # A quiet red arc accompanies the reveal, fading before the final logo hold.
        d=ImageDraw.Draw(c)
        opacity=math.sin(math.pi*p)*.35
        color=tuple(round(255+(v-255)*opacity) for v in (176,0,0))
        d.ellipse((cx-r,cy-r,cx+r,cy+r),outline=color,width=2)
    return c

def slices(t):
    c=WHITE.copy()
    for i in range(9):
        top=round(i*LH/9);bot=round((i+1)*LH/9)
        p=clamp((t-.08-i*.045)/.88)
        q=ease_in_out_cubic(clamp((t-3.6-i*.025)/.46))
        shift=(1-ease_out_cubic(p))*350*S+q*240*S
        direction=-1 if i%2 else 1
        paste(c,logo.crop((0,top,LW,bot)),LX+direction*shift,LY+top,1,1,clamp(p*5)*(1-q))
    return c

# Trace contours only for the animated outline; the supplied SVG render supplies
# every finished frame, so no original path or colour is replaced.
ink_mask=(ARR.mean(axis=2)<215).astype('uint8')*255
contours,_=cv2.findContours(ink_mask,cv2.RETR_LIST,cv2.CHAIN_APPROX_NONE)
ink_paths=[]
for contour in contours:
    points=contour[:,0,:]
    if len(points)<5:continue
    points=np.vstack([points,points[0]])
    lengths=np.concatenate([[0],np.cumsum(np.linalg.norm(np.diff(points,axis=0),axis=1))])
    ink_paths.append((points,lengths,(176,0,0) if points[:,0].mean()<140*scale else (0,0,0),points[:,0].min()/LW))

def ink(t):
    fade=1-ease_in_out_cubic(clamp((t-3.65)/.67))
    outlines=np.full((LH,LW,3),255,dtype=np.uint8)
    fill=ease_in_out_cubic(clamp((t-.9)/.75))
    for points,lengths,color,start in ink_paths:
        p=ease_out_cubic(clamp((t-.10-start*.3)/1.05))
        count=np.searchsorted(lengths,lengths[-1]*p,side='right')
        if count<2:continue
        shade=tuple(round(255+(v-255)*fade) for v in color)
        cv2.polylines(outlines,[points[:count].astype(np.int32)],False,shade,2,cv2.LINE_AA)
    base=Image.fromarray(outlines)
    if fill>0:base=Image.blend(base,logo,fill)
    if fade<1:base=Image.blend(Image.new('RGB',base.size,'white'),base,fade)
    c=WHITE.copy();c.paste(base,(LX,LY));return c

# Fixed seed makes each render reproducible, including the flight of every tile.
rng=np.random.default_rng(2026)
tiles=[]
for row in range(5):
    for col in range(24):
        x0,x1=round(col*LW/24),round((col+1)*LW/24)
        y0,y1=round(row*LH/5),round((row+1)*LH/5)
        tile=logo.crop((x0,y0,x1,y1))
        if np.asarray(tile).min()==255:continue
        angle=rng.uniform(0,math.tau);dist=rng.uniform(65,210)*S
        tiles.append((tile,x0,y0,math.cos(angle)*dist,math.sin(angle)*dist*.55,rng.uniform(0,.4)))

def mosaic(t):
    c=WHITE.copy()
    for tile,x,y,dx,dy,delay in tiles:
        p=ease_out_cubic(clamp((t-.10-delay)/1.15))
        q=ease_in_out_cubic(clamp((t-3.58-delay*.4)/.58))
        drift=1-p+q;opacity=clamp(p*2)*(1-q)
        if opacity<=0:continue
        part=Image.blend(Image.new('RGB',tile.size,'white'),tile,opacity)
        # Multiply/darken over white keeps crossing pieces from erasing each other.
        layer=WHITE.copy();layer.paste(part,(round(LX+x+dx*drift),round(LY+y+dy*drift)))
        c=ImageChops.darker(c,layer)
    return c

def shutter(t):
    p=ease_in_out_cubic(clamp((t-.1)/1.45))
    q=ease_in_out_cubic(clamp((t-3.66)/.66))
    openness=p*(1-q)
    opening=openness*(W*S*.56)
    slant=(YY-H*S/2)*.20*(1-openness)
    distance=np.abs(XX-W*S/2+slant)
    mask=np.clip((opening-distance)/2+.5,0,1)
    result=255+(np.asarray(STATIC).astype(np.float32)-255)*mask[:,:,None]
    if .02<openness<.98:
        edge=np.clip(1-np.abs(distance-opening)/(1.2*S),0,1)*math.sin(math.pi*openness)*.28
        for ch,val in enumerate([176,0,0]):result[:,:,ch]=result[:,:,ch]*(1-edge)+val*edge
    return Image.fromarray(result.clip(0,255).astype('uint8'))

def focus(t):
    p=ease_out_cubic(clamp((t-.1)/1.55))
    q=ease_in_out_cubic(clamp((t-3.62)/.72))
    blur=(1-p)*10*S+q*8*S
    opacity=interpolate(0,1,clamp((t-.1)/.7),'ease_out')*(1-q)
    c=WHITE.copy()
    paste(c,logo,LX,LY,1+(1-p)*.38+q*.08,1+(1-p)*.38+q*.08,opacity)
    return c.filter(ImageFilter.GaussianBlur(blur)) if blur>.02 else c

RENDERERS=dict(ribbon=ribbon,pages=pages,cascade=cascade,orbit=orbit,slices=slices,ink=ink,mosaic=mosaic,shutter=shutter,focus=focus)
# Volume 02 lives in its own module; it shares this file's canvas, source raster and timing.
sys.path.insert(0,str(Path(__file__).resolve().parent))
import opus_styles
STYLES+=opus_styles.STYLES
RENDERERS.update(opus_styles.renderers(globals()))
def scale_canvas(frame,scale):
    # Scale the 2x artwork about the canvas centre; the canvas itself never changes.
    if abs(scale-1)<1e-6:return frame
    w,h=round(W*S*scale),round(H*S*scale)
    c=WHITE.copy();c.paste(frame.resize((w,h),Image.Resampling.LANCZOS),((W*S-w)//2,(H*S-h)//2))
    return c
def frame_at(style,t,scale=1.):
    if t<.08 or t>=4.37:return Image.new('RGB',(W,H),'white')
    # Exact same still across styles, matching the original vector.
    if 1.85<=t<3.6:return scale_canvas(STATIC,scale).resize((W,H),Image.Resampling.LANCZOS)
    return scale_canvas(RENDERERS[style](t),scale).resize((W,H),Image.Resampling.LANCZOS)
def write_mp4(frames,path):
    proc=subprocess.Popen(['ffmpeg','-y','-loglevel','error','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-','-an','-c:v','libx264','-crf','16','-pix_fmt','yuv420p','-movflags','+faststart',str(path)],stdin=subprocess.PIPE)
    for f in frames:proc.stdin.write(f.tobytes())
    proc.stdin.close();assert proc.wait()==0

def gif_save(frames,path,durations):
    # Reuse the skill's frame assembly and global colour optimization.
    builder=GIFBuilder(W,H,GIF_FPS)
    for f in frames:builder.add_frame(f)
    optimized=builder.optimize_colors(num_colors=256,use_global_palette=True)
    # Keep one indexed palette on disk. The timing adapter is needed because
    # GIFBuilder.save uses one duration which GIF encoders can truncate to 10 ms.
    samples=Image.new('RGB',(W,H*5),'white')
    for j,idx in enumerate([20,40,60,90,135]):samples.paste(Image.fromarray(optimized[min(idx,len(optimized)-1)]),(0,j*H))
    palette=samples.quantize(colors=256,method=Image.Quantize.MEDIANCUT)
    indexed=[Image.fromarray(f).quantize(palette=palette,dither=Image.Dither.NONE) for f in optimized]
    indexed[0].save(path,save_all=True,append_images=indexed[1:],duration=durations,loop=0,disposal=1,optimize=True)
    del builder,optimized,indexed

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--styles',nargs='+',choices=list(RENDERERS),help='Render only these styles, preserving existing files for the others.')
parser.add_argument("--gif-only",action="store_true",help="Regenerate GIFs while preserving videos and posters from the same SVG.")
parser.add_argument("--contact",metavar="DIR",help="Write a contact sheet per selected style to DIR and exit without touching the site.")
parser.add_argument("--export",metavar="DIR",help="Write MP4 + GIF for the selected styles to DIR at --logo-scale, without touching the site.")
parser.add_argument("--logo-scale",type=float,default=1.,help="Logo size for --export, 0.4–1.2. The canvas stays 1080 × 320; margins change.")
args=parser.parse_args()
if not .4<=args.logo_scale<=1.2:parser.error('--logo-scale must be between 0.4 and 1.2')
if args.export:
    target=Path(args.export);target.mkdir(parents=True,exist_ok=True);pct=round(args.logo_scale*100)
    print(f'Logo {pct}%: left/right margin {(W-LW/S*args.logo_scale)/2:.0f} px, top/bottom margin {(H-LH/S*args.logo_scale)/2:.0f} px',flush=True)
    for key in args.styles or list(RENDERERS):
        write_mp4([frame_at(key,i/FPS,args.logo_scale) for i in range(round(FPS*SECONDS))],target/f'{key}-{pct}.mp4')
        frames=[frame_at(key,i/GIF_FPS,args.logo_scale) for i in range(round(GIF_FPS*SECONDS))]
        gif_save(frames,target/f'{key}-{pct}.gif',[20]*len(frames))
        print('exported',key,flush=True);del frames;gc.collect()
    (OUT/'source.png').unlink();sys.exit()
if args.contact:
    Path(args.contact).mkdir(parents=True,exist_ok=True)
    times=[.1,.3,.5,.7,.9,1.1,1.3,1.5,1.7,1.84,3.62,3.75,3.9,4.05,4.2,4.34]
    for key in args.styles or list(RENDERERS):
        sheet=Image.new('RGB',(W*2,H*len(times)//2),'white')
        for j,tt in enumerate(times):
            f=frame_at(key,tt);ImageDraw.Draw(f).text((8,6),f'{tt:.2f}s',fill=(120,120,120))
            sheet.paste(f,((j%2)*W,(j//2)*H))
        sheet.save(Path(args.contact)/f'{key}.jpg',quality=88)
        print('contact',key,flush=True)
    (OUT/'source.png').unlink();sys.exit()
if args.styles or args.gif_only:
    previous=json.loads((ROOT/'site/manifest.json').read_text())
    if previous.get('sha256')!=SOURCE_SHA or (args.styles and previous.get('renderVersion')!=RENDER_VERSION):
        raise ValueError('The source or GIF timing changed. Render all styles to avoid mixing versions.')
manifest=[]
for style in STYLES:
    key=style['id']
    if args.styles and key not in args.styles:
        for suffix in ['.mp4','.gif','-compatible.gif','-poster.png']:
            if not (OUT/f'{key}{suffix}').is_file():raise FileNotFoundError(f'{key}{suffix}: render all styles once before a partial render.')
        style.update(duration=SECONDS,fps=FPS,width=W,height=H,video=f'media/{key}.mp4',gif=f'media/{key}.gif',compatibleGif=f'media/{key}-compatible.gif',poster=f'media/{key}-poster.png',sizes={ext:(OUT/f'{key}.{ext}').stat().st_size for ext in ['mp4','gif']},compatibleSize=(OUT/f'{key}-compatible.gif').stat().st_size)
        manifest.append(style)
        continue
    print(f'Rendering {key}: 60 fps video / 50 fps GIF',flush=True)
    if args.gif_only:
        for suffix in ['.mp4','-poster.png']:
            if not (OUT/f'{key}{suffix}').is_file():raise FileNotFoundError(f'{key}{suffix}')
    else:
        frames=[frame_at(key,i/FPS) for i in range(round(FPS*SECONDS))]
        frames[round(style['posterTime']*FPS)].save(OUT/f'{key}-poster.png')
        write_mp4(frames,OUT/f'{key}.mp4')
        del frames
    # Render at exact 20 ms intervals; resampling 60 fps introduces uneven motion steps.
    gif_frames=[frame_at(key,i/GIF_FPS) for i in range(round(GIF_FPS*SECONDS))]
    gif_save(gif_frames,OUT/f'{key}.gif',[20]*len(gif_frames))
    # Preserve old direct download URLs with the same corrected animation.
    shutil.copyfile(OUT/f'{key}.gif',OUT/f'{key}-compatible.gif')
    style.update(duration=SECONDS,fps=FPS,width=W,height=H,
        video=f'media/{key}.mp4',gif=f'media/{key}.gif',compatibleGif=f'media/{key}-compatible.gif',poster=f'media/{key}-poster.png',
        sizes={ext:(OUT/f'{key}.{ext}').stat().st_size for ext in ['mp4','gif']},compatibleSize=(OUT/f'{key}-compatible.gif').stat().st_size)
    manifest.append(style)
    print(f'Finished {key}',flush=True)
    del gif_frames;gc.collect()

STATIC.resize((W,H),Image.Resampling.LANCZOS).save(OUT/'still.png')
(OUT/'source.png').unlink()
metadata=dict(source=SOURCE.name,sha256=SOURCE_SHA,assetVersion=SOURCE_SHA[:12]+"-"+RENDER_VERSION,renderVersion=RENDER_VERSION,duration=SECONDS,masterFps=FPS,gifFps=GIF_FPS,gifTiming='50 fps, 20 ms frame delays; identical hold frames may be merged.',compatibleGifFps=50,skill='anthropics/skills/slack-gif-creator',archiveVersion=SOURCE_SHA[:12]+'-'+RENDER_VERSION+f'-{len(manifest)}',series=SERIES,styles=manifest,logoBox=dict(x=LX//S,y=LY//S,width=LW//S,height=LH//S))
(ROOT/'site/assets/logo.svg').write_bytes(SOURCE.read_bytes())
(ROOT/'site/manifest.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2))
(ROOT/'site/manifest.js').write_text('window.MOTION_COLLECTION = '+json.dumps(metadata,ensure_ascii=False)+';\n')
with zipfile.ZipFile(OUT/'motion-collection.zip','w',zipfile.ZIP_DEFLATED) as archive:
    for f in OUT.iterdir():
        if f.suffix in ['.gif','.mp4'] and not f.name.endswith('-compatible.gif'):archive.write(f,f.name)
    archive.write(SOURCE,'logo.svg')
    archive.writestr('README.txt',f'{len(manifest)} logo animations. Each is 4.5 seconds. MP4: exact 60 fps. GIF: 50 fps, 20 ms frame delays, rendered directly from the SVG. Original SVG included.\n')
print('Collection complete',flush=True)
