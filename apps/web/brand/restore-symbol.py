"""Freeze the original DM Sans bold oblique a-arrow glyphs into shared vector paths.
Run with fonttools installed. Runtime never depends on font shaping for the mark.
"""
from pathlib import Path
import json,math
from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import DecomposingRecordingPen,RecordingPen
from fontTools.pens.qu2cuPen import Qu2CuPen
from fontTools.pens.boundsPen import BoundsPen
root=Path(__file__).resolve().parent.parent
font=TTFont(root/'public/brand/font-3.ttf');gs=font.getGlyphSet();cmap=font.getBestCmap();commands=[];offset=0
for char in 'a↗':
 name=cmap[ord(char)];rec=DecomposingRecordingPen(gs);gs[name].draw(rec)
 cubic=RecordingPen();rec.replay(Qu2CuPen(cubic,max_err=.2,all_cubic=True))
 for op,points in cubic.value:
  commands.append((op,[(x+offset+math.tan(math.radians(14))*y,y) for x,y in points]))
 offset+=font['hmtx'][name][0]-1000*8/30
xs=[x for _,ps in commands for x,y in ps];ys=[y for _,ps in commands for x,y in ps];xmin,xmax,ymin,ymax=min(xs),max(xs),min(ys),max(ys);scale=90/max(xmax-xmin,ymax-ymin)
normal=[(op,[[round(50+(x-(xmin+xmax)/2)*scale,4),round(50-(y-(ymin+ymax)/2)*scale,4)] for x,y in ps]) for op,ps in commands]
code={'moveTo':'M','lineTo':'L','curveTo':'C','closePath':'Z','endPath':'Z'}
path=' '.join(code[op]+' '.join(str(v) for p in ps for v in p) for op,ps in normal)
(root/'brand/geometry.mjs').write_text('// Original a↗ logo, outlined from local DM Sans Bold with its original oblique/spacing.\nexport const markPath='+json.dumps(path)+';\nexport const markCommands='+json.dumps(normal)+';\n')
