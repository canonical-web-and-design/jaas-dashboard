import React, { useState, useRef, useEffect } from "react";
import classNames from "classnames";
import { useSelector } from "react-redux";
import { getModelData } from "app/selectors";
import {
  extractCloudName,
  extractOwnerName,
  extractCredentialName,
  pluralize
} from "app/utils";

import "./_filter-tags.scss";

const FilterTags = () => {
  const [filterPanelVisibility, setFilterPanelVisibility] = useState(false);
  const [activeFilters, setActiveFilters] = useState({});

  const node = useRef();
  const filters = {};
  const modelData = useSelector(getModelData);

  /**
  Check if filter exists and adds to array if not
  @param {string} string The type of filter
  @param {string} value The name of the filter
*/
  const addFilter = function(type, value) {
    filters[type] = filters[type] || [];
    if (!filters[type].includes(value)) {
      filters[type].push(value);
    }
  };

  // Loop the model data and pull out the available filters
  Object.values(modelData).forEach(model => {
    if (!model.info) {
      return;
    }
    // Extract cloud filters
    const cloudFilter = extractCloudName(model.info.cloudTag);
    addFilter("cloud", cloudFilter);

    // Extract region filters
    const regionFilter = model.info.cloudRegion;
    addFilter("region", regionFilter);

    // Extract owner filters
    const ownerFilter = extractOwnerName(model.info.ownerTag);
    addFilter("owner", ownerFilter);

    // Extract credential filters
    const credentialFilter = extractCredentialName(
      model.info.cloudCredentialTag
    );
    addFilter("credential", credentialFilter);
  });

  // This useEffect sets up listeners so the panel will close if user clicks anywhere else on the page or hits the escape key
  useEffect(() => {
    const closePanel = () => {
      setFilterPanelVisibility(false);
      document.querySelector(".p-filter-tags__input").blur();
    };

    const mouseDown = e => {
      // Check if click is outside of filter panel
      if (!node.current.contains(e.target)) {
        // If so, close the panel
        closePanel();
      }
    };

    const keyDown = e => {
      if (e.code === "Escape") {
        // Close panel if Esc keydown detected
        closePanel();
      }
    };

    // Add listener on document to capture click events
    document.addEventListener("mousedown", mouseDown);
    // Add listener on document to capture keydown events
    document.addEventListener("keydown", keyDown);
    // return function to be called when unmounted
    return () => {
      document.removeEventListener("mousedown", mouseDown);
      document.removeEventListener("keydown", keyDown);
    };
  }, []);

  /**
  Apply a given filter
  @param {object} e The event object
  @param {string} filter The name of the filter
   @param {string} filterBy The name of the filter group
*/
  const addActiveFilter = (e, filter, filterBy) => {
    setActiveFilters(filters => {
      const updatedFilters = { ...filters };
      updatedFilters[filterBy] = updatedFilters[filterBy] || [];
      if (!updatedFilters[filterBy].includes(filter)) {
        updatedFilters[filterBy].push(filter);
      }
      return updatedFilters;
    });
    e.currentTarget.classList.add("is-selected");
  };

  /**
  Remove a given filter
  @param {object} e The event object
  @param {string} filter The name of the filter
   @param {string} filterBy The name of the filter group
*/
  const removeActiveFilter = (e, filter, filterBy) => {
    e.stopPropagation();
    setActiveFilters(filters => {
      const updatedFilters = {
        ...filters
      };
      if (updatedFilters[filterBy].includes(filter)) {
        const index = updatedFilters[filterBy].indexOf(filter);
        updatedFilters[filterBy].splice(index, 1);
      }
      return updatedFilters;
    });

    // Remove is-selected state from relevant filter from filter panel
    const panelFilterItems = document.querySelectorAll(
      ".p-filter-panel__button"
    );
    panelFilterItems.forEach(panelFilterItem => {
      if (panelFilterItem.innerHTML === filter) {
        panelFilterItem.classList.remove("is-selected");
      }
    });
  };

  return (
    <div className="p-filter-tags" ref={node}>
      <input
        type="text"
        className="p-filter-tags__input"
        onClick={() => setFilterPanelVisibility(!filterPanelVisibility)}
        placeholder="Filter models"
      />

      <div
        className={classNames("p-card--highlighted p-filter-panel", {
          "is-visible": filterPanelVisibility
        })}
      >

        {Object.entries(filters).length <= 0 && <p>Loading filters...</p>}

        {Object.entries(activeFilters).length > 0 &&
          Object.entries(activeFilters).map(activeFilterObj => {
            return Object.values(activeFilterObj[1]).map(activeFilter => {
              return (
                <span
                  className="p-filter-tags__active-filter"
                  key={activeFilterObj[0] + activeFilter}
                >
                  {activeFilterObj[0]}: {activeFilter}{" "}
                  <i
                    className="p-icon--close"
                    onClick={e =>
                      removeActiveFilter(e, activeFilter, activeFilterObj[0])
                    }
                  >
                    Remove
                  </i>
                </span>
              );
            });
          })}

        {Object.keys(filters).map(filterBy => {
          return (
            filters[filterBy].length > 0 && (
              <div key={filterBy} className="p-filter-panel__section">
                <h4 className="p-filter-panel__heading">
                  {pluralize(filters[filterBy].length, filterBy)}
                </h4>
                <ul
                  className="p-list p-filter-panel__list"
                  data-test={filterBy}
                >
                  {filters[filterBy].map(filter => (
                    <li key={filter} className="p-filter-panel__item">
                      <button
                        onClick={e => addActiveFilter(e, filter, filterBy)}
                        className="p-filter-panel__button"
                        type="button"
                      >
                        {filter}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )
          );
        })}
      </div>
    </div>
  );
};

export default FilterTags;
