import json, os
from gen import disc_svg, svg
from sleeve import composition, SLEEVE_DEFS
import sleeve as S

BG = "#0a0a0b"

def outline_path(cx=512, cy=497, R=255, sx=232, sw=560):
    """Reuse the sleeve geometry to get its outline for the silhouette versions."""
    import re
    full = composition(cx=cx, cy=cy, R=R, sx=sx, sw=sw)
    m = re.search(r'<path d="(M[^"]+Z)" fill="url\(#sl-fill\)"/>', full)
    return m.group(1)

def mono_svg(size=1024, color="#ffffff"):
    cx, cy, R = 512, 512, 338
    hole = 0.095 * R * 1.25
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="{size}" height="{size}">
<defs><mask id="m"><rect width="1024" height="1024" fill="#000"/>
  <circle cx="{cx}" cy="{cy}" r="{R}" fill="#fff"/>
  <circle cx="{cx}" cy="{cy}" r="{R*0.33}" fill="none" stroke="#000" stroke-width="{R*0.05:.0f}"/>
  <circle cx="{cx}" cy="{cy}" r="{hole}" fill="#000"/></mask></defs>
<rect width="1024" height="1024" fill="{color}" mask="url(#m)"/>
</svg>'''

BBOX_CENTRE = (512, 509.5)   # centre of the disc-and-sleeve artwork

def place(body, scale, cx=512, cy=512):
    """Scale the artwork about its own centre and put that centre at (cx, cy)."""
    tx = cx - scale * BBOX_CENTRE[0]
    ty = cy - scale * BBOX_CENTRE[1]
    return f'<g transform="translate({tx:.1f} {ty:.1f}) scale({scale})">{body}</g>'

def write(name, text): open(f"out/{name}", "w").write(text)

comp = composition()
write("icon.svg", svg(place(comp, 1.62), bg=BG))
# adaptive icons are cropped to a circle about 2/3 of the canvas, so this one cannot grow without clipping
write("foreground.svg", svg(place(comp, 0.96), bg=None))
write("monochrome.svg", mono_svg())
write("notification.svg", mono_svg(size=96))
write("default-cover.svg", svg(comp, bg="#141517"))
# website: rounded-square favicon
write("favicon.svg", f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect width="1024" height="1024" rx="200" fill="{BG}"/>{place(comp, 1.58)}</svg>')
# social preview 1280x640: icon left, text right
social_body = f'''<rect width="1280" height="640" fill="{BG}"/>
{place(comp, 0.94, cx=315, cy=320)}
<text x="640" y="300" fill="#f2f3f5" font-family="Inter, 'Helvetica Neue', Arial, sans-serif" font-size="104" font-weight="700">CD Wallet</text>
<text x="644" y="376" fill="#a9acb3" font-family="Inter, 'Helvetica Neue', Arial, sans-serif" font-size="42">Your music collection,</text>
<text x="644" y="430" fill="#a9acb3" font-family="Inter, 'Helvetica Neue', Arial, sans-serif" font-size="42">in your own cloud.</text>
<text x="644" y="560" fill="#7d8088" font-family="Inter, 'Helvetica Neue', Arial, sans-serif" font-size="30">Self-hosted · Open source · cd-wallet.org</text>'''
write("social.svg", f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 640" width="1280" height="640">{social_body}</svg>')
