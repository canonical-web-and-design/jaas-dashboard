import React, { useRef, useEffect } from "react";
import * as d3 from "d3";

import { generateIconPath } from "app/utils";

/**
  Returns whether the application is a subordinate.
  @param {Object} app The application status object.
  @returns {Boolean} If the application is a subordinate.
*/
const isSubordinate = app => app.subordinateTo.length > 0;

/**
  Computes the maximum delta from 0 for both the x and y axis. This is necessary
  because there are no restrictions on placing applications in a bundle at
  negative indexes.
  @param {Object} annotations The annotations object from the model status.
  @returns {Object} The deltas for x and y in the keys { deltaX, deltaY }.
*/
const computePositionDelta = annotations => {
  let deltaX = null;
  let deltaY = null;

  if (!annotations) {
    return { deltaX, deltaY };
  }

  Object.keys(annotations).forEach(appName => {
    const { "gui-x": guiX, "gui-y": guiY } = annotations[appName];
    const x = parseFloat(guiX);
    const y = parseFloat(guiY);
    if (!isNaN(x) && (deltaX === null || x < deltaX)) {
      deltaX = x;
    }
    if (!isNaN(y) && (deltaY === null || y < deltaY)) {
      deltaY = y;
    }
  });

  return { deltaX, deltaY };
};

/**
  Retrieve the X and Y annotation with the highest value.
  @param {Object} annotations The annotations object from the model status.
  @returns {Object} The value of the annotation with the highest X and Y value.
*/
const computeMaxXY = annotations => {
  let maxY = 0;
  let maxX = 0;
  if (!annotations) {
    return { maxX, maxY };
  }

  Object.keys(annotations).forEach(appName => {
    const { "gui-x": guiX, "gui-y": guiY } = annotations[appName];
    const y = parseFloat(guiY);
    const x = parseFloat(guiX);
    if (!isNaN(x) && x > maxX) {
      maxX = x;
    }
    if (!isNaN(y) && y > maxY) {
      maxY = y;
    }
  });

  return { maxX, maxY };
};

/**
  Applies the supplied delta to the supplied position. Both inputs are parsed
  as floats.
  @param {Number} position
  @param {Number} delta
  @returns {Float} The position value with the delta applied.
*/
const applyDelta = (position, delta) =>
  parseFloat(position) + -parseFloat(delta);

export default function Topology({ modelData, width, height }) {
  const ref = useRef();

  const { deltaX, deltaY } = computePositionDelta(
    modelData && modelData.annotations
  );

  const applications =
    (modelData &&
      Object.keys(modelData.applications).map(appName => ({
        ...modelData.annotations[appName],
        ...modelData.applications[appName],
        name: appName
      }))) ||
    [];

  // Apply deltas to the annotations.
  for (const appName in applications) {
    const application = applications[appName];
    if (application["gui-x"]) {
      application["gui-x"] = applyDelta(application["gui-x"], deltaX);
    }
    if (application["gui-y"]) {
      application["gui-y"] = applyDelta(application["gui-y"], deltaY);
    }
  }

  let { maxX, maxY } = computeMaxXY(modelData && modelData.annotations);
  if (maxX === 0) {
    // If there is no maxX then all of the icons are unplaced
    // so set a maximum width.
    maxX = 500;
  }

  useEffect(() => {
    const topo = d3
      .select(ref.current)
      .attr("width", width)
      .attr("height", height)
      .append("g");

    const appIcons = topo.selectAll(".application").data(applications);

    let gridCount = {
      x: 0,
      y: maxY
    };

    const appIcon = appIcons
      .enter()
      .append("g")
      .attr("transform", d => {
        const x = d["gui-x"] !== undefined ? d["gui-x"] : gridCount.x;
        const y = d["gui-y"] !== undefined ? d["gui-y"] : gridCount.y;
        gridCount.x += 250;
        // Let the placed units determine the max width of the visualization.
        // and move the grid units to a new line.
        if (gridCount.x > maxX) {
          gridCount.x = 0;
          gridCount.y += 200;
        }

        return `translate(${x}, ${y})`;
      });

    appIcon
      .classed("application", true)
      .attr("data-name", d => d.name)
      .append("circle")
      .attr("cx", d => (isSubordinate(d) ? 60 : 90))
      .attr("cy", d => (isSubordinate(d) ? 60 : 90))
      .attr("r", d => (isSubordinate(d) ? 60 : 90))
      .attr("fill", "#f5f5f5")
      .attr("stroke-width", 1)
      .attr("stroke", "#888888")
      .call(() => {
        // When ever a new element is added zoom the canvas to fit.
        const {
          width: svgWidth,
          height: svgHeight
        } = topo.node().getBoundingClientRect();
        if (svgWidth > 0 && svgHeight > 0) {
          // Magic number that presents reasonable padding around the viz.
          const padding = 200;
          const scale = Math.min(
            width / (svgWidth + padding),
            height / (svgHeight + padding)
          );
          const translateX = (width - svgWidth * scale) / 2;
          const translateY = (height - svgHeight * scale) / 2;
          topo.attr(
            "transform",
            `translate(${translateX},${translateY}) scale(${scale},${scale})`
          );
        }
      });

    appIcon
      .append("image")
      .attr("xlink:href", d => generateIconPath(d.charm))
      .attr("width", 96)
      .attr("height", 96)
      .attr("transform", d =>
        isSubordinate(d) ? "translate(17, 17)" : "translate(47, 47)"
      );

    appIcons.exit().remove();

    return () => {
      topo.remove();
    };
  }, [applications, deltaX, deltaY, height, width, maxX, maxY]);
  return <svg ref={ref} />;
}
