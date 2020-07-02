import React from "react";
import classnames from "classnames";
import { URL } from "@canonical/jaaslib/lib/urls";

import defaultCharmIcon from "static/images/icons/default-charm-icon.svg";

import {
  extractRevisionNumber,
  generateStatusElement,
  generateIconPath,
  generateSpanClass,
} from "app/utils";

export const applicationTableHeaders = [
  { content: "app" },
  { content: "status" },
  { content: "version", className: "u-align--right" },
  { content: "scale", className: "u-align--right" },
  { content: "store" },
  { content: "rev", className: "u-align--right" },
  { content: "os" },
  { content: "notes" },
];

export const unitTableHeaders = [
  { content: "unit" },
  { content: "workload" },
  { content: "agent" },
  { content: "machine", className: "u-align--right" },
  { content: "public address" },
  { content: "port", className: "u-align--right" },
  { content: "message" },
];

export const machineTableHeaders = [
  { content: "machine" },
  { content: "state" },
  { content: "az" },
  { content: "instance id" },
  { content: "message" },
];

export const relationTableHeaders = [
  { content: "relation provider" },
  { content: "requirer" },
  { content: "interface" },
  { content: "type" },
  { content: "message" },
];

export function generateIconImg(name, namespace, baseAppURL) {
  let iconSrc = defaultCharmIcon;
  if (namespace.indexOf("local:") !== 0) {
    iconSrc = generateIconPath(namespace);
  }
  return (
    <img
      alt={name + " icon"}
      width="24"
      height="24"
      className="entity-icon"
      src={iconSrc}
    />
  );
}

export function generateEntityLink(namespace, name, subordinate, baseAppURL) {
  let charmStorePath = "";
  try {
    charmStorePath = URL.fromAnyString(namespace).toString().replace("cs:", "");
  } catch (e) {
    console.error("unable to parse charmstore path", e);
  }

  return (
    <>
      {subordinate && <span className="subordinate"></span>}
      {namespace && generateIconImg(name, namespace, baseAppURL)}
      {/* Ensure app is not a local charm */}
      {namespace.includes("cs:") ? (
        <a
          data-test="app-link"
          target="_blank"
          rel="noopener noreferrer"
          href={`https://www.jaas.ai/${charmStorePath}`}
        >
          {name}
        </a>
      ) : (
        name
      )}
    </>
  );
}

export function generateApplicationRows(
  modelStatusData,
  filterByApp,
  onRowClick,
  baseAppURL
) {
  if (!modelStatusData) {
    return [];
  }

  const applications = modelStatusData.applications;
  return Object.keys(applications).map((key) => {
    const app = applications[key];
    return {
      columns: [
        {
          "data-test-column": "name",
          content: generateEntityLink(app.charm || "", key, false, baseAppURL),
          className: "u-truncate",
        },
        {
          "data-test-column": "status",
          content: app.status ? generateStatusElement(app.status.status) : "-",
          className: "u-capitalise u-truncate",
        },
        {
          "data-test-column": "version",
          content: app.workloadVersion || "-",
          className: "u-align--right",
        },
        {
          "data-test-column": "scale",
          content: app.unitsCount,
          className: "u-align--right",
        },
        {
          "data-test-column": "store",
          content: app.charm.indexOf("local:") === 0 ? "Local" : "CharmHub",
        },
        {
          "data-test-column": "revision",
          content: extractRevisionNumber(app.charm) || "-",
          className: "u-align--right",
        },
        { "data-test-column": "os", content: "Ubuntu" },
        { "data-test-column": "notes", content: "-" },
      ],
      className: filterByApp === key ? "is-selected" : "",
      onClick: onRowClick,
      "data-app": key,
    };
  });
}

export function generateUnitRows(modelStatusData, filterByApp, baseAppURL) {
  if (!modelStatusData) {
    return [];
  }

  const applications = modelStatusData.applications;
  const unitRows = [];
  Object.keys(applications).forEach((applicationName) => {
    const units = applications[applicationName].units || [];
    Object.keys(units).forEach((unitId) => {
      const unit = units[unitId];
      unitRows.push({
        columns: [
          {
            content: generateEntityLink(
              applications[applicationName].charm
                ? applications[applicationName].charm
                : "",
              unitId,
              false,
              baseAppURL
            ),
            className: "u-truncate",
          },
          {
            content: generateStatusElement(unit.workloadStatus.status),
            className: "u-capitalise",
          },
          { content: unit.agentStatus.status },
          { content: unit.machine, className: "u-align--right" },
          { content: unit.publicAddress },
          {
            content: unit.openedPorts.join(" ") || "-",
            className: "u-align--right",
          },
          {
            content: (
              <span title={unit.workloadStatus.info}>
                {unit.workloadStatus.info}
              </span>
            ),
            className: "u-truncate",
          },
        ],
        className: filterByApp === unitId.split("/")[0] ? "is-selected" : "",
      });

      const subordinates = unit.subordinates;

      if (subordinates) {
        for (let [key] of Object.entries(subordinates)) {
          const subordinate = subordinates[key];
          unitRows.push({
            columns: [
              {
                content: generateEntityLink(
                  subordinate.charm,
                  key,
                  true,
                  baseAppURL
                ),
                className: "u-truncate",
              },
              {
                content: generateStatusElement(
                  subordinate["workload-status"].status
                ),
                className: "u-capitalise",
              },
              { content: subordinate["agent-status"].status },
              { content: subordinate.machine, className: "u-align--right" },
              { content: subordinate["public-address"] },
              {
                content: subordinate["public-address"].split(":")[-1] || "-",
                className: "u-align--right",
              },
              {
                content: subordinate["workload-status"].info,
                className: "u-truncate",
              },
            ],
            className: classnames("subordinate-row", {
              "is-selected": filterByApp === key.split("/")[0],
            }),
          });
        }
      }
    });
  });

  return unitRows;
}

const splitParts = (hardware) =>
  Object.fromEntries(
    hardware.split(" ").map((item) => {
      const parts = item.split("=");
      return [parts[0], parts[1]];
    })
  );

export function generateMachineRows(modelStatusData, filterByApp) {
  if (!modelStatusData) {
    return [];
  }

  const machines = modelStatusData.machines;
  return Object.keys(machines).map((machineId) => {
    const machine = machines[machineId];
    return {
      columns: [
        {
          content: (
            <>
              <div>
                {machineId}
                <span className="u-capitalise">. {machine.series}</span>
              </div>
              <a href="#_">{machine.dnsName}</a>
            </>
          ),
        },
        {
          content: generateStatusElement(machine.agentStatus.status),
          className: "u-capitalise",
        },
        { content: splitParts(machine.hardware)["availability-zone"] },
        { content: machine.instanceId },
        {
          content: (
            <span title={machine.agentStatus.info}>
              {machine.agentStatus.info}
            </span>
          ),
          className: "u-truncate",
        },
      ],
      // If there is a filter provided and the machine is visible then
      // it's been filtered so we want to highlight it.
      className: classnames({ "is-selected": !!filterByApp }),
    };
  });
}

const extractRelationEndpoints = (relation) => {
  const endpoints = {};
  relation.endpoints.forEach((endpoint) => {
    const role = endpoint.role;
    endpoints[role] = endpoint.application + ":" + endpoint.name;
    endpoints[`${role}ApplicationName`] = endpoint.application;
  });
  return endpoints;
};

const generateRelationIconImage = (
  applicationName,
  modelStatusData,
  baseAppURL
) => {
  const application = modelStatusData.applications[applicationName];
  if (!application || !applicationName) {
    return;
  }
  return generateIconImg(applicationName, application.charm, baseAppURL);
};

export function generateRelationRows(modelStatusData, filterByApp, baseAppURL) {
  if (!modelStatusData) {
    return [];
  }

  const relations = modelStatusData.relations;
  return Object.keys(relations).map((relationId) => {
    const relation = relations[relationId];
    const {
      provider,
      requirer,
      peer,
      providerApplicationName,
      requirerApplicationName,
      peerApplicationName,
    } = extractRelationEndpoints(relation);

    return {
      columns: [
        {
          content: (
            <>
              {generateRelationIconImage(
                providerApplicationName || peerApplicationName,
                modelStatusData,
                baseAppURL
              )}
              {provider || peer || "-"}
            </>
          ),
          className: "u-truncate",
        },
        {
          content: (
            <>
              {generateRelationIconImage(
                requirerApplicationName,
                modelStatusData,
                baseAppURL
              )}
              {requirer || "-"}
            </>
          ),
          title: requirer || "-",
          className: "u-truncate",
        },
        { content: relation.interface },
        { content: relation.endpoints[0].role },
        {
          content: generateSpanClass(
            "u-capitalise--first-letter",
            relation.status.status
          ),
        },
      ],
      // If there is a filter provided and the relation is visible then
      // it's been filtered so we want to highlight it.
      className: classnames({ "is-selected": !!filterByApp }),
    };
  });
}
