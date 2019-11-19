import Limiter from "async-limiter";
import jujulib from "@canonical/jujulib";
import client from "@canonical/jujulib/api/facades/client-v2";
import modelManager from "@canonical/jujulib/api/facades/model-manager-v5";
import pinger from "@canonical/jujulib/api/facades/pinger-v1";
import { Bakery, BakeryStorage } from "@canonical/macaroon-bakery";

import { continueModelStatusPolling } from "app/selectors";
import { updateModelInfo, updateModelStatus } from "./actions";

// Shared bakery instance.
let bakery = null;

// Full URL path to the controller.
const controllerURL = process.env.REACT_APP_CONTROLLER_URL;

/**
  Localstorage store class for the bakery.
  @param {Object} The options for this class:
    localStorage: The local storage instance to use. Defaults to
      window.localStorage for normal use or pass a stub for testing.
*/
class LocalMacaroonStore {
  constructor({ localStorage } = {}) {
    this.localStorage = localStorage || window.localStorage;
  }
  getItem(service) {
    return this.localStorage.getItem(service);
  }
  setItem(service, macaroon) {
    return this.localStorage.setItem(service, macaroon);
  }
  removeItem(service) {
    return this.localStorage.removeItem(service);
  }
  clear() {
    return this.localStorage.clear();
  }
}

/**
  Creates a new bakery instance
  @param {Function} visitPage The function to call when the bakery returns with
    a visit page URL.
  @param {Object} macaroonStore Instance to handle the macaroon store. Defaults
    to an in-memory store.
  @returns {Bakery} A new bakery instance.
*/
function createNewBakery(visitPage, macaroonStore) {
  const defaultVisitPage = resp => {
    // eslint-disable-next-line no-console
    console.log("visit this URL to login:", resp.Info.VisitURL);
  };
  return new Bakery({
    visitPage: visitPage || defaultVisitPage,
    storage: new BakeryStorage(macaroonStore, {})
  });
}

/**
  Return a common connection option config.
  @param {Boolean} usePinger If the connection will be long lived then use the
    pinger. Defaults to false.
  @returns {Object} The configuration options.
*/
function generateConnectionOptions(usePinger = false) {
  // The options used when connecting to a Juju controller or model.
  const facades = [client, modelManager];
  if (usePinger) {
    facades.push(pinger);
  }
  return {
    debug: false,
    facades,
    bakery
  };
}

/**
  Connects to the controller at the url defined in the REACT_APP_CONTROLLER_URL
  environment variable.
  @param {Function} visitPage The function to call if the user must visit a
    visitPage URL to log in.
  @param {Object} macaroonStore Instance to handle the macaroon store. Defaults
    to an in-memory store.
  @returns {Object} conn The controller connection instance.
*/
async function loginWithBakery(visitPage, macaroonStore) {
  if (bakery === null) {
    bakery = createNewBakery(visitPage, macaroonStore);
  }
  const juju = await jujulib.connect(
    controllerURL,
    generateConnectionOptions(true)
  );
  const conn = await juju.login({});
  // Ping to keep the connection alive.
  conn.facades.pinger.pingForever(20000, err => {
    if (err) {
      console.error("unable to ping:", err);
    }
  });
  return { bakery, conn };
}

/**
  Connects and logs in to the supplied modelURL. If the connection takes longer
  than the allowed timeout it gives up.
  @param {String} modelURL The fully qualified url of the model api.
  @param {Object} options The options for the connection.
  @param {Number} duration The timeout in ms for the connection. Defaults to 5s
  @returns {Object} The full model status.
*/
async function connectAndLoginWithTimeout(modelURL, options, duration = 5000) {
  const timeout = new Promise((resolve, reject) => {
    setTimeout(resolve, duration, "timeout");
  });
  const juju = jujulib.connectAndLogin(modelURL, {}, options);
  return new Promise((resolve, reject) => {
    Promise.race([timeout, juju]).then(resp => {
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
    same controller as provided by the controllerURL`.
  @returns {Object} The full model status.
*/
async function fetchModelStatus(modelUUID) {
  const modelURL = controllerURL.replace("/api", `/model/${modelUUID}/api`);
  let status = null;
  try {
    const { conn, logout } = await connectAndLoginWithTimeout(
      modelURL,
      generateConnectionOptions()
    );
    status = await conn.facades.client.fullStatus();
    logout();
  } catch (e) {
    console.error("timeout, unable to log into model:", modelUUID);
  }
  return status;
}

/**
  Calls the fetchModelStatus method with the UUID and then dispatches the
  action to store it in the redux store.
  @param {String} modelUUID The model UUID to fetch the model status of.
  @param {Function} dispatch The redux store hook method.
 */
async function fetchAndStoreModelStatus(modelUUID, dispatch) {
  const status = await fetchModelStatus(modelUUID);
  if (status === null) {
    return;
  }
  dispatch(updateModelStatus(modelUUID, status));
}

/**
  Requests the model information for the supplied UUID from the supplied
  controller connection.
  @param {Object} conn The active controller connection.
  @param {String} modelUUID The UUID of the model to connect to. Must be on the
    same controller as provided by the controllerURL`.
  @returns {Object} The full modelInfo.
*/
async function fetchModelInfo(conn, modelUUID) {
  const modelInfo = await conn.facades.modelManager.modelInfo({
    entities: [{ tag: `model-${modelUUID}` }]
  });
  return modelInfo;
}

/**
  Loops through each model UUID to fetch the status. Uppon receiving the status
  dispatches to store that status data.
  @param {Object} conn The connection to the controller.
  @param {Object} modelList The list of models where the key is the model's
    UUID and the body is the models info.
  @param {Function} dispatch The function to call with the action to store the
    model status.
  @returns {Promise} Resolves when the queue fetching the model statuses has
    completed. Does not reject.
*/
async function fetchAllModelStatuses(conn, reduxStore) {
  const modelList = reduxStore.getState().juju.models;
  const queue = new Limiter({ concurrency: 5 });
  const modelUUIDs = Object.keys(modelList);
  modelUUIDs.forEach(modelUUID => {
    queue.push(async done => {
      // If we're not supposed to be polling then do not make the fetch requests.
      if (continueModelStatusPolling(reduxStore.getState())) {
        await fetchAndStoreModelStatus(modelUUID, reduxStore.dispatch);
        const modelInfo = await fetchModelInfo(conn, modelUUID);
        // We are checking this state again here because it's possible that the
        // above fetch's got in before the polling was disabled but we don't
        // want to store it if polling has been disabled as this could mean
        // the user has logged out.
        if (continueModelStatusPolling(reduxStore.getState())) {
          reduxStore.dispatch(updateModelInfo(modelInfo));
        }
      }
      done();
    });
  });
  return new Promise(resolve => {
    queue.onDone(() => {
      resolve();
    });
  });
}

export {
  fetchAllModelStatuses,
  fetchAndStoreModelStatus,
  LocalMacaroonStore,
  loginWithBakery
};
