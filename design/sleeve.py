from gen import disc_svg, svg

SLEEVE_DEFS = '''
<defs>
  <linearGradient id="sl-fill" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#fff" stop-opacity=".36"/><stop offset=".45" stop-color="#fff" stop-opacity=".10"/><stop offset="1" stop-color="#fff" stop-opacity=".22"/>
  </linearGradient>
  <linearGradient id="sl-edge" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#f1f3f7"/><stop offset=".5" stop-color="#9b9ea6"/><stop offset="1" stop-color="#d0d3da"/>
  </linearGradient>
</defs>'''

def composition(cx=512, cy=497, R=255, sx=232, sw=560, bottom=None, side_top=None, vertex=None, c=26, rb=96):
    # the sleeve overhangs the disc by the same amount on the sides and below
    margin = (sw - 2*R) / 2
    if bottom is None:
        bottom = cy + R + margin
    ys = side_top if side_top is not None else cy - 0.40*R      # top of the sleeve at its sides
    yv = vertex if vertex is not None else cy + 0.30*R          # lowest point of the V, below the hole
    xr = sx + sw
    mid = sx + sw/2
    # rounded V: each half is a smooth curve that leaves the corner nearly flat and rounds off at the vertex
    top_left_to_vertex = f"C{sx+c+sw*0.16:.1f} {ys:.1f} {mid-sw*0.11:.1f} {yv:.1f} {mid:.1f} {yv:.1f}"
    top_vertex_to_right = f"C{mid+sw*0.11:.1f} {yv:.1f} {xr-c-sw*0.16:.1f} {ys:.1f} {xr-c:.1f} {ys:.1f}"
    outline = (f"M{sx} {ys+c:.1f} Q{sx} {ys:.1f} {sx+c} {ys:.1f} {top_left_to_vertex} {top_vertex_to_right} "
               f"Q{xr} {ys:.1f} {xr} {ys+c:.1f} V{bottom-rb} Q{xr} {bottom} {xr-rb} {bottom} H{sx+rb} Q{sx} {bottom} {sx} {bottom-rb} Z")
    edge = f"M{sx+c} {ys:.1f} {top_left_to_vertex} {top_vertex_to_right}"
    sleeve = f'''{SLEEVE_DEFS}
<path d="{outline}" fill="url(#sl-fill)"/>
<path d="{outline}" fill="none" stroke="url(#sl-edge)" stroke-width="9" stroke-linejoin="round"/>
<path d="M{sx+34} {ys+90:.0f} V{bottom-rb*0.9:.0f}" stroke="#fff" stroke-opacity=".26" stroke-width="5" stroke-linecap="round"/>'''
    return disc_svg(cx, cy, R, "s") + sleeve

if __name__ == "__main__":
    open("sleeve.svg", "w").write(svg(composition()))
    open("sleeve-fg.svg", "w").write(svg(composition(), bg=None))
