import Limiter from "async-limiter";
import { connect, connectAndLogin } from "@canonical/jujulib";

import actions from "@canonical/jujulib/dist/api/facades/action-v6";
import annotations from "@canonical/jujulib/dist/api/facades/annotations-v2";
import applications from "@canonical/jujulib/dist/api/facades/application-v12";
import client from "@canonical/jujulib/dist/api/facades/client-v2";
import cloud from "@canonical/jujulib/dist/api/facades/cloud-v3";
import controller from "@canonical/jujulib/dist/api/facades/controller-v5";
import modelManager from "@canonical/jujulib/dist/api/facades/model-manager-v5";
import pinger from "@canonical/jujulib/dist/api/facades/pinger-v1";

import jimm from "app/jimm-facade";
import { isSet } from "app/utils/utils";

import {
  getBakery,
  getConfig,
  getControllerConnection,
  isLoggedIn,
  getUserPass,
  getWSControllerURL,
} from "app/selectors";
import {
  addControllerCloudRegion,
  updateControllerList,
  updateModelInfo,
  updateModelStatus,
} from "./actions";

/**
  Return a common connection option config.
  @param {Boolean} usePinger If the connection will be long lived then use the
    pinger. Defaults to false.
  @param {Object} bakery A bakery instance.
  @returns {Object} The configuration options.
*/
function generateConnectionOptions(usePinger = false, bakery, onClose) {
  // The options used when connecting to a Juju controller or model.
  const facades = [
    actions,
    annotations,
    applications,
    client,
    cloud,
    controller,
    jimm,
    modelManager,
  ];
  if (usePinger) {
    facades.push(pinger);
  }
  return {
    bakery,
    closeCallback: onClose,
    debug: false,
    facades,
    wsclass: WebSocket,
  };
}

function determineLoginParams(credentials, identityProviderAvailable) {
  let loginParams = {};
  if (!identityProviderAvailable) {
    loginParams = {
      username: credentials.user,
      password: credentials.password,
    };
  }
  return loginParams;
}

/**
  Connects to the controller at the url defined in the baseControllerURL
  configuration value.
  @param {String} wsControllerURL The fully qualified URL of the controller api.
  @param {Object|null} credentials The users credentials in the format
    {user: ..., password: ...}
  @param {Object} bakery A bakery instance.
  @param {Boolean} identityProviderAvailable Whether an identity provider is available.
  @returns {Object}
    conn The controller connection instance.
    juju The juju api instance.
*/
export async function loginWithBakery(
  wsControllerURL,
  credentials,
  bakery,
  identityProviderAvailable
) {
  const juju = await connect(
    wsControllerURL,
    generateConnectionOptions(true, bakery, (e) =>
      console.log("controller closed", e)
    )
  );
  const loginParams = determineLoginParams(
    credentials,
    identityProviderAvailable
  );
  let conn = null;
  try {
    conn = await juju.login(loginParams);
  } catch (error) {
    return { error };
  }

  // Ping to keep the connection alive.
  const intervalId = setInterval(() => {
    conn.facades.pinger.ping().catch((e) => {
      // If the pinger fails for whatever reason then cancel the ping.
      console.error("pinger stopped,", e);
      clearInterval(intervalId);
    });
  }, 20000);

  return { conn, juju, intervalId };
}

/**
  Connects and logs in to the supplied modelURL. If the connection takes longer
  than the allowed timeout it gives up.
  @param {String} modelURL The fully qualified url of the model api.
  @param {Object|Null} credentials The users credentials in the format
    {user: ..., password: ...}
  @param {Object} options The options for the connection.
  @param {Boolean} identityProviderAvailable If an identity provider is available.
  @returns {Object} The full model status.
*/
async function connectAndLoginWithTimeout(
  modelURL,
  credentials,
  options,
  identityProviderAvailable
) {
  const duration = 5000;
  const timeout = new Promise((resolve) => {
    setTimeout(resolve, duration, "timeout");
  });
  const loginParams = determineLoginParams(
    credentials,
    identityProviderAvailable
  );
  const juju = connectAndLogin(modelURL, loginParams, options);
  return new Promise((resolve, reject) => {
    Promise.race([timeout, juju]).then((resp) => {
      if (resp === "timeout") {
        reject("timeout");
        return;
      }
      resolve(resp);
    });
  });
}

/**
  Connects to the model url by doing a replacement on the controller url and
  fetches it's full status then logs out of the model and closes the connection.
  @param {String} modelUUID The UUID of the model to connect to. Must be on the
    same controller as provided by the wsControllerURL`.
  @param {Object} getState A function that'll return the app redux state.
  @returns {Object} The full model status.
*/
async function fetchModelStatus(modelUUID, wsControllerURL, getState) {
  const appState = getState();
  const bakery = getBakery(appState);
  const baseWSControllerURL = getWSControllerURL(appState);
  const { identityProviderAvailable } = getConfig(appState);
  let useIdentityProvider = false;

  if (baseWSControllerURL === wsControllerURL) {
    useIdentityProvider = identityProviderAvailable;
  }
  const modelURL = wsControllerURL.replace("/api", `/model/${modelUUID}/api`);
  let status = null;
  // Logged in state is checked multiple times as the user may have logged out
  // between requests.
  if (isLoggedIn(wsControllerURL, getState())) {
    try {
      const controllerCredentials = getUserPass(wsControllerURL, getState());
      const { conn, logout } = await connectAndLoginWithTimeout(
        modelURL,
        controllerCredentials,
        generateConnectionOptions(false, bakery),
        useIdentityProvider
      );
      if (isLoggedIn(wsControllerURL, getState())) {
        status = await conn.facades.client.fullStatus();
        if (status.error) {
          // XXX If there is an error fetching the full status it's likely that
          // Juju can no longer access this model. At this moment we don't have
          // a location to notify the user. In the new watcher model that's
          // being implemented we will be able to surface this error in the
          // model details page.
          console.error(status.error);
          return;
        }
      }
      if (isLoggedIn(wsControllerURL, getState())) {
        const entities = Object.keys(status.applications).map((name) => ({
          tag: `application-${name}`,
        }));
        const response = await conn.facades.annotations.get({ entities });
        // It will return an entry for every entity even if there are no
        // annotations so we have to inspect them and strip out the empty.
        const annotations = {};
        response.results.forEach((item) => {
          if (Object.keys(item.annotations).length > 0) {
            const appName = item.entity.replace("application-", "");
            annotations[appName] = item.annotations;
          }
        });
        status.annotations = annotations;
      }
      logout();
    } catch (e) {
      console.error("error connecting to model:", modelUUID, e);
    }
  }
  return status;
}

/**
  Calls the fetchModelStatus method with the UUID and then dispatches the
  action to store it in the redux store.
  @param {String} modelUUID The model UUID to fetch the model status of.
  @param {Function} dispatch The redux store hook method.
  @param {Object} getState A function that'll return the app redux state.
 */
export async function fetchAndStoreModelStatus(
  modelUUID,
  wsControllerURL,
  dispatch,
  getState
) {
  const status = await fetchModelStatus(modelUUID, wsControllerURL, getState);
  if (status === null) {
    return;
  }
  dispatch(updateModelStatus(modelUUID, status), {
    wsControllerURL,
  });
}

/**
  Requests the model information for the supplied UUID from the supplied
  controller connection.
  @param {Object} conn The active controller connection.
  @param {String} modelUUID The UUID of the model to connect to. Must be on the
    same controller as provided by the wsControllerURL`.
  @returns {Object} The full modelInfo.
*/
async function fetchModelInfo(conn, modelUUID) {
  const modelInfo = await conn.facades.modelManager.modelInfo({
    entities: [{ tag: `model-${modelUUID}` }],
  });
  return modelInfo;
}

/**
  Loops through each model UUID to fetch the status. Upon receiving the status
  dispatches to store that status data.
  @param {Object} conn The connection to the controller.
  @param {Array} modelUUIDList A list of the model uuid's to connect to.
  @param {Object} reduxStore The applications reduxStore.
  @returns {Promise} Resolves when the queue fetching the model statuses has
    completed. Does not reject.
*/
export async function fetchAllModelStatuses(
  wsControllerURL,
  modelUUIDList,
  conn,
  reduxStore
) {
  const getState = reduxStore.getState;
  const dispatch = reduxStore.dispatch;
  const queue = new Limiter({ concurrency: 1 });
  modelUUIDList.forEach((modelUUID) => {
    queue.push(async (done) => {
      if (isLoggedIn(wsControllerURL, getState())) {
        await fetchAndStoreModelStatus(
          modelUUID,
          wsControllerURL,
          dispatch,
          getState
        );
      }
      if (isLoggedIn(wsControllerURL, getState())) {
        const modelInfo = await fetchModelInfo(conn, modelUUID);
        dispatch(updateModelInfo(modelInfo), { wsControllerURL });
        if (modelInfo.results[0].result.isController) {
          // If this is a controller model then update the
          // controller data with this model data.
          dispatch(addControllerCloudRegion(wsControllerURL, modelInfo), {
            wsControllerURL,
          });
        }
      }
      done();
    });
  });
  return new Promise((resolve) => {
    queue.onDone(() => {
      resolve();
    });
  });
}

/**
  Performs an HTTP request to the controller to fetch the controller list.
  Will fail with a console error message if the user doesn't have access.
  @param {String} wsControllerURL The URL of the controller.
  @param {Object} conn The Juju controller connection.
  @param {Object} reduxStore The applications reduxStore.
  @param {Boolean} additionalController If this is an additional controller.
*/
export async function fetchControllerList(
  wsControllerURL,
  conn,
  additionalController,
  reduxStore
) {
  let controllers = null;
  if (conn.facades.jimM) {
    const response = await conn.facades.jimM.listControllers();
    controllers = response.controllers;
    controllers.forEach((c) => (c.additionalController = additionalController));
  } else {
    // If we're not connected to a JIMM then call to get the controller config
    // and generate a fake controller list.
    const controllerConfig = await conn.facades.controller.controllerConfig();
    controllers = [
      {
        path: controllerConfig.config["controller-name"],
        uuid: controllerConfig.config["controller-uuid"],
        version: getControllerConnection(wsControllerURL, reduxStore.getState())
          ?.info?.serverVersion,
        additionalController,
      },
    ];
  }
  reduxStore.dispatch(updateControllerList(wsControllerURL, controllers), {
    wsControllerURL,
  });
}

/**
  Calls to disable the controller UUID masking on JIMM. This will be a noop
  if the user is not an administrator on the controller.
  @param {Object} conn The controller connection instance.
*/
export function disableControllerUUIDMasking(conn) {
  return new Promise(async (resolve, reject) => {
    if (conn?.facades?.jimM) {
      try {
        await conn.facades.jimM.disableControllerUUIDMasking();
        resolve();
      } catch (e) {
        reject();
      }
    } else {
      resolve();
    }
  });
}

/**
  Connect to the model representing the supplied modelUUID.
  @param {*} modelUUID
  @param {*} appState
  @returns {Object} conn The connection.
*/
async function connectAndLoginToModel(modelUUID, appState) {
  const bakery = getBakery(appState);
  const baseWSControllerURL = getWSControllerURL(appState);
  const { identityProviderAvailable } = getConfig(appState);
  const credentials = getUserPass(baseWSControllerURL, appState);
  const modelURL = baseWSControllerURL.replace(
    "/api",
    `/model/${modelUUID}/api`
  );
  const { conn } = await connectAndLoginWithTimeout(
    modelURL,
    credentials,
    generateConnectionOptions(false, bakery),
    identityProviderAvailable
  );
  return conn;
}

/**
  Call the API to fetch the application config data.
  @param {String} modelUUID
  @param {String} appName
  @param {Object} appState
  @returns {Promise} The application config.
*/
export async function getApplicationConfig(modelUUID, appName, appState) {
  const conn = await connectAndLoginToModel(modelUUID, appState);
  const config = await conn.facades.application.get({ application: appName });
  return config;
}

/**
  Call the API to set the application config data.
  @param {String} modelUUID
  @param {String} appName
  @param {Object} config
  @param {Object} appState
  @returns {Promise} The application set config response
*/
export async function setApplicationConfig(
  modelUUID,
  appName,
  config,
  appState
) {
  const conn = await connectAndLoginToModel(modelUUID, appState);
  const setValues = {};
  Object.keys(config).forEach((key) => {
    if (isSet(config[key].newValue)) {
      // Juju requires that the value be a string, even if the field is a bool.
      setValues[key] = `${config[key].newValue}`;
    }
  });
  const resp = await conn.facades.application.set({
    application: appName,
    options: setValues,
  });
  return resp;
}

export async function getActionsForApplication(appName, modelUUID, appState) {
  const conn = await connectAndLoginToModel(modelUUID, appState);
  const actionList = await conn.facades.action.applicationsCharmsActions({
    entities: [{ tag: `application-${appName}` }],
  });
  return actionList;
}

export async function executeActionOnUnits(
  unitList = [],
  actionName,
  actionOptions,
  modelUUID,
  appState
) {
  const generatedActions = unitList.map((unit) => {
    return {
      name: actionName,
      receiver: `unit-${unit.replace("/", "-")}`, // Juju unit tag in the format "unit-mysql-1"
      parameters: actionOptions,
    };
  });
  const conn = await connectAndLoginToModel(modelUUID, appState);
  const actionResult = await conn.facades.action.enqueueOperation({
    actions: generatedActions,
  });
  return actionResult;
}

export async function queryOperationsList(queryArgs, modelUUID, appState) {
  const conn = await connectAndLoginToModel(modelUUID, appState);
  const operationListResult = await conn.facades.action.listOperations(
    queryArgs
  );
  return operationListResult;
}

/**
  Call the API to grant the sharing permissions for a model
  @param {String} controllerURL
  @param {String} modelUUID
  @param {Function} getState Function to get current store state
  @param {Object} user The user obj with name and access info
  @param {String | undefined} permissionTo
  @param {String | undefined} permissionFrom The level of access a user previously had (read|write|admin)
  @param {String} action grant|revoke
  @param {Function} dispatch Redux dispatch method
  @returns {Promise} The application set config response
*/
export async function setModelSharingPermissions(
  controllerURL,
  modelUUID,
  getState,
  user,
  permissionTo,
  permissionFrom,
  action,
  dispatch
) {
  const conn = await getControllerConnection(controllerURL, getState());

  const modifyAccess = async (access, action) => {
    return await conn.facades.modelManager.modifyModelAccess({
      changes: [
        {
          access,
          action,
          "model-tag": `model-${modelUUID}`,
          "user-tag": `user-${user}`,
        },
      ],
    });
  };

  let response = Promise.resolve({ results: [{}] });

  if (conn) {
    if (permissionFrom) {
      response = await modifyAccess(permissionFrom, "revoke");
    }

    if (action === "grant") {
      response = await modifyAccess(permissionTo, "grant");
    }

    const modelInfo = await fetchModelInfo(conn, modelUUID);
    modelInfo &&
      dispatch(updateModelInfo(modelInfo), { wsControllerURL: controllerURL });
  } else {
    response = Promise.resolve({
      results: [{ error: true }],
    });
  }

  return response;
}
