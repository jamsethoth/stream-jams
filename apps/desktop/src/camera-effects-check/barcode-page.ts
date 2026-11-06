import { opticalColumns, opticalGuide, opticalRows } from "./frame-layout.js";
import { encodeOpticalBits } from "./optical-code.js";

/*
 * The timing screen: the clock as a grid of large cells, shaped like the dashed guide box in
 * the pipeline window so it fills the box when the camera frames it. Receivers read it back.
 */

const grid = document.getElementById("grid") as HTMLDivElement;
grid.style.gridTemplateColumns = `repeat(${opticalColumns}, 1fr)`;
const cells = Array.from({ length: opticalColumns * opticalRows }, () => grid.appendChild(document.createElement("div")));
// The guide covers this share of a 16:9 picture, so the grid keeps the same proportions.
const aspect = (opticalGuide.width * 16) / (opticalGuide.height * 9);

function fit(): void {
  const width = Math.min(innerWidth * 0.94, innerHeight * 0.86 * aspect);
  Object.assign(grid.style, { width: `${width}px`, height: `${width / aspect}px`, left: `${(innerWidth - width) / 2}px`, top: `${(innerHeight - width / aspect) / 2}px` });
}
addEventListener("resize", fit);
fit();

function paint(): void {
  encodeOpticalBits(Date.now()).forEach((bit, index) => { cells[index]!.style.background = bit ? "#000" : "#fff"; });
  requestAnimationFrame(paint);
}
paint();
