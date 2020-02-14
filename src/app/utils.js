import React from "react";

export const generateStatusElement = (status, count, useIcon = true) => {
  let statusClass = status ? `is-${status.toLowerCase()}` : "";
  let countValue = "";
  if (count !== undefined) {
    countValue = ` (${count})`;
  }
  const className = useIcon ? "status-icon " + statusClass : "";
  return (
    <span className={className}>
      {status}
      {countValue}
    </span>
  );
};

export const generateSpanClass = (className, value) => {
  return <span className={className}>{value}</span>;
};

// Highest status to the right
const statusOrder = ["running", "alert", "blocked"];

const setHighestStatus = (entityStatus, highestStatus) => {
  if (statusOrder.indexOf(entityStatus) > statusOrder.indexOf(highestStatus)) {
    return entityStatus;
  }
  return highestStatus;
};

// If it's the highest status then we don't need to continue looping
// applications or units.
const checkHighestStatus = highestStatus => {
  return highestStatus === statusOrder[statusOrder.length - 1];
};

export const getModelStatusGroupData = model => {
  let highestStatus = statusOrder[0]; // Set the highest status to the lowest.
  let messages = [];
  const applications = model.applications;
  Object.keys(applications).forEach(appName => {
    const app = applications[appName];
    const { status: appStatus } = getApplicationStatusGroup(app);
    highestStatus = setHighestStatus(appStatus, highestStatus);
    if (checkHighestStatus(highestStatus)) {
      // If it's the highest status then we want to store the message.
      messages.push(app.status.info);
      return;
    }
    Object.keys(app.units).forEach(unitId => {
      const unit = app.units[unitId];
      const { status: unitStatus } = getUnitStatusGroup(unit);
      highestStatus = setHighestStatus(unitStatus, highestStatus);
      if (checkHighestStatus(highestStatus)) {
        // If it's the highest status then we want to store the message.
        messages.push(unit.agentStatus.info);
        return;
      }
    });
  });
  return {
    highestStatus,
    messages
  };
};

/**
  Returns the status for the application.
  @param {Object} application The application to check the status of in the
    format stored in the redux store.
  @returns {Object} The status of the application and any relevent messaging.
*/
export const getApplicationStatusGroup = application => {
  // Possible "blocked" or error states in application statuses.
  const blocked = ["blocked"];
  // Possible "alert" states in application statuses.
  const alert = ["unknown"];
  const status = application.status.status;
  const response = {
    status: "running",
    message: null
  };
  if (blocked.includes(status)) {
    response.status = "blocked";
  }
  if (alert.includes(status)) {
    response.status = "alert";
  }
  return response;
};

/**
  Returns the status level for the machine.
  @param {Object} machine The machine to check the status of in the
    format stored in the redux store.
  @returns {Object} The status of the machine and any relevent messaging.
*/
export const getMachineStatusGroup = machine => {
  // Possible "blocked" or error states in machine statuses.
  const blocked = ["down"];
  // Possible "alert" states in machine statuses.
  const alert = ["pending"];
  const status = machine.agentStatus.status;
  const response = {
    status: "running",
    message: null
  };
  if (blocked.includes(status)) {
    response.status = "blocked";
  }
  if (alert.includes(status)) {
    response.status = "alert";
  }
  return response;
};

/**
  Returns the status level for the unit.
  @param {Object} unit The unit to check the status of in the
    format stored in the redux store.
  @returns {Object} The status of the unit and any relevent messaging.
*/
export const getUnitStatusGroup = unit => {
  // Possible "blocked" or error states in the unit statuses.
  const blocked = ["lost"];
  // Possible "alert" states in the unit statuses.
  const alert = ["allocating"];
  const status = unit.agentStatus.status;
  const response = {
    status: "running",
    message: null
  };
  if (blocked.includes(status)) {
    response.status = "blocked";
  }
  if (alert.includes(status)) {
    response.status = "alert";
  }
  return response;
};

/**
  Returns owner string from ownerTag
  @param {string} ownerTag The ownerTag identifier returns from the API
  @returns {string} The simplified owner string
*/
export const extractOwnerName = tag => {
  return tag.split("@")[0].replace("user-", "");
};

/**
  Returns (s) string if the value is more then one
  @param {string} value The integer to be checked
  @param {string} string The item name to be pluralized
  @returns {string} The item pluralized if required
*/
export const pluralize = (value, string) => {
  if (value === 0 || value > 1) {
    return string + "s";
  }
  return string;
};

/**
  Returns cloud string from cloudTag
  @param {string} cloudTag The cloudTag identifier returns from the API
  @returns {string} The simplified cloud string
*/
export const extractCloudName = tag => {
  return tag.replace("cloud-", "");
};

/**
  Returns credential string from Tag
  @param {string} cloudTag The cloudTag identifier returns from the API
  @returns {string} The simplified cloud string
*/
export const extractCredentialName = tag => {
  return tag
    .split("cloudcred-")[1]
    .split("@")[1]
    .split("_")[1];
};

/**
  Returns a link to the charm icon for the provided charm name.
  @param {String} namespace The fully qualified charm name.
  @returns {String} The link to the charm icon.
*/
export const generateIconPath = namespace => {
  if (namespace.indexOf("cs:") === 0) {
    namespace = namespace.replace("cs:", "");
  }
  return `https://api.jujucharms.com/charmstore/v5/${namespace}/icon.svg`;
};

export const analyticsEnabled = () => {};

export const feedbackEnabled = () => {
  const disableFeedback = localStorage.getItem("disableFeedback");
  return disableFeedback === "false" || disableFeedback === null;
};
