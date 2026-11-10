import math, colorsys

def lobe(theta, center, width):
    d = (theta - center + 180) % 360 - 180
    if abs(d) > width: return 0.0, 0.0
    t = d / width                     # -1..1 across the lobe
    return 0.5 * (1 + math.cos(math.pi * t)), t

def wedge_color(theta):
    # silver base with slow metallic modulation
    base_l = 0.80 + 0.07*math.sin(math.radians(theta*3 + 20)) + 0.04*math.sin(math.radians(theta*7))
    r = g = b = base_l
    r, g, b = base_l*0.98, base_l*0.99, base_l*1.02
    for center, hue0 in ((38, 0.0), (218, 0.0)):
        w, t = lobe(theta, center, 19)
        if w > 0:
            u = t*0.5+0.5
            hue = (0.80 - 0.84*u) % 1.0                    # violet -> blue -> cyan -> green -> yellow -> orange -> red
            cr, cg, cb = colorsys.hls_to_rgb(hue, 0.60, 1.0)
            k = min(1.0, (1-abs(t))*2.2) * 0.95            # flat top so the edge colours (violet, red) show
            r, g, b = r*(1-k)+cr*k, g*(1-k)+cg*k, b*(1-k)+cb*k
    # bright specular streaks between lobes
    for center in (128, 308):
        w, _ = lobe(theta, center, 22)
        k = w*0.55
        r, g, b = r*(1-k)+k, g*(1-k)+k, b*(1-k)+k
    to = lambda v: max(0, min(255, round(v*255)))
    return f"#{to(r):02x}{to(g):02x}{to(b):02x}"

def disc_svg(cx, cy, R, uid="d"):
    n = 180
    wedges = []
    for i in range(n):
        a0 = 360*i/n - 0.6; a1 = 360*(i+1)/n + 0.6
        p0 = (cx + 1.2*R*math.cos(math.radians(a0-90)), cy + 1.2*R*math.sin(math.radians(a0-90)))
        p1 = (cx + 1.2*R*math.cos(math.radians(a1-90)), cy + 1.2*R*math.sin(math.radians(a1-90)))
        wedges.append(f'<path d="M{cx:.1f} {cy:.1f} L{p0[0]:.1f} {p0[1]:.1f} L{p1[0]:.1f} {p1[1]:.1f} Z" fill="{wedge_color((a0+a1)/2)}"/>')
    hole = 0.095*R; clear_out = 0.33*R; clear_in = 0.20*R
    return f'''
<defs>
  <mask id="{uid}-m"><rect x="{cx-R*1.3}" y="{cy-R*1.3}" width="{R*2.6}" height="{R*2.6}" fill="#000"/>
    <circle cx="{cx}" cy="{cy}" r="{R}" fill="#fff"/><circle cx="{cx}" cy="{cy}" r="{hole}" fill="#000"/></mask>
  <radialGradient id="{uid}-shade" cx="{cx}" cy="{cy}" r="{R}" gradientUnits="userSpaceOnUse">
    <stop offset="0.0" stop-color="#fff" stop-opacity=".0"/>
    <stop offset="0.34" stop-color="#fff" stop-opacity=".22"/>
    <stop offset="0.36" stop-color="#fff" stop-opacity=".0"/>
    <stop offset="0.80" stop-color="#000" stop-opacity="0"/>
    <stop offset="1.0" stop-color="#000" stop-opacity=".30"/>
  </radialGradient>
  <linearGradient id="{uid}-gloss" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/>
  </linearGradient>
</defs>
<g mask="url(#{uid}-m)">
  {''.join(wedges)}
  <circle cx="{cx}" cy="{cy}" r="{R}" fill="url(#{uid}-shade)"/>
  <circle cx="{cx}" cy="{cy}" r="{R}" fill="url(#{uid}-gloss)" opacity=".45"/>
  <!-- clear plastic hub -->
  <circle cx="{cx}" cy="{cy}" r="{clear_out}" fill="#eef0f4" fill-opacity=".55"/>
  <!-- data-area edge rings -->
  <circle cx="{cx}" cy="{cy}" r="{R*0.985}" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="{R*0.010:.1f}"/>
</g>'''

def svg(body, bg="#0a0a0b", size=1024):
    b = f'<rect width="{size}" height="{size}" fill="{bg}"/>' if bg else ''
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" width="{size}" height="{size}">{b}{body}</svg>'

if __name__ == "__main__":
    open("disc.svg","w").write(svg(disc_svg(512, 512, 330)))
