import { createSelector } from "reselect";
import cloneDeep from "clone-deep";
import {
  getModelStatusGroupData,
  extractOwnerName,
  extractCloudName,
  getApplicationStatusGroup,
  getMachineStatusGroup,
  getUnitStatusGroup,
  extractCredentialName
} from "./utils";

// ---- Selectors for top level keys

/**
  Fetches the model data from state.
  @param {Object} state The application state.
  @returns {Object|Null} The list of model data or null if none found.
*/
export const getModelData = state => {
  if (state.juju && state.juju.modelData) {
    return state.juju.modelData;
  }
  return null;
};

/**
  Fetches the controller data from state.
  @param {Object} state The application state.
  @returns {Object|Null} The list of controller data or null if none found.
*/
export const getControllerData = state => {
  if (state.juju && state.juju.controllers) {
    return state.juju.controllers;
  }
  return null;
};

/**
  Fetches the bakery from state.
  @param {Object} state The application state.
  @returns {Object|Null} The bakery instance or null if none found.
*/
export const getBakery = state => {
  if (state.root && state.root.bakery) {
    return state.root.bakery;
  }
  return null;
};

/**
  Fetches the juju api instance from state.
  @param {Object} state The application state.
  @returns {Object|Null} The juju api instance or null if none found.
*/
export const getJujuAPIInstance = state => {
  if (state.root && state.root.juju) {
    return state.root.juju;
  }
  return null;
};

/**
  Fetches the pinger intervalId from state.
  @param {Object} state The application state.
  @returns {Object|Null} The pinger intervalId or null if none found.
*/
export const getPingerIntervalId = state => {
  if (state.root && state.root.pingerIntervalId) {
    return state.root.pingerIntervalId;
  }
  return null;
};

// ---- Utility selectors

/**
  Returns a selector for the filtered model data.
  @param {Object} filters The filters to filter the model data by.
  @returns {Object} A selector for the filtered model data.
*/
const getFilteredModelData = filters =>
  createSelector(getModelData, modelData =>
    filterModelData(filters, modelData)
  );

// ---- Utility functions

/**
  Pull the users macaroon credentials from state.
  @param {Object} state The application state.
  @returns {Object} The macaroons extracted from the bakery in state.
*/
const getUserCredentials = state => {
  let storedMacaroons = null;
  if (state.root && state.root.bakery) {
    storedMacaroons = state.root.bakery.storage._store;
  }
  return storedMacaroons;
};

/**
  Base64 decode and json parse the supplied macaroons from the bakery.
  @param {Object} macaroons The macaroons data from the bakery.
  @returns {Object} The users decoded macaroons.
*/
const getDecodedMacaroons = macaroons => {
  if (!macaroons) {
    return null;
  }
  let decodedMacaroons = {};
  Object.keys(macaroons).forEach(key => {
    try {
      decodedMacaroons[key] = JSON.parse(atob(macaroons[key]));
    } catch (err) {
      console.error("Unable to decode macaroons", err);
    }
  });
  return decodedMacaroons;
};

/**
  Gets the model UUID from the supplied name.
  @param {String} name The name of the model.
  @param {Object} modelData The list of models.
  @returns {Object|Null} The model UUID or null if none found.
*/
const getModelUUIDByName = (name, modelData) => {
  let owner = null;
  let modelName = null;
  if (name.includes("/")) {
    [owner, modelName] = name.split("/");
  } else {
    modelName = name;
  }
  if (modelData) {
    for (let uuid in modelData) {
      const model = modelData[uuid].info;
      if (model && model.name === modelName) {
        if (owner) {
          if (model.ownerTag === `user-${owner}`) {
            // If this is a shared model then we'll also have an owner name
            return uuid;
          }
        } else {
          return uuid;
        }
      }
    }
  }
  return null;
};

/**
  Returns the modelStatus for the supplied modelUUID.
  @param {String} modelUUID
  @param {Object} modelData
  @returns {Object|Null} The model status or null if none found
*/
const getModelDataByUUID = (modelUUID, modelData) => {
  if (modelData && modelData[modelUUID]) {
    return modelData[modelUUID];
  }
  return null;
};

/**
  Returns a grouped collection of model statuses.
  @param {Object} modelData
  @returns {Object} The grouped model statuses.
*/
const groupModelsByStatus = modelData => {
  const grouped = {
    blocked: [],
    alert: [],
    running: []
  };
  if (!modelData) {
    return grouped;
  }
  for (let modelUUID in modelData) {
    const model = modelData[modelUUID];
    const { highestStatus } = getModelStatusGroupData(model);
    grouped[highestStatus].push(model);
  }
  return grouped;
};

/**
  Returns a grouped collection of machine instances.
  @param {Object} modelData
  @returns {Object} The grouped machine instances.
*/
const groupMachinesByStatus = modelData => {
  const grouped = {
    blocked: [],
    alert: [],
    running: []
  };
  if (!modelData) {
    return grouped;
  }
  for (let modelUUID in modelData) {
    const model = modelData[modelUUID];
    for (let machineID in model.machines) {
      const machine = model.machines[machineID];
      grouped[getMachineStatusGroup(machine).status].push(machine);
    }
  }
  return grouped;
};

/**
  Returns a grouped collection of unit instances.
  @param {Object} modelData
  @returns {Function} The grouped unit instances.
*/
const groupUnitsByStatus = modelData => {
  const grouped = {
    blocked: [],
    alert: [],
    running: []
  };
  if (!modelData) {
    return grouped;
  }
  for (let modelUUID in modelData) {
    const model = modelData[modelUUID];
    for (let applicationID in model.applications) {
      const application = model.applications[applicationID];
      for (let unitID in application.units) {
        const unit = application.units[unitID];
        grouped[getUnitStatusGroup(unit).status].push(unit);
      }
    }
  }
  return grouped;
};

/**
  Returns a grouped collection of machine instances.
  @param {Object} modelData
  @returns {Object} The grouped machine instances.
*/
const groupApplicationsByStatus = modelData => {
  const grouped = {
    blocked: [],
    alert: [],
    running: []
  };
  if (!modelData) {
    return grouped;
  }
  for (let modelUUID in modelData) {
    const model = modelData[modelUUID];
    for (let applicationID in model.applications) {
      const application = model.applications[applicationID];
      grouped[getApplicationStatusGroup(application).status].push(application);
    }
  }
  return grouped;
};

/**
  Returns a grouped collection of model statuses by owner.
  @param {Object} modelData
  @returns {Object} The grouped model statuses by owner.
*/
const groupModelsByOwner = modelData => {
  const grouped = {};
  if (!modelData) {
    return grouped;
  }
  for (let modelUUID in modelData) {
    const model = modelData[modelUUID];
    if (model.info) {
      const owner = extractOwnerName(model.info.ownerTag);
      if (!grouped[owner]) {
        grouped[owner] = [];
      }
      grouped[owner].push(model);
    }
  }
  return grouped;
};

/**
  Returns a grouped collection of model statuses by cloud.
  @param {Object} modelData
  @returns {Object} The grouped model statuses by cloud.
*/
const groupModelsByCloud = modelData => {
  const grouped = {};
  if (!modelData) {
    return grouped;
  }
  for (let modelUUID in modelData) {
    const model = modelData[modelUUID];
    if (model.info) {
      const cloud = extractCloudName(model.info.cloudTag);
      if (!grouped[cloud]) {
        grouped[cloud] = [];
      }
      grouped[cloud].push(model);
    }
  }
  return grouped;
};

/**
  Returns an object containing the grouped model status counts.
  @param {Object} groupedModelStatuses
  @returns {Object} The counts for each group of model statuses.
*/
const countModelStatusGroups = groupedModelStatuses => {
  const counts = {
    blocked: groupedModelStatuses.blocked.length,
    alert: groupedModelStatuses.alert.length,
    running: groupedModelStatuses.running.length
  };
  return counts;
};

/**
  Uses the supplied filters object to filter down the supplied modelData and
  returns the filtered object.
  @param {Object} filters The filters to filter by in the format:
    {segment: [values]}
  @param {Object} modelData The model data from the redux store.
  @returns {Object} The filtered model data.
*/
const filterModelData = (filters, modelData) => {
  if (!filters) {
    return modelData;
  }
  const filterSegments = {};
  // Collect segments
  filters.forEach(filter => {
    const values = filter.split(":");
    if (!filterSegments[values[0]]) {
      filterSegments[values[0]] = [];
    }
    filterSegments[values[0]].push(values[1]);
  });

  const clonedModelData = cloneDeep(modelData);

  Object.entries(clonedModelData).forEach(([uuid, data]) => {
    const remove = Object.entries(filterSegments).some(([segment, values]) => {
      switch (segment) {
        case "cloud":
          return !values.includes(extractCloudName(data.model.cloudTag));
        case "credential":
          if (data.info) {
            return !values.includes(
              extractCredentialName(data.info.cloudCredentialTag)
            );
          }
          break;
        case "region":
          return !values.includes(data.model.region);
        case "owner":
          if (data.info) {
            return !values.includes(extractOwnerName(data.info.ownerTag));
          }
          break;
      }
      return false;
    });
    if (remove) {
      delete clonedModelData[uuid];
    }
  });
  return clonedModelData;
};

// ----- Exported functions

/**
  Checks state to see if the sidebar is collapsible.
  Usage:
    const isSidebarCollapsible = useSelector(isSidebarCollapsible);

  @param {Object} state The application state.
  @returns {Boolean} If the sidebar is collapsible.
*/
export const isSidebarCollapsible = state => {
  if (state && state.root) {
    return state.root.collapsibleSidebar;
  }
};

/**
  Gets the model UUID from the supplied name using a memoized selector
  Usage:
    const getModelUUIDMemo = useMemo(getModelUUID.bind(null, modelName), [
      modelName
    ]);

  @param {String} modelName The name of the model.
  @returns {Function} The memoized selector to return a modelUUID.
*/
export const getModelUUID = modelName => {
  return createSelector(getModelData, modelData =>
    getModelUUIDByName(modelName, modelData)
  );
};

/**
  Gets the model UUID from the supplied name using a memoized selector
  Usage:
    const macaroons = useSelector(getMacaroons);

  @returns {Function} The memoized selector to return the users macaroons.
*/
export const getMacaroons = createSelector(
  getUserCredentials,
  getDecodedMacaroons
);

/**
  Checks state to see if the user is logged in.
  Usage:
    const userIsLoggedIn = useSelector(isLoggedIn);

  @param {Object} state The application state.
  @returns {Boolean} If the user is logged in.
*/
export const isLoggedIn = state =>
  state.root.controllerConnection &&
  state.root.bakery &&
  state.root.bakery.storage._store.identity;

export const isConnecting = state => !!state.root.visitURL;
/**
  Returns the users current controller logged in identity
  @param {Object} state The application state.
  @returns {String} The users userTag.
*/
export const getActiveUserTag = state =>
  state?.root?.controllerConnection?.info.user.identity;

/**
  Returns a model status for the supplied modelUUID.
  @param {String} modelUUID The model UUID to fetch the status for
  @returns {Function} The memoized selector to return the model status.
*/
export const getModelStatus = modelUUID => {
  return createSelector(getModelData, modelData =>
    getModelDataByUUID(modelUUID, modelData)
  );
};

/**
  Returns the model data filtered and grouped by status.
  @param {Object} filters The filters to filter the model data by.
  @returns {Object} The filtered and grouped model data.
*/
export const getGroupedByStatusAndFilteredModelData = filters =>
  createSelector(getFilteredModelData(filters), groupModelsByStatus);

/**
  Returns the model data filtered and grouped by cloud.
  @param {Object} filters The filters to filter the model data by.
  @returns {Object} The filtered and grouped model data.
*/
export const getGroupedByCloudAndFilteredModelData = filters =>
  createSelector(getFilteredModelData(filters), groupModelsByCloud);

/**
  Returns the model data filtered and grouped by owner.
  @param {Object} filters The filters to filter the model data by.
  @returns {Object} The filtered and grouped model data.
*/
export const getGroupedByOwnerAndFilteredModelData = filters =>
  createSelector(getFilteredModelData(filters), groupModelsByOwner);

/**
  Returns the model statuses sorted by status.
  @returns {Function} The memoized selector to return the sorted model statuses.
*/
export const getGroupedModelDataByStatus = createSelector(
  getModelData,
  groupModelsByStatus
);

/**
  Returns the machine instances sorted by status.
  @returns {Function} The memoized selector to return the sorted machine instances.
*/
export const getGroupedMachinesDataByStatus = createSelector(
  getModelData,
  groupMachinesByStatus
);

/**
  Returns the unit instances sorted by status.
  @returns {Function} The memoized selector to return the sorted unit instances.
*/
export const getGroupedUnitsDataByStatus = createSelector(
  getModelData,
  groupUnitsByStatus
);

/**
  Returns the application instances sorted by status.
  @returns {Function} The memoized selector to return the sorted application instances.
*/
export const getGroupedApplicationsDataByStatus = createSelector(
  getModelData,
  groupApplicationsByStatus
);

/**
  Returns the counts of the model statuses
  @returns {Function} The memoized selector to return the model status counts.
*/
export const getGroupedModelStatusCounts = createSelector(
  getGroupedModelDataByStatus,
  countModelStatusGroups
);
