Rail-Ways Route Designer
========================

(Credit to Person in the Mirror for the name)

Draw Bézier curves to lay out railway track. Import one or more images to use
as backgrounds and references. Plan track to avoid hazards, minimize land
acquisitions, and maximize train speed (by avoiding tight curves).

Formerly at https://rosuav.github.io/shed/bezier.html - see there for old history.

## TODO

* Export/import of GMaps configs
* Make GMaps optional - if not activated, use bg image only
* Customize GMaps origin?? What happens if you change it?
* Different colours for different types of markers
* List (maybe drop-down) of all points
  - Show info about point when selected, and highlight it
  - Change selection in drop-down when point clicked on
    - Disallow movement less than 5px
  - Have inputs for x/y position
    - Fine adjustment - necessary? Or just zoom further in?
    - Lost point retrieval (sorry Anne, we're not sending you any control points)
      - Less needed with good panning, they'll never truly be lost
* Is there anything that requires integers? If not, replace all |0 with ||0.
* Zooming while anmating breaks things. Possibly a repaint too soon causes
  something to reset??
