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
* Show direction of travel somewhere (maybe the Next marker needs an orientation?)
* List (maybe drop-down) of all points
  - Show info about point when selected, and highlight it
  - Change selection in drop-down when point clicked on
    - Disallow movement less than 5px
  - Have inputs for x/y position
    - Fine adjustment
    - Lost point retrieval (sorry Anne, we're not sending you any control points)
* If Ctrl is held and not dragging, change cursor to "move", and any drag moves
  the fundamental transform.
* Scrolling needs to adjust transform as well as scroll
* Scaling of crosshairs?
