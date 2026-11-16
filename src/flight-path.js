export const FLIGHT = Object.freeze({ startZ: 21, endZ: -108, gardenZ: -50, treeZ: -126 });
export const PANEL_STOPS = Object.freeze([0, .36, .88, 1]);
export const SCENE_STOPS = Object.freeze([0, .36, .88]);
export const clampProgress = value => Math.max(0, Math.min(1, value));
const smooth = (value, a, b) => { const t=clampProgress((value-a)/(b-a)); return t*t*(3-2*t); };
export function flightFov(aspect,mobile=false) {
  return Math.min(60,Math.max(mobile?40:31,2*Math.atan(Math.tan(26*Math.PI/180)/aspect)*180/Math.PI));
}
export function flightState(progress) {
  const p=clampProgress(progress);
  // Ease to a stop in front of the tree while the final contact overlay opens.
  const arrival=clampProgress((p-.85)/.12);
  const route=p<=.85?p:.85+.06*(2*arrival-arrival*arrival);
  const z=p>=.97?FLIGHT.endZ:FLIGHT.startZ+(FLIGHT.endZ-FLIGHT.startZ)*(route/.91);
  return {
    progress:p, z,
    // Habitats remain in the world. Frustum/depth attenuation governs visibility.
    hero:1,
    garden:1,
    tree:1,
    gardenMood:smooth(p,.19,.34)*(1-smooth(p,.67,.85)),
    treeMood:smooth(p,.67,.87),
    stage:p*3.0,
    scene:p<.24?0:p<.72?1:2
  };
}
export function wheelTravel(delta, mode, viewportHeight) {
  const pixels=delta*(mode===1?16:mode===2?viewportHeight:1);
  return Math.max(-.085,Math.min(.085,pixels/6500));
}
export function panelPresentation(progress, index, reducedMotion=false) {
  const relative=progress-PANEL_STOPS[index];
  const width=index===0?.14:index===PANEL_STOPS.length-1?.06:.044;
  const opacity=1-smooth(Math.abs(relative),width*.38,width);
  return {opacity,depth:0};
}
