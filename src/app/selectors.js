import { createSelector } from "reselect";

import { getModelStatusGroupData } from "./utils";

// ---- Selectors for top level keys

/**
  Fetches the model data from state.
  @param {Object} state The application state.
  @returns {Object|Null} The list of model data or null if none found.
*/
const getModelData = state => {
  if (state.juju && state.juju.modelData) {
    return state.juju.modelData;
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

// ---- Utility selectors

/**
  Pull the users macaroon credentials from state.
  @param {Object} state The application state.
  @returns {Object} The macaroons extracted from the bakery in state.
*/
const getUserCredentials = state => {
  let storedMacaroons = null;
  if (state.root && state.root.bakery) {
    storedMacaroons = state.root.bakery.storage._store.localStorage;
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
  @returns {Function} The grouped model statuses.
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
  Returns an object containing the grouped model status counts.
  @param {Object} groupedModelStatuses
  @returns {Function} The counts for each group of model statuses.
*/
const countModelStatusGroups = groupedModelStatuses => {
  const counts = {
    blocked: groupedModelStatuses.blocked.length,
    alert: groupedModelStatuses.alert.length,
    running: groupedModelStatuses.running.length
  };
  return counts;
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

export const continueModelStatusPolling = state => {
  if (state && state.root) {
    return state.root.modelStatusPolling;
  }
  return null;
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
  return createSelector(
    getModelData,
    modelData => getModelUUIDByName(modelName, modelData)
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
  state.root.bakery.storage._store.localStorage.identity;

export const isConnecting = state => !!state.root.visitURL;
/**
  Returns the users current controller logged in identity
  @param {Object} state The application state.
  @returns {String} The users userTag.
*/
export const getActiveUserTag = state =>
  state.root.controllerConnection &&
  state.root.controllerConnection.info.user.identity;

/**
  Returns a model status for the supplied modelUUID.
  @param {String} modelUUID The model UUID to fetch the status for
  @returns {Function} The memoized selector to return the model status.
*/
export const getModelStatus = modelUUID => {
  return createSelector(
    getModelData,
    modelData => getModelDataByUUID(modelUUID, modelData)
  );
};

/**
  Returns the model statuses sorted by status.
  @returns {Function} The memoized selector to return the sorted model statuses.
*/
export const getGroupedModelData = createSelector(
  getModelData,
  groupModelsByStatus
);

/**
  Returns the counts of the model statuses
  @returns {Function} The memoized selector to return the model status counts.
*/
export const getGroupedModelStatusCounts = createSelector(
  getGroupedModelData,
  countModelStatusGroups
);
