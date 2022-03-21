/* TODO

* Restrict everything to cubic curves or straight lines, thus simplifying the code
* Different colours for different types of markers

Straight sections may be more trouble than they're worth. Maybe disallow??
*/
import choc, {set_content, DOM, on} from "https://rosuav.github.io/shed/chocfactory.js";
const {BUTTON, INPUT, LABEL, SPAN} = choc; //autoimport

const RESOLUTION = 256; //Spread this many points across the curve to do our calculations

const state = { };
const options = [
	{kwd: "allowdrag", lbl: "Allow drag", dflt: true},
	{kwd: "shownearest", lbl: "Highlight a point", dflt: false},
	{kwd: "shownearestlines", lbl: "... with lerp lines", dflt: false, depend: "shownearest"},
	{kwd: "shownearestvectors", lbl: "... with vectors", dflt: false, depend: "shownearest"},
	{kwd: "shownearestcircle", lbl: "... and circle", dflt: false, depend: "shownearestvectors"},
	{kwd: "showminimum", lbl: "Show tightest curve", dflt: false},
];
set_content("#options", options.map(o => LABEL([INPUT({type: "checkbox", "data-kwd": o.kwd, checked: state[o.kwd] = o.dflt}), o.lbl])));
const _optlookup = { };
options.forEach(o => {_optlookup[o.kwd] = o; o.rdepend = []; if (o.depend) _optlookup[o.depend].rdepend.push(o.kwd);});
on("click", "#options input", e => {
	state[e.match.dataset.kwd] = e.match.checked;
	if (e.match.checked) {
		//Ensure that dependencies are also checked.
		let o = _optlookup[e.match.dataset.kwd];
		while (o.depend && !state[o.depend]) {
			DOM("[data-kwd=" + o.depend + "]").checked = state[o.depend] = true;
			o = _optlookup[o.depend];
		}
	} else {
		function cleartree(kwd) {
			if (state[kwd]) DOM("[data-kwd=" + kwd + "]").checked = state[kwd] = false;
			_optlookup[kwd].rdepend.forEach(cleartree);
		}
		cleartree(e.match.dataset.kwd);
	}
	repaint();
});

const canvas = DOM("canvas");
const ctx = canvas.getContext('2d');
const curves = [
	{degree: 1, points: [{x: 500, y: 400}]},
	{degree: 3, points: [{x: 600, y: 500}, {x: 450, y: 550}, {x: 450, y: 500}]},
	{degree: 1, points: [{x: 450, y: 450}]},
	{degree: 3, points: [{x: 450, y: 200}, {x: 50, y: 400}, {x: 50, y: 50}]},
];
let elements = []; //Flattening of all point objects curves[*].points[*], and others if clickable
function rebuild_elements() {
	const el = [];
	let x, y;
	curves.forEach((c,i) => {
		//assert c.degree === c.points.length
		//assert c.degree === 1 || c.degree === 3 //we support only cubic curves here
		if (!i) {
			//Start node is special: it is, effectively, a zero-length line segment.
			//Yaknow, a point.
			//assert c.degree === 1
			x = c.points[0].x; y = c.points[0].y;
		}
		c.x = x; c.y = y;
		c.points.forEach((p,n) => {
			p.type = "control";
			p.index = n; //Let each control point know whether it's the first one or not
			p.curve = i; //Cross-reference points back to their curves
			el.push(p);
		});
		const p = c.points[c.points.length - 1];
		//Differentiate intersection nodes from the beginning and end of track, for
		//the sake of the visuals
		p.type = !i ? "start" : i === curves.length - 1 ? "end" : "next";
		x = p.x; y = p.y; //Daisy-chain the next curve onto this one.
	});
	elements = el;
}
rebuild_elements();
const element_types = {
	start: {color: "#a0f0c080", radius: 6, crosshair: 9},
	control: {color: "#66339980", radius: 6, crosshair: 9},
	end: {color: "#a0f0c080", radius: 6, crosshair: 9},
	next: {color: "#a0f0c080", radius: 6, crosshair: 9},
	nearest: {color: "#aaaa2280", radius: 3.5, crosshair: 0},
};
let highlight_curve = 0, highlight_t_value = 0.0;
let tightest_curve = 0, minimum_curve_radius = 0.0;
let animating = 0, animation_timer = null;
on("click", "#toggle_animation", () => {
	animating = !animating;
	if (animating && !state.shownearest) DOM("[data-kwd=shownearest]").click(); //eh whatever
	if (animating && !highlight_curve) {highlight_curve = 1; highlight_t_value = 0;}
	if (animating) animation_timer = setInterval(() => {
		highlight_t_value += animating / RESOLUTION;
		if (highlight_t_value > 1.0) {
			if (highlight_curve === curves.length - 1) {animating = -1; highlight_t_value = 2 - highlight_t_value;}
			else {++highlight_curve; highlight_t_value -= 1.0;}
		}
		if (highlight_t_value < 0.0) {
			//NOTE: We don't animate the start node, which is a single point and not very pretty.
			if (highlight_curve < 1) highlight_curve = 1;
			if (highlight_curve === 1) {animating = 1; highlight_t_value = 0 - highlight_t_value;}
			else {--highlight_curve; highlight_t_value += 1.0;}
		}
		repaint();
	}, 10);
	else clearInterval(animation_timer);
});

const path_cache = { };
function element_path(name) {
	if (path_cache[name]) return path_cache[name];
	const path = new Path2D;
	const t = element_types[name] || { };
	path.arc(0, 0, t.radius || 5, 0, 2*Math.PI);
	const crosshair_size = t.crosshair;
	if (crosshair_size) {
		path.moveTo(-crosshair_size, 0);
		path.lineTo(crosshair_size, 0);
		path.moveTo(0, -crosshair_size);
		path.lineTo(0, crosshair_size);
	}
	path.closePath();
	return path_cache[name] = path;
}
let dragging = null, dragbasex = 50, dragbasey = 10;

function draw_at(ctx, el) {
	const path = element_path(el.type);
	ctx.save();
	ctx.translate(el.x|0, el.y|0);
	ctx.fillStyle = el.fillcolor || element_types[el.type]?.color || "#a0f0c080";
	ctx.fill(path);
	ctx.strokeStyle = el.bordercolor || "#000000";
	ctx.stroke(path);
	ctx.restore();
}

function get_curve_points(curve) {
	const c = curves[curve];
	if (!c) return [];
	return [c, ...c.points];
}

//Calculate {x: N, y: N} for the point on the curve at time t
const _pascals_triangle = [[1], [1]]
function _coefficients(degree) {
	if (degree <= 0) return []; //wut
	//assert intp(degree);
	if (!_pascals_triangle[degree]) {
		const prev = _coefficients(degree - 1); //Calculate (and cache) previous row as needed
		const ret = prev.map((c,i) => c + (prev[i-1]||0));
		_pascals_triangle[degree] = [...ret, 1];
	}
	return _pascals_triangle[degree];
}
function interpolate(points, t) {
	if (points.length <= 1) return points[0];
	const coef = _coefficients(points.length);
	//Calculate the binomial expansion of ((1-t) + t)^n as factors that apply to the points
	//I don't really have a good explanation of exactly what this is doing, if you feel like
	//contributing, please drop in a PR. Each term in the binomial expansion corresponds to
	//one of the points.
	const omt = 1 - t;
	let x = 0, y = 0;
	coef.forEach((c, i) => {
		//We raise (1-t) to the power of a decreasing value, and
		//t to the power of an increasing value, and that gives us
		//the next term in the series.
		x += points[i].x * c * (omt ** (coef.length - i - 1)) * (t ** i);
		y += points[i].y * c * (omt ** (coef.length - i - 1)) * (t ** i);
	});
	return {x, y};
}

function curve_derivative(points) {
	//The derivative of a curve is another curve with one degree lower,
	//whose points are all defined by the differences between other points.
	//This will tend to bring it close to zero, so it may not be viable to
	//draw the entire curve (unless we find a midpoint of some sort), but
	//we can certainly get a vector by taking some point on this curve.
	const deriv = [];
	for (let i = 1; i < points.length; ++i) {
		deriv.push({
			x: points[i].x - points[i - 1].x,
			y: points[i].y - points[i - 1].y,
		});
	}
	return deriv;
}

function signed_curvature(t, deriv1, deriv2) {
	//Calculate signed curvature, positive means curving right, negative means left
	const d1 = interpolate(deriv1, t);
	const d2 = interpolate(deriv2, t);
	//Since these interpolations aren't actually the derivatives (they need to be
	//scaled by 3 and 6 respectively), the final k-value needs to be adjusted to
	//compensate. The net effect is a two-thirds scaling factor.
	return (d1.x * d2.y - d1.y * d2.x) / (d1.x ** 2 + d1.y ** 2) ** 1.5 * 2/3;
}

function curvature(curve, t) {
	//Calculate curvature (often denoted Kappa), which we can depict
	//as 1/r for the osculating circle.
	const deriv1 = curve_derivative(get_curve_points(curve));
	if (deriv1.length < 2) return 0; //Lines don't have curvature.
	const deriv2 = curve_derivative(deriv1);
	return Math.abs(signed_curvature(t, deriv1, deriv2));
}

const lerp_colors = ["#00000080", "#ee2222", "#11aa11", "#2222ee", "#ee22ee", "#aaaa11", "#11cccc"];
let zoomlevel = 0, scale = 1.0;
function repaint() {
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	ctx.save();
	//ctx.scale(scale, scale); //Is it better to do the scaling here or in CSS?
	elements.forEach(el => el === dragging || draw_at(ctx, el));
	curves.forEach((c, i) => {
		ctx.save();
		const points = get_curve_points(i);
		const path = new Path2D;
		const method = {2: "lineTo", 4: "bezierCurveTo"}[points.length];
		//assert method
		const coords = [];
		points.forEach(p => coords.push(p.x, p.y));
		path.moveTo(coords.shift(), coords.shift());
		path[method](...coords);
		ctx.strokeStyle = "#000000";
		//TODO: Stroke thickness
		ctx.stroke(path);
		ctx.restore();
	});
	if (state.shownearest) {
		const points = get_curve_points(highlight_curve);
		//Highlight a point near to the mouse cursor
		const t = highlight_t_value, curve_at_t = interpolate(points, highlight_t_value);
		if (state.shownearestlines) {
			//Show the lerp lines
			let ends = points;
			while (ends.length > 1) {
				//For every pair of points, draw the line, and retain the position t
				//of the way through that line as the next point.
				ctx.save();
				const path = new Path2D;
				path.moveTo(ends[0].x, ends[0].y);
				const mids = [];
				for (let i = 1; i < ends.length; ++i) {
					path.lineTo(ends[i].x, ends[i].y);
					mids.push({
						x: ends[i-1].x * (1-t) + ends[i].x * t,
						y: ends[i-1].y * (1-t) + ends[i].y * t,
					});
				}
				ctx.strokeStyle = lerp_colors[points.length - ends.length];
				ctx.stroke(path);
				ctx.restore();
				ends = mids;
			}
		}
		if (state.shownearestvectors) {
			//Show the derivative vectors
			let deriv = points, factor = 1;
			let derivdesc = ["Derivatives at " + t.toFixed(3) + ": "];
			let derivs = []; //Mainly, track the first and second derivatives for the sake of osculating circle calculation
			while (deriv.length > 1) {
				factor *= (deriv.length - 1); //The derivative is multiplied by the curve's degree at each step
				deriv = curve_derivative(deriv);
				const d = interpolate(deriv, t);
				d.x *= factor; d.y *= factor; //Now it's the actual derivative at t.
				derivs.push(d);
				const vector = {
					angle: Math.atan2(d.y, d.x),
					length: Math.sqrt(d.x * d.x + d.y * d.y),
				};
				derivdesc.push(SPAN({style: "color: " + lerp_colors[points.length - deriv.length]}, vector.length.toFixed(3)), ", ");
				ctx.save();
				const path = new Path2D;
				path.moveTo(curve_at_t.x, curve_at_t.y);
				const arrow = {
					x: curve_at_t.x + d.x / factor / factor / 2, //Divide through by a constant to make the lines fit nicely
					y: curve_at_t.y + d.y / factor / factor / 2, //I'm not sure why we're dividing by factor^2 here, but it seems to look better.
				};
				path.lineTo(arrow.x, arrow.y);
				const ARROW_ANGLE = 2.6; //Radians. If the primary vector is pointing on the X axis, the arrowhead lines point this many radians positive and negative.
				const ARROW_LENGTH = 12;
				for (let i = -1; i <= 1; i += 2) {
					path.lineTo(
						arrow.x + Math.cos(vector.angle + ARROW_ANGLE * i) * ARROW_LENGTH,
						arrow.y + Math.sin(vector.angle + ARROW_ANGLE * i) * ARROW_LENGTH,
					);
					path.moveTo(arrow.x, arrow.y);
				}
				ctx.strokeStyle = lerp_colors[points.length - deriv.length];
				ctx.stroke(path);
				ctx.restore();
			}
			derivdesc.push("and zero.");
			const d1 = derivs[0], d2 = derivs[1];
			const k = d1 && d2 && ((d1.x * d2.y - d1.y * d2.x) / (d1.x ** 2 + d1.y ** 2) ** 1.5);
			if (k) {
				const radius = 1 / k;
				derivdesc.push(" Curve radius is ", SPAN({style: "color: rebeccapurple"}, radius.toFixed(3)));
				if (state.shownearestcircle) {
					//Show the osculating circle at this point.
					//The center of it is 'radius' pixels away and is in the
					//direction orthogonal to the first derivative.
					const angle = Math.atan2(d1.y, d1.x) + Math.PI / 2;
					const circle_x = curve_at_t.x + Math.cos(angle) * radius;
					const circle_y = curve_at_t.y + Math.sin(angle) * radius;
					ctx.save();
					const path = new Path2D;
					path.arc(circle_x, circle_y, Math.abs(radius), 0, Math.PI * 2);
					//Mark the center
					path.moveTo(circle_x + 2, circle_y + 2);
					path.lineTo(circle_x - 2, circle_y - 2);
					path.moveTo(circle_x - 2, circle_y + 2);
					path.lineTo(circle_x + 2, circle_y - 2);
					//Since curvature is denoted with Kappa, it seems right to use
					//purple. But not Twitch Purple. Let's use Rebecca Purple.
					ctx.strokeStyle = "rebeccapurple";
					ctx.stroke(path);
					ctx.restore();
				}
			}
			set_content("#derivatives", derivdesc);
		}
		draw_at(ctx, {type: "nearest", ...curve_at_t});
	}
	set_content("#minimum_curve_radius", [
		"Minimum curve radius for this curve is: ",
		SPAN({style: "display: none"}, "at t=" + minimum_curve_radius + " "), //Currently not shown
		SPAN("" + (1/curvature(tightest_curve, minimum_curve_radius)).toFixed(3)),
	]);
	if (state.showminimum) {
		const points = get_curve_points(tightest_curve);
		const deriv1 = curve_derivative(points);
		const deriv2 = curve_derivative(deriv1);
		const radius = 1 / signed_curvature(minimum_curve_radius, deriv1, deriv2);
		const curve_at_t = interpolate(points, minimum_curve_radius);
		const d1 = interpolate(deriv1, minimum_curve_radius);
		//Show the osculating circle at the point of minimum curve radius.
		const angle = Math.atan2(d1.y, d1.x) + Math.PI / 2; //A quarter turn away from the first derivative
		const circle_x = curve_at_t.x + Math.cos(angle) * radius;
		const circle_y = curve_at_t.y + Math.sin(angle) * radius;
		ctx.save();
		const path = new Path2D;
		path.arc(circle_x, circle_y, Math.abs(radius), 0, Math.PI * 2);
		//Mark the center
		path.moveTo(circle_x + 2, circle_y + 2);
		path.lineTo(circle_x - 2, circle_y - 2);
		path.moveTo(circle_x - 2, circle_y + 2);
		path.lineTo(circle_x + 2, circle_y - 2);
		ctx.strokeStyle = "#880";
		ctx.stroke(path);
		ctx.restore();
	}
	if (dragging) draw_at(ctx, dragging); //Anything being dragged gets drawn last, ensuring it is at the top of z-order.
	ctx.restore();
}

function find_min_curve_radius(points) {
	//Calculate the minimum curve radius and the t-value at which that occurs.
	//Note that, since this uses sampling rather than truly solving the equation,
	//it may not give the precise minimum in situations where there are two local
	//minima that are comparably close. It'll show the other one though.
	//Returns [Kappa, t] for the point of greatest (absolute) curvature.
	const deriv1 = curve_derivative(points);
	if (deriv1.length < 2) {minimum_curve_radius = 0.0; return;} //Lines aren't curved.
	const deriv2 = curve_derivative(deriv1);
	let best = 0.0, curve = 0;
	const probe_span = 8/RESOLUTION; //Start by jumping every eighth spot, as defined by the mouse cursor nearest calculation
	for (let t = 0; t <= 1; t += probe_span) {
		const k = Math.abs(signed_curvature(t, deriv1, deriv2));
		if (k > curve) {curve = k; best = t;}
	}
	//const probed_best = best, probed_curve = curve;
	let earlier = best - probe_span, later = best + probe_span;
	let earlier_curve = Math.abs(signed_curvature(earlier, deriv1, deriv2));
	let later_curve = Math.abs(signed_curvature(later, deriv1, deriv2));
	const epsilon = 1/16384;
	while (later - earlier > epsilon) {
		//We now have three points [earlier, best, later],
		//with curvatures [earlier_curve, curve, later_curve]
		//and we want to find the highest curvature within that range.
		if (later_curve > earlier_curve) {
			earlier = best;
			earlier_curve = curve;
		} else {
			later = best;
			later_curve = curve;
		}
		best = (earlier + later) / 2;
		curve = Math.abs(signed_curvature(best, deriv1, deriv2));
	}
	return [curve, best];
}
function calc_min_curve_radius() {
	let tightest = 0;
	curves.forEach((c, i) => {
		if (c.points.length === 1) return;
		const [k, t] = find_min_curve_radius(get_curve_points(i));
		if (k > tightest) {
			tightest_curve = i;
			minimum_curve_radius = t;
			tightest = k;
		}
	});
}
calc_min_curve_radius();
repaint();

function element_at_position(x, y, filter) {
	for (let el of elements) {
		if (filter && !filter(el)) continue;
		if (ctx.isPointInPath(element_path(el.type), x - el.x, y - el.y)) return el;
	}
}

canvas.addEventListener("pointerdown", e => {
	if (!state.allowdrag) return;
	if (e.button) return; //Only left clicks
	e.preventDefault();
	dragging = null;
	let el = element_at_position(e.offsetX, e.offsetY, el => !el.fixed);
	if (!el) return;
	console.log("Dragging", el);
	e.target.setPointerCapture(e.pointerId);
	dragging = el; dragbasex = e.offsetX - el.x; dragbasey = e.offsetY - el.y;
});

function update_element_position(el, x, y) {
	const dx = x - el.x, dy = y - el.y;
	[el.x, el.y] = [x, y];
	//Update whatever else needs to be updated.
	//1) If you dragged the endpoint of a curve, update the origin of the next curve.
	//2) If you drag the start, it magically starts at that point. This is a consequence
	//of the "start curve" being a special case point, not actually a line.
	//3) When you drag a connection point, also carry its adjacent control points.
	switch (el.type) {
		case "start": curves[0].x = x; curves[0].y = y; //Start node is a special case of continuation node (that loops back on itself)
		case "end":
		case "next": {
			const c = curves[el.curve];
			if (c.points.length > 1) {
				//Carry the last control point of the current curve with this endpoint.
				//If this is a line segment section, there'll only be the end point.
				//Assuming that these are cubic curves, the final control point
				//is the second control point. We could also identify it as the
				//-2th point, but that's not as clean in JS anyway.
				c.points[1].x += dx;
				c.points[1].y += dy;
			}
			const next = curves[el.curve + 1];
			if (next) {
				//There's no next on the end node.
				next.x = x; next.y = y;
				if (next.points.length > 1) {
					//Carry the first control point of the following curve too.
					next.points[0].x += dx;
					next.points[0].y += dy;
				}
			}
			break;
		}
		case "control": {
			//Mirror the change on the opposite side control point
			//There are, broadly speaking, two possibilities, in two forms:
			//1) We're dragging the first control point - look at the previous curve
			//2) We're dragging the second control point - look at the next curve
			//Possibility 1: The other curve is a line
			//Possibility 2: The other curve is cubic Bezier
			const other = curves[el.curve + (el.index ? 1 : -1)];
			if (!other) break; //eg dragging the last control point on the last node
			//If we're index 0 (first point), our reference point is the start of the
			//current curve; otherwise, our reference is the start of the next curve.
			const origin = curves[el.curve + el.index];
			if (other.points.length === 1) {
				//We're dragging a control point opposite a line. Lock this point
				//to being inline with the previous line. That means that the triple
				//of [other, curves[el.curve], el] needs to be colinear (if first
				//control point - otherwise [el, curves[el.curve], other], but that's
				//effectively the same thing anyway).
				if (el.curve === 1 && !el.index) break; //Immediately after the start node, we have full freedom.
				//Dragging the first control point references the origin of the next line;
				//dragging the second references the destination of the previous line.
				const counterpart = el.index ? other.points[0] : other;
				const x1 = origin.x - counterpart.x, y1 = origin.y - counterpart.y;
				const angle1 = Math.atan2(y1, x1);
				//Ensure that the current point remains in the same line.
				//Project the current point onto the same line by calculating the dot product.
				//Everything seems to say that the projection is simply x1*x2+y1*y2, but this
				//always gives me a result that's wrong by a factor of the length of the
				//counterpart-origin vector. I'm not sure whether it's my understanding of the
				//dot product, my implementation here, or something else, that has the flaw,
				//but the upshot is that we can calculate this by just dividing through by
				//the Pythagorean length.
				const x2 = el.x - origin.x, y2 = el.y - origin.y;
				//Calculate with trignometry
				//const angle2 = Math.atan2(y2, x2);
				//const length = Math.sqrt(x2*x2 + y2*y2) * Math.cos(angle2 - angle1);
				//Calculate directly with the rectangular coordinates
				const length2 = (x1 * x2 + y1 * y2) / Math.sqrt(x1*x1 + y1*y1);
				//Based on this length, pick a desired target location.
				const len = Math.max(length2, 1.0); //Never go backwards; for convenience, always have the control point a little ahead.
				el.x = origin.x + len * Math.cos(angle1);
				el.y = origin.y + len * Math.sin(angle1);
			}
			else {
				//We're dragging a control point opposite another curve. Follow the
				//movement with the final control point of the other curve.
				const counterpart = other.points[0|!el.index];
				counterpart.x = 2 * origin.x - el.x;
				counterpart.y = 2 * origin.y - el.y;
			}
		}
		default: break;
	}
	calc_min_curve_radius();
	repaint();
}

canvas.addEventListener("pointermove", e => {
	if (dragging) {
		update_element_position(dragging, e.offsetX - dragbasex, e.offsetY - dragbasey);
		canvas.style.cursor = "pointer";
	}
	else if (element_at_position(e.offsetX, e.offsetY, el => !el.fixed))
		canvas.style.cursor = "pointer";
	else canvas.style.cursor = null;
	if (state.shownearest && !animating) {
		let bestdist = -1;
		curves.forEach((c, i) => {
			const points = get_curve_points(i);
			for (let t = 0; t <= 1; t += 1/RESOLUTION) {
				const p = interpolate(points, t);
				const dist = (p.x - e.offsetX) ** 2 + (p.y - e.offsetY) ** 2;
				if (bestdist < 0 || dist < bestdist) {
					bestdist = dist;
					highlight_curve = i;
					highlight_t_value = t;
				}
			}
		});
		repaint();
	}
});

canvas.addEventListener("pointerup", e => {
	if (!dragging) return;
	e.target.releasePointerCapture(e.pointerId);
	const el = dragging; dragging = null;
	update_element_position(el, e.offsetX - dragbasex, e.offsetY - dragbasey);
});

DOM("#canvasborder").addEventListener("wheel", e => {
	console.log(e);
	if (e.ctrlKey || e.shiftKey) {
		e.preventDefault();
		if (e.shiftKey) zoomlevel += e.wheelDelta / 5; //Ctrl-Shift (or just Shift) for finer scroll zoom
		else zoomlevel += e.wheelDelta;
		const scale = Math.exp(zoomlevel / 500); //Tweak the number 500 to adjust zoom scaling
		//NOTE: This is sometimes leaving scroll bars even when the scale is set to 1. Not sure why.
		//Fiddling with the zoom level can remove them again. It's weird.
		canvas.style.transform = "scale(" + scale + ")";
	}
});
//Can we get PS-style "hold space and move mouse to pan"?
