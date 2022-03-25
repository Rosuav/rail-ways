import choc, {set_content, DOM, on, fix_dialogs} from "https://rosuav.github.io/shed/chocfactory.js";
const {A, BUTTON, IMG, INPUT, LABEL, SCRIPT, SPAN, TD, TR} = choc; //autoimport
fix_dialogs({close_selector: ".dialog_cancel,.dialog_close", click_outside: "formless"});

const RESOLUTION = 256; //Spread this many points across the curve to do our calculations

const state = { }, options = { };
const state_configs = [
	{kwd: "allowdrag", lbl: "Allow drag", dflt: true, title: "Allow nodes to be dragged around. Disable for protection."},
	{kwd: "pananywhere", lbl: "Pan w/ mouse", dflt: false, title: "If unchecked, hold Space and drag to move the view."},
	{kwd: "shownearest", lbl: "Highlight a point", dflt: false, title: "Mark a point, either by mouse or by animation"},
	{kwd: "shownearestlines", lbl: "... with lerp lines", dflt: false, depend: "shownearest", title: "Show the construction lines to the highlighted point"},
	{kwd: "shownearestvectors", lbl: "... with vectors", dflt: false, depend: "shownearest", title: "Show speed, acceleration, and jerk at the highlighted point"},
	{kwd: "shownearestcircle", lbl: "... and circle", dflt: false, depend: "shownearestvectors", title: "Show osculating circle at the highlighted point"},
	{kwd: "showminimum", lbl: "Show tightest curve", dflt: false, title: "Show osculating circle at the point where it's the tightest"},
];
set_content("#options", state_configs.map(o => LABEL({title: o.title}, [
	INPUT({type: "checkbox", "data-kwd": o.kwd, checked: state[o.kwd] = o.dflt}),
	o.lbl,
])));
const _statelookup = { };
state_configs.forEach(s => {_statelookup[s.kwd] = s; s.rdepend = []; if (s.depend) _statelookup[s.depend].rdepend.push(s.kwd);});
on("click", "#options input", e => {
	state[e.match.dataset.kwd] = e.match.checked;
	if (e.match.checked) {
		//Ensure that dependencies are also checked.
		let s = _statelookup[e.match.dataset.kwd];
		while (s.depend && !state[s.depend]) {
			DOM("[data-kwd=" + s.depend + "]").checked = state[s.depend] = true;
			s = _statelookup[s.depend];
		}
	} else {
		function cleartree(kwd) {
			if (state[kwd]) DOM("[data-kwd=" + kwd + "]").checked = state[kwd] = false;
			_statelookup[kwd].rdepend.forEach(cleartree);
		}
		cleartree(e.match.dataset.kwd);
	}
	repaint();
});

const option_configs = [{
	kwd: "filename", label: "File name:",
	dflt: "railways-export.json",
	attrs: {size: 20},
},{
	kwd: "radius", label: "Node size",
	dflt: "6",
	attrs: {type: "number"},
	paths: 1, repaint: 1,
},{
	kwd: "crosshair", label: "Crosshair",
	dflt: "9",
	attrs: {type: "number"},
	paths: 1, repaint: 1,
},{
	kwd: "trackwidth", label: "Track width",
	dflt: "1",
	attrs: {type: "number"},
	repaint: 1,
}];
set_content("#optlist", option_configs.map(opt => TR([
	TD(LABEL({htmlFor: "opt-" + opt.kwd}, opt.label)),
	TD([
		INPUT({id: "opt-" + opt.kwd, value: options[opt.kwd] = opt.dflt || "", ...(opt.attrs||{})}),
		" ", opt.comment || "",
	]),
])));

const canvas = DOM("canvas");
const ctx = canvas.getContext('2d');
let background_image = null;
//Google Maps origin information represents where our (0,0) lies at scale == 1
let google_map = null, gmap_lat = -37.89, gmap_lng = 145.0365, gmap_zoom = 15.5;
let gmap_lat_per_pixel = 0, gmap_lng_per_pixel = 0;
const curves = [
/*	{degree: 1, points: [{x: 500, y: 400}]},
	{degree: 3, points: [{x: 600, y: 500}, {x: 450, y: 550}, {x: 450, y: 500}]},
	{degree: 1, points: [{x: 450, y: 450}]},
	{degree: 3, points: [{x: 450, y: 200}, {x: 50, y: 400}, {x: 50, y: 50}]},*/
	//Sample curves drawing around a couple of fields in Oakleigh
	{points: [{x: 725.5720959650533, y:499.88724884356253}]},
	{points: [{x: 674.9609801260359, y:509.91442590672},{x:669.4337896124417,y:462.1979882581519},{x:709.73055809553,y:460.438558488099}]},
	{points: [{x: 750.0273265786183, y:458.67912871804606},{x:741.7460607406806,y:435.1961950315216},{x:767.2450572709491,y:442.77939871391413}]},
	{points: [{x: 792.7440538012177, y:450.36260239630667},{x:787.2445101140097,y:488.9386291076728},{x:769.120008597086,y:492.37279666824475}]},
	{points: [{x: 750.9955070801623, y:495.8069642288167},{x:761.4663352455887,y:495.30935270694806},{x:737.4546800716475,y:477.50254041722786}]},
];
let elements = []; //Flattening of all point objects curves[*].points[*], and others if clickable
function rebuild_elements() {
	const el = [];
	if (background_image) el.push({type: "image", x: 0, y: 0, img: IMG({src: background_image, onload: repaint}), fixed: true});
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

function add_curve(degree) {
	const last = curves[curves.length - 1];
	const end = last.points[last.points.length - 1];
	let prev;
	if (last.points.length > 1) prev = last.points[last.points.length - 2];
	else if (curves.length > 1) {
		const c = curves[curves.length - 2];
		prev = c.points[c.points.length - 1];
	}
	else prev = {x: end.x, y: end.y + 100}; //Otherwise, we're starting fresh. Move straight up, whatever.
	//To keep the angle but limit the length:
	//const angle = Math.atan2(end.y - prev.y, end.x - prev.x);
	//const dist = 150 / degree;
	//const dx = Math.cos(angle) * dist, dy = Math.sin(angle) * dist;
	//Or to just go with mirrored length:
	const dx = end.x - prev.x, dy = end.y - prev.y;
	const points = [];
	for (let i = 1; i <= degree; ++i) points.push({x: end.x + dx * i, y: end.y + dy * i});
	curves.push({degree, points});
	rebuild_elements();
	repaint();
}

const element_types = {
	start: {color: "#a0f0c080", radius: -1, crosshair: -1},
	control: {color: "#66339980", radius: -1, crosshair: -1},
	end: {color: "#a0f0c080", radius: -1, crosshair: -1},
	next: {color: "#a0f0c080", radius: -1, crosshair: -1},
	nearest: {color: "#aaaa2280", radius: 3.5, crosshair: 0},
};
let highlight_curve = 0, highlight_t_value = 0.0;
let tightest_curve = 0, minimum_curve_radius = 0.0;
let animating = 0, animation_timer = null;

let path_cache = { };
function element_path(el) {
	let name = el.type;
	if (name === "image") name += el.img.naturalWidth + "x" + el.img.naturalHeight;
	if (path_cache[name]) return path_cache[name];
	const path = new Path2D;
	if (el.type === "image") {
		path.rect(0, 0, el.img.naturalWidth, el.img.naturalHeight);
		return path_cache[name] = path;
	}
	const t = element_types[el.type] || { };
	let rad = t.radius || 5; if (rad === -1) rad = +options.radius;
	let ch = t.crosshair; if (ch === -1) ch = +options.crosshair;
	path.arc(0, 0, rad, 0, 2*Math.PI);
	if (ch) {
		path.moveTo(-ch, 0);
		path.lineTo(ch, 0);
		path.moveTo(0, -ch);
		path.lineTo(0, ch);
	}
	path.closePath();
	return path_cache[name] = path;
}
let dragging = null, dragbasex = 50, dragbasey = 10;

function draw_at(ctx, el) {
	if (el.type === "image") {
		//Special case: an image has no path, just the IMG object
		ctx.drawImage(el.img, el.x|0, el.y|0);
		return;
	}
	const path = element_path(el);
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
let zoomlevel = 0, scale = 1;
let translate_x = 0, translate_y = 0;
function window_to_virtual(x, y) {return [x / scale - translate_x, y / scale - translate_y];}
function virtual_to_window(x, y) {return [(x+translate_x) * scale, (y+translate_y) * scale];}

function repaint() {
	canvas.height = canvas.offsetHeight; canvas.width = canvas.offsetWidth;
	//Adjust the underlying map to be centered on our centerpoint
	if (google_map) {
		const [ctrx, ctry] = window_to_virtual(canvas.width / 2, canvas.height / 2);
		google_map.setCenter({
			lat: gmap_lat - gmap_lat_per_pixel * ctry,
			lng: gmap_lng + gmap_lng_per_pixel * ctrx,
		});
	}
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	ctx.lineWidth = options.trackwidth;
	ctx.save();
	ctx.scale(scale, scale);
	ctx.translate(translate_x|0, translate_y|0);
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
		ctx.lineWidth = options.trackwidth;
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
	if (dragging) { //Anything being dragged gets drawn last, ensuring it is at the top of z-order.
		let curve = -1;
		if (dragging.type === "start" || dragging.type === "end" || dragging.type === "next")
			//While dragging a node, draw the lines to its associated control points.
			curve = dragging.curve;
		else if (dragging.type === "control")
			//Similarly, when dragging a control point, draw lines to the connected node.
			curve = dragging.curve - !dragging.index;
		if (curve >= 0) {
			ctx.save();
			const c = curves[curve];
			const path = new Path2D; //I should be able to draw directly, without a Path, but whatever.
			if (c.points.length > 1)
				//This is the end of a curve, so connect to the last control point.
				path.moveTo(c.points[1].x, c.points[1].y);
			else path.moveTo(c.x, c.y);
			const next = curves[curve + 1];
			if (next && next.points.length > 1)
				//This is the start of a curve. Ditto, the first control point of the next curve.
				path.lineTo(next.points[0].x, next.points[0].y);
			else if (c.points.length > 1)
				path.lineTo(c.points[2].x, c.points[2].y);
			//Else neither of them has anything, so no line needed.
			ctx.strokeStyle = "#888";
			ctx.stroke(path);
			ctx.restore();
		}
		draw_at(ctx, dragging);
	}
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
		//TODO: Have a "dirty" flag on a curve, and don't do these recalculations
		//if the curve hasn't changed.
		if (c.points.length === 1) {
			c.curve_length = Math.sqrt((c.points[0].x - c.x) ** 2 + (c.points[0].y - c.y) ** 2);
			return;
		}
		const points = get_curve_points(i);
		const [k, t] = find_min_curve_radius(points);
		if (k > tightest) {
			tightest_curve = i;
			minimum_curve_radius = t;
			tightest = k;
		}
		//While we're at it, let's get some point samples so we can animate more smoothly.
		//Step 1: Sample the curve at some t-values and estimate curve length by line distance.
		let dist = 0, last_point = points[0];
		const curve_length = [];
		const probe_span = 8/RESOLUTION;
		for (let t = probe_span; t <= 1; t += probe_span) {
			const p = interpolate(points, t);
			dist += Math.sqrt((p.x - last_point.x) ** 2 + (p.y - last_point.y) ** 2);
			curve_length.push(dist);
			last_point = p;
		}
		c.curve_length = dist;
		//Step 2: Pick some equidistant length points and linearly interpolate within those
		//t-values to find some useful reference points. It's not going to be perfect - in fact,
		//it's inaccurate on two levels - but hopefully, with good enough resolution, it can
		//be accurate enough to make the animation look smooth.
		//TODO: Figure out a pixels-per-second animation speed, then measure points to make that
		//possible. The actual animation loop will still interpolate within there.
	});
}
calc_min_curve_radius();
repaint();

function element_at_position(x, y, filter) {
	for (let el of elements) {
		if (filter && !filter(el)) continue;
		if (ctx.isPointInPath(element_path(el), x - el.x, y - el.y)) return el;
	}
}

canvas.addEventListener("pointerdown", e => {
	if (!state.allowdrag) return;
	if (e.button) return; //Only left clicks
	e.preventDefault();
	dragging = null;
	const [x, y] = window_to_virtual(e.offsetX, e.offsetY);
	let el = element_at_position(x, y, el => !el.fixed);
	if (!el) return;
	e.target.setPointerCapture(e.pointerId);
	dragging = el; dragbasex = x - el.x; dragbasey = y - el.y;
	canvas.style.cursor = "grabbing";
});

function update_element_position(el, x, y, adjust) {
	if (adjust) {x += el.x; y += el.y;} //Adjustment: provide dx,dy instead of x,y
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
				update_element_position(c.points[1], dx, dy, 1);
			}
			else {
				const prev = curves[el.curve - 1];
				if (prev && prev.points.length > 1)
					update_element_position(prev.points[1], 0, 0, 1);
			}
			const next = curves[el.curve + 1];
			if (next) {
				//There's no next on the end node.
				next.x = x; next.y = y;
				if (next.points.length > 1) {
					//Carry the first control point of the following curve too.
					update_element_position(next.points[0], dx, dy, 1);
				}
				else {
					//We're dragging a node that is followed by a line.
					//If it's followed by a curve after that, poke the first control
					//point of that curve, to validate colinearity.
					const nextnext = curves[el.curve + 2];
					if (nextnext && nextnext.points.length > 1)
						update_element_position(nextnext.points[0], 0, 0, 1);
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
			else if (!adjust) {
				//We're dragging a control point opposite another curve. Follow the
				//movement with the final control point of the other curve.
				//Note that we do NOT do this if we're already a recursive call for
				//adjustment after another movement.
				const counterpart = other.points[0|!el.index];
				counterpart.x = 2 * origin.x - el.x;
				counterpart.y = 2 * origin.y - el.y;
			}
		}
		default: break;
	}
	if (!adjust) {calc_min_curve_radius(); repaint();}
}

let space_held = false, last_pointer_x = 0, last_pointer_y = 0;
function movemode(nowheld) {
	space_held = nowheld;
	canvas.style.cursor = space_held ? "move" :
		dragging ? "grabbing" :
		state.allowdrag && element_at_position(last_pointer_x, last_pointer_y, el => !el.fixed) ? "grab" :
		state.pananywhere ? "move" : //TODO: Only show this cursor if a mouse button is held down?
		null;
}
document.addEventListener("keydown", e => e.key === " " && [movemode(true), e.preventDefault()]);
document.addEventListener("keyup", e => e.key === " " && [movemode(false), e.preventDefault()]);

canvas.addEventListener("pointermove", e => {
	const [x, y] = window_to_virtual(e.offsetX, e.offsetY);
	if (space_held || (state.pananywhere && !dragging && e.buttons)) {
		translate_x += x - last_pointer_x;
		translate_y += y - last_pointer_y;
		repaint();
	}
	else {last_pointer_x = x; last_pointer_y = y;} //If you're panning the map, your effective location isn't changing.
	movemode(space_held); //Update mouse cursor
	if (dragging) update_element_position(dragging, x - dragbasex, y - dragbasey);
	if (state.shownearest && !animating) {
		let bestdist = -1;
		curves.forEach((c, i) => {
			const points = get_curve_points(i);
			for (let t = 0; t <= 1; t += 1/RESOLUTION) {
				const p = interpolate(points, t);
				const dist = (p.x - x) ** 2 + (p.y - y) ** 2;
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
	const [x, y] = window_to_virtual(e.offsetX, e.offsetY);
	e.target.releasePointerCapture(e.pointerId);
	const el = dragging; dragging = null;
	update_element_position(el, x - dragbasex, y - dragbasey);
	canvas.style.cursor = "grab"; //Assume that the cursor's still over a valid element
});

DOM("#canvasborder").addEventListener("wheel", e => {
	e.preventDefault();
	zoomlevel = Math.min(Math.max(zoomlevel + e.wheelDelta, -2000), 2000);
	const [x1, y1] = window_to_virtual(e.offsetX, e.offsetY);
	scale = Math.exp(zoomlevel / 500); //Tweak the number 500 to adjust zoom scaling
	const [x2, y2] = window_to_virtual(e.offsetX, e.offsetY);
	//Adjust the transform so that the point under the cursor hasn't moved.
	translate_x += x2 - x1; translate_y += y2 - y1;
	if (google_map) google_map.setZoom(gmap_zoom + Math.log2(scale));
	repaint();
});

set_content("#actions", [
	["Animate", () => {
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
	}],
	["Add line", () => add_curve(1)],
	["Add curve", () => add_curve(3)],
	["Export", () => {
		const data = ["{\n",
			'\t"options": ' + JSON.stringify({...options, filename: undefined}) + ",\n",
			background_image ? '\t"background": ' + JSON.stringify(background_image) + ",\n" : "",
			'\t"origin": ' + JSON.stringify([curves[0].points[0].x, curves[0].points[0].y]) + ",\n",
			'\t"curves": [\n',
		];
		curves.forEach((c,i) => i && data.push("\t\t" + JSON.stringify(c.points.map(p => [p.x, p.y])) + ",\n"));
		data[data.length - 1] = data[data.length - 1].replace(",\n", "\n"); //Remove the comma from the last one, because JSON
		data.push("\t]\n}\n");
		const blob = new Blob(data, {type: "application/json"});
		const url = URL.createObjectURL(blob);
		//If the user puts garbage in the field, the browser will sanitize it.
		A({href: url, download: options.filename || "railways-export.json"}).click();
		setTimeout(() => URL.revokeObjectURL(url), 60000); //Dispose of the blob after a minute - it should have finished by then
	}],
	["Import", () => DOM("#uploadjson").click()],
	["Options", () => DOM("#optionsdlg").showModal()],
].map(a => BUTTON({onclick: a[1]}, a[0])));

on("change", "#uploadjson", async e => {
	for (let f of e.match.files) {
		if (f.type.startsWith("image/")) {
			const r = new FileReader();
			r.onload = e => {background_image = e.currentTarget.result; rebuild_elements(); repaint();};
			r.readAsDataURL(f);
			if (!DOM("#filename").value) DOM("#filename").value = f.name + ".json";
			continue;
		}
		try {
			const data = JSON.parse(await f.text());
			if (typeof data !== "object" || !Array.isArray(data.origin) || !Array.isArray(data.curves)) continue;
			curves.length = 1;
			const origin = curves[0].points[0];
			[origin.x, origin.y] = data.origin;
			data.curves.forEach(c => {
				if (!Array.isArray(c) || (c.length !== 1 && c.length !== 3)) return;
				curves.push({degree: c.length, points: c.map(p => ({x: p[0], y: p[1]}))});
			});
			if (typeof data.background === "string") background_image = data.background;
			else background_image = null;
			const opts = typeof data.options === "object" ? data.options : { };
			opts.filename = f.name;
			option_configs.forEach(o =>
				DOM("#opt-" + o.kwd).value = options[o.kwd] = opts[o.kwd] || o.dflt || ""
			);
			path_cache = { };
			rebuild_elements();
			calc_min_curve_radius();
			repaint();
		}
		catch (e) {console.warn("Unable to parse JSON import file"); console.warn(e);} //TODO: Report failure to user
	}
	DOM("#uploadjson").value = "";
});

on("change", "#optlist input", e => {
	const opt = option_configs.find(o => e.match.id === "opt-" + o.kwd);
	if (!opt) return;
	options[opt.kwd] = e.match.value;
	if (opt.paths) path_cache = { };
	if (opt.elements) rebuild_elements();
	if (opt.repaint) repaint();
});

on("click", "#fullscreen", e => {
	if (document.fullscreenElement) document.exitFullscreen().then(repaint);
	else DOM("#canvasborder").requestFullscreen().then(repaint);
});

window.init_map = () => {
	google_map = new google.maps.Map(DOM("#map"), {
		zoom: 15.5,
		mapTypeId: "satellite",
		disableDefaultUI: true,
		isFractionalZoomEnabled: true,
	});
	google_map.addListener("bounds_changed", () => {
		const span = google_map.getBounds().toSpan();
		const div = google_map.getDiv();
		const lng = span.lng() / div.offsetWidth;
		const lat = span.lat() / div.offsetHeight;
		//~ if (lng !== gmap_lng_per_pixel || lat !== gmap_lat_per_pixel) { //Recalculate every time
		if (!gmap_lng_per_pixel) { //Just calculate once
			gmap_lng_per_pixel = lng;
			gmap_lat_per_pixel = lat;
			repaint();
		}
	});
	window.map = google_map; //Hack for analysis
	repaint();
};
const key = location.host === "rosuav.github.io" ? "AIzaSyCISseiStc59FATrS0AuZWRkk1_Nm5yyuI" //Prod (restricted to rosuav.github.io)
	: "AIzaSyAgf_KXIRUai0qvZNH5E_gpTaAe6Bjdcdc"; //Test (restricted to my IP address)
document.head.appendChild(SCRIPT({src: "https://maps.googleapis.com/maps/api/js?v=beta&key=" + key + "&callback=init_map"}));
