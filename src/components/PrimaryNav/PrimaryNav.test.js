import React from "react";
import { BrowserRouter as Router, MemoryRouter } from "react-router-dom";
import { mount } from "enzyme";
import configureStore from "redux-mock-store";
import { Provider } from "react-redux";
import dataDump from "testing/complete-redux-store-dump";

import PrimaryNav from "./PrimaryNav";

const mockStore = configureStore([]);
describe("Primary Nav", () => {
  it("toggles external nav menu", () => {
    const store = mockStore(dataDump);
    const wrapper = mount(
      <Provider store={store}>
        <Router>
          <PrimaryNav />
        </Router>
      </Provider>
    );

    const primaryNav = ".p-primary-nav";
    const primaryNavToggle = ".p-primary-nav__toggle";
    expect(wrapper.find(primaryNav).hasClass("ext-nav-open")).toEqual(false);
    wrapper.find(primaryNavToggle).simulate("click");
    const actions = store.getActions();
    const expectedPayload = { payload: true, type: "TOGGLE_EXTERNAL_NAV" };
    expect(actions).toEqual([expectedPayload]);
  });

  it("external nav is active when externalNavActive in redux store is true", () => {
    const store = mockStore({
      root: { config: {} },
      ui: { externalNavActive: true },
    });
    const wrapper = mount(
      <Provider store={store}>
        <Router>
          <PrimaryNav />
        </Router>
      </Provider>
    );

    expect(wrapper.find(".p-primary-nav").hasClass("ext-nav-open")).toEqual(
      true
    );
  });

  it("applies is-selected state correctly", () => {
    const store = mockStore(dataDump);
    const wrapper = mount(
      <Provider store={store}>
        <MemoryRouter initialEntries={["/controllers"]}>
          <PrimaryNav />
        </MemoryRouter>
      </Provider>
    );
    expect(wrapper.find("a.is-selected").text()).toStrictEqual("Controllers");
  });

  it("displays correct number of blocked models", () => {
    const store = mockStore(dataDump);
    const wrapper = mount(
      <Provider store={store}>
        <MemoryRouter initialEntries={["/"]}>
          <PrimaryNav />
        </MemoryRouter>
      </Provider>
    );
    expect(wrapper.find(".entity-count").text()).toStrictEqual("6");
  });

  it("displays the JAAS logo under JAAS", () => {
    const store = mockStore(dataDump);
    const wrapper = mount(
      <Provider store={store}>
        <MemoryRouter initialEntries={["/"]}>
          <PrimaryNav />
        </MemoryRouter>
      </Provider>
    );
    expect(wrapper.find(".p-primary-nav__logo-text").prop("src")).toBe(
      "logo-text.svg"
    );
    expect(wrapper.find(".p-primary-nav__logo").prop("href")).toBe(
      "https://jaas.ai"
    );
  });

  it("displays the Juju logo under Juju", () => {
    const store = mockStore({
      root: { config: { isJuju: true } },
    });
    const wrapper = mount(
      <Provider store={store}>
        <MemoryRouter initialEntries={["/"]}>
          <PrimaryNav />
        </MemoryRouter>
      </Provider>
    );
    expect(wrapper.find(".p-primary-nav__logo-text").prop("src")).toBe(
      "juju-text.svg"
    );
    expect(wrapper.find(".p-primary-nav__logo").prop("href")).toBe(
      "https://juju.is"
    );
  });

  it("displays the version number", () => {
    const store = mockStore(dataDump);
    const wrapper = mount(
      <Provider store={store}>
        <MemoryRouter initialEntries={["/"]}>
          <PrimaryNav />
        </MemoryRouter>
      </Provider>
    );
    expect(wrapper.find(".version").text()).toBe("Version 0.1.0");
  });
});
