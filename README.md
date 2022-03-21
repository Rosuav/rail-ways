Rail-Ways Route Designer
========================

(Credit to Person in the Mirror for the name)

Draw Bézier curves to lay out railway track. Import one or more images to use
as backgrounds and references. Plan track to avoid hazards, minimize land
acquisitions, and maximize train speed (by avoiding tight curves).

Formerly at https://rosuav.github.io/shed/bezier.html - see there for old history.

## TODO

* Upload background image
* Pan/zoom (native size == image size)
* Stroke width (in pixels)
* Splines: multiple cubic Bezier curves, chained, all inline control points
  - Have a simple UI to "add curve"
    - Measure delta-x, delta-y from point prior to "end" to "end" itself
    - Replace the current "end" with "next"
    - Append control point end+dx, end+dy
    - Append control point end+dx*2, end+dy*2
    - Append end point end+dx*3, end+dy*3
  - Also: "add line". Exactly as above but zero control points.
* Show direction of travel somewhere (maybe the Next marker needs an orientation?)
* Automatic symmetry
  - When you drag a point immediately before a Next node, also correspondingly move
    the point immediately after the Next node, and vice versa.
  - Level of symmetry: require colinear, require equidistant
    - Default to both active. Experiment to see what happens if you change one.
  - May help to have a polarize function to give r,theta from one point to another
  - If both are active, don't bother polarizing, just mirror the x and y coords.
  - What happens if you have ["next", "next", "control"]? (This would be a line
    segment followed by a curve.) Lock the control point to colinearity?
  - If you drag a "next", "start", or "end", move its adjacent control points too?
* Import/export JSON
* List (maybe drop-down) of all points
  - Show info about point when selected, and highlight it
  - Change selection in drop-down when point clicked on
    - Disallow movement less than 5px
  - Have inputs for x/y position
    - Fine adjustment
    - Lost point retrieval (sorry Anne, we're not sending you any control points)
