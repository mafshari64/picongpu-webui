import React, { useState, useCallback, useEffect } from 'react';
import axios from 'axios';

const getNestedValue = (obj, path) => {
  return path.split(/[\.\[\]]+/).filter(Boolean).reduce((current, key) => {
    if (current && key.includes('[')) {
      const [arrayKey, index] = key.replace(']', '').split('[');
      return current[arrayKey] && current[arrayKey][index] !== undefined ? current[arrayKey][index] : undefined;
    }
    return current && current[key] !== undefined ? current[key] : undefined;
  }, obj);
};

const setNestedValue = (obj, path, value) => {
  const pathParts = path.split(/[\.\[\]]+/).filter(Boolean);
  let current = obj;
  for (let i = 0; i < pathParts.length - 1; i++) {
    const part = pathParts[i];
    const isArrayIndex = !isNaN(parseInt(part));
    if (!(part in current) || current[part] === null || current[part] === undefined) {
      current[part] = isArrayIndex ? [] : {};
    }
    current = current[part];
  }
  const lastPart = pathParts[pathParts.length - 1];
  current[lastPart] = value;
};

const resolveRef = (rootSchema, refPath) => {
  if (!rootSchema || !refPath) return null;
  try {
    const pathParts = refPath.replace(/^#\//, "").split("/");
    let current = rootSchema;
    for (const part of pathParts) {
      if (!current || !(part in current)) return null;
      current = current[part];
    }
    return current;
  } catch {
    return null;
  }
};

const generatePlaceholder = (fieldName, fieldSchema) => {
  if (fieldSchema.enum) return `Select ${fieldName}`;
  if (fieldSchema.type === "array") return JSON.stringify(fieldSchema.default || []);
  if (fieldSchema.type === "number" || fieldSchema.type === "integer") return `Enter ${fieldName} (e.g., ${fieldSchema.default || 0})`;
  if (fieldSchema.type === "boolean") return `Check to enable ${fieldName}`;
  return `Enter ${fieldName}`;
};

const validateField = (fieldKey, value, fieldSchema) => {
  if (!fieldSchema) return null;
  if (fieldSchema.required && (value === undefined || value === "" || value === null)) {
    return `${fieldKey} is required`;
  }
  if (fieldSchema.type === "array" && typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (!Array.isArray(parsed)) return `${fieldKey} must be an array`;
    } catch {
      return `${fieldKey} must be valid JSON array`;
    }
  }
  return null;
};

const initializeValues = (schema) => {
  if (!schema?.properties) return {};

  const vals = {};

  Object.entries(schema.properties).forEach(([k, f]) => {
    if (k === "OUTPUT_DIRECTORY_PATH") return;
    if (f.type === "array" && f.default) vals[k] = [...f.default];
    else if (f.type === "boolean") vals[k] = f.default ?? false;
    else if (f.default !== undefined) vals[k] = f.default;
    else vals[k] = f.type === "array" ? [] : f.type === "number" || f.type === "integer" ? 0 : "";
  });

  vals.ENABLE_IONS = vals.ENABLE_IONS ?? true;
  vals.ENABLE_IONIZATION = vals.ENABLE_IONIZATION ?? false;
  vals.ADD_CUSTOM_INPUT = vals.ADD_CUSTOM_INPUT ?? true;
  vals.OUTPUT_DIRECTORY_PATH = vals.OUTPUT_DIRECTORY_PATH ?? "lwfa";
  vals.n_macroparticles_per_cell = vals.n_macroparticles_per_cell ?? 2;
  vals.picongpu_n_gpus = vals.picongpu_n_gpus ?? [2, 4, 1];
  vals.pulse_init = vals.pulse_init ?? 15.0;
  vals.max_steps = vals.max_steps ?? 4000;
  vals.time_step_size = vals.time_step_size ?? 1.39e-16;
  vals.moving_window_move_point = vals.moving_window_move_point ?? 0.9;
  vals.walltime_hours = vals.walltime_hours ?? 2.0;
  vals.number_of_cells = vals.number_of_cells ?? [192, 2048, 192];
  vals.cell_size = vals.cell_size ?? [0.1772e-6, 0.4430e-7, 0.1772e-6];
  vals.lower_bound = vals.lower_bound ?? [0.0, 0.0, 0.0];
  vals.upper_bound = vals.upper_bound ?? [192 * 0.1772e-6, 2048 * 0.4430e-7, 192 * 0.1772e-6];
  vals.lower_boundary_conditions = vals.lower_boundary_conditions ?? ["open", "open", "open"];
  vals.upper_boundary_conditions = vals.upper_boundary_conditions ?? ["open", "open", "open"];
  vals.solver_method = vals.solver_method ?? "Yee";
  vals.density = vals.density ?? 1e25;
  vals.center_front = vals.center_front ?? 8e-5;
  vals.sigma_front = vals.sigma_front ?? 8e-5;
  vals.center_rear = vals.center_rear ?? 1e-4;
  vals.sigma_rear = vals.sigma_rear ?? 8e-5;
  vals.factor = vals.factor ?? -1.0;
  vals.power = vals.power ?? 4.0;
  vals.vacuum_cells_front = vals.vacuum_cells_front ?? 50;
  vals.wavelength = vals.wavelength ?? 0.8e-6;
  vals.waist = vals.waist ?? 5.0e-6 / 1.17741;
  vals.duration = vals.duration ?? 5e-15;
  vals.propagation_direction = vals.propagation_direction ?? [0.0, 1.0, 0.0];
  vals.polarization_direction = vals.polarization_direction ?? [1.0, 0.0, 0.0];
  vals.focal_position = vals.focal_position ?? [192 * 0.1772e-6 / 2, 4.62e-5, 192 * 0.1772e-6 / 2];
  vals.centroid_position = vals.centroid_position ?? [192 * 0.1772e-6 / 2, -0.5 * 15.0 * 5.0e-15 * 3e8, 192 * 0.1772e-6 / 2];
  vals.a0 = vals.a0 ?? 1.0;
  vals.phase = vals.phase ?? 0.0;
  vals.polarization_type = vals.polarization_type ?? "LINEAR";
  vals.species = vals.species ?? [{ particle_type: "electron", name: "electron" }];
  vals.ionization_models = vals.ionization_models ?? [];
  vals.diagnostics = vals.diagnostics ?? [{
    type: "PhaseSpace",
    species_name: "electron",
    period: "[::100, 50:72:7, 17]",
    spatial_coordinate: "y",
    momentum_coordinate: "py",
    min_momentum: -1.0,
    max_momentum: 1.0,
    bin_count: 1024,
    min_energy: 0.0,
    max_energy: 1000.0
  }];
  vals.custom_user_input = vals.custom_user_input ?? { minimum_weight: 10.0 };

  const nc = Array.isArray(vals.number_of_cells) ? vals.number_of_cells : [];
  const cs = Array.isArray(vals.cell_size) ? vals.cell_size : [];
  if (nc.length && cs.length && nc.length === cs.length) {
    vals.upper_bound = nc.map((n, i) => n * cs[i]);
  } else {
    vals.upper_bound = [0, 0, 0];
  }

  return vals;
};

const PICMIInputForm = ({ schema }) => {
  const [values, setValues] = useState(() => initializeValues(schema));
  const [errorMessages, setErrorMessages] = useState({});
  const [submissionStatus, setSubmissionStatus] = useState(null);
  const [baseDirectory, setBaseDirectory] = useState('lwfa');
  const [simulationName, setSimulationName] = useState('sim');

  useEffect(() => {
    if (Object.keys(errorMessages).length > 0) {
      console.log('Current Validation Errors:', errorMessages);
    } else {
      console.log('No Validation Errors - Button Should Be Enabled');
    }
  }, [errorMessages]);

  const handleChange = useCallback(
    (fieldName, value, fieldSchema, parentKey = "") => {
      const fieldKey = parentKey ? `${parentKey}.${fieldName}` : fieldName;
      setValues((prev) => {
        const newValues = { ...prev };
        let parsedValue = value;

        if (fieldSchema?.type === "array" && typeof value === "string") {
          try {
            const arr = JSON.parse(value);
            if (Array.isArray(arr)) parsedValue = arr;
          } catch {
            console.warn(`Invalid JSON for ${fieldKey}`);
          }
        } else if (fieldSchema?.type === "integer" || fieldSchema?.type === "number") {
          parsedValue = isNaN(parseFloat(value)) ? "" : parseFloat(value);
        } else if (fieldSchema?.type === "boolean") {
          parsedValue = value;
        }

        setNestedValue(newValues, fieldKey, parsedValue);

        if (fieldKey === "number_of_cells" || fieldKey === "cell_size") {
          const numberCells = Array.isArray(newValues.number_of_cells) ? newValues.number_of_cells : [];
          const cellSize = Array.isArray(newValues.cell_size) ? newValues.cell_size : [];
          if (numberCells.length > 0 && cellSize.length > 0 && numberCells.length === cellSize.length) {
            const upperBound = numberCells.map((n, i) => n * cellSize[i]);
            setNestedValue(newValues, "upper_bound", upperBound);
          } else {
            setNestedValue(newValues, "upper_bound", []);
          }
        }

        if (fieldKey === "ENABLE_IONIZATION") {
          const species = Array.isArray(newValues.species) ? newValues.species : [];
          newValues.species = species.map((spec) => {
            if (spec.particle_type === "electron") {
              return { ...spec, charge_state: null, picongpu_fixed_charge: null };
            }
            if (value) {
              return { ...spec, charge_state: spec.charge_state ?? 0, picongpu_fixed_charge: null };
            } else {
              return { ...spec, charge_state: null, picongpu_fixed_charge: spec.picongpu_fixed_charge ?? true };
            }
          });
        }

        return newValues;
      });

      const error = validateField(fieldKey, value, fieldSchema);
      setErrorMessages((prev) => ({ ...prev, [fieldKey]: error }));
    },
    []
  );

  const handleNestedChange = (index, fieldName, value, pathPrefix, fieldSchema) => {
    let parsedValue = value;
    if (fieldSchema?.type === "array" && typeof value === "string") {
      try {
        parsedValue = JSON.parse(value);
        if (!Array.isArray(parsedValue)) return;
      } catch {
        console.warn(`Invalid JSON for ${pathPrefix}[${index}].${fieldName}`);
        return;
      }
    } else if (fieldSchema?.type === "integer" || fieldSchema?.type === "number") {
      parsedValue = isNaN(parseFloat(value)) ? "" : parseFloat(value);
    } else if (fieldSchema?.type === "boolean") {
      parsedValue = value;
    }

    setValues((prev) => {
      const newValues = { ...prev };
      const targetArray = getNestedValue(newValues, pathPrefix) || [];
      if (index >= 0 && index < targetArray.length) {
        targetArray[index] = { ...targetArray[index], [fieldName]: parsedValue };
        setNestedValue(newValues, pathPrefix, [...targetArray]);
      }
      return newValues;
    });

    const error = validateField(`${pathPrefix}[${index}].${fieldName}`, parsedValue, fieldSchema);
    setErrorMessages((prev) => ({ ...prev, [`${pathPrefix}[${index}].${fieldName}`]: error }));
  };

  const renderDiagnostics = (diagnosticsSchema) => {
    const diagnostics = Array.isArray(getNestedValue(values, "diagnostics")) ? getNestedValue(values, "diagnostics") : [];
    const diagnosticsItemSchema = diagnosticsSchema.items?.$ref ? resolveRef(schema, diagnosticsSchema.items.$ref) : diagnosticsSchema.items;

    if (!diagnosticsItemSchema) {
      return <div className="text-red-500 text-sm">Diagnostics schema is invalid</div>;
    }

    return (
      <div className="diagnostics-section p-6 bg-gray-50 rounded-lg shadow-md">
        <h3 className="text-xl font-semibold mb-4 text-gray-800">Diagnostics</h3>
        {diagnostics.map((diagnostic, index) => {
          const diagnosticPath = `diagnostics[${index}]`;
          return (
            <div key={diagnosticPath} className="diagnostic-item mb-6 p-4 bg-white rounded-lg shadow-sm border border-gray-200">
              <h4 className="text-lg font-medium mb-3 text-gray-700">Diagnostic {index + 1}</h4>
              {Object.entries(diagnosticsItemSchema.properties).map(([propName, propSchema]) => {
                const propKey = `${diagnosticPath}.${propName}`;
                const currentValue = getNestedValue(values, propKey) ?? propSchema.default;
                return (
                  <div key={propKey} className="form-group mb-3">
                    <label className="block text-sm font-medium text-gray-600">{propSchema.title || propName}:</label>
                    {propName === "species_name" ? (
                      <select
                        value={currentValue || ""}
                        onChange={(e) => handleNestedChange(index, propName, e.target.value, "diagnostics", propSchema)}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="">Select species</option>
                        {(values.species || []).map((s) => (
                          <option key={s.name} value={s.name}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    ) : propSchema.enum ? (
                      <select
                        value={currentValue || ""}
                        onChange={(e) => handleNestedChange(index, propName, e.target.value, "diagnostics", propSchema)}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="">Select</option>
                        {propSchema.enum.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    ) : propSchema.type === "array" ? (
                      <textarea
                        value={Array.isArray(currentValue) ? JSON.stringify(currentValue) : JSON.stringify(propSchema.default || [])}
                        onChange={(e) => {
                          try {
                            const parsed = JSON.parse(e.target.value);
                            if (Array.isArray(parsed)) handleNestedChange(index, propName, parsed, "diagnostics", propSchema);
                          } catch {}
                        }}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500"
                        placeholder={generatePlaceholder(propName, propSchema)}
                      />
                    ) : propSchema.type === "boolean" ? (
                      <input
                        type="checkbox"
                        checked={!!currentValue}
                        onChange={(e) => handleNestedChange(index, propName, e.target.checked, "diagnostics", propSchema)}
                        className="mt-1 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                    ) : (
                      <input
                        type={propSchema.type === "integer" || propSchema.type === "number" ? "number" : "text"}
                        step={propSchema.type === "integer" ? "1" : undefined}
                        value={currentValue ?? ""}
                        onChange={(e) => {
                          const val = propSchema.type === "integer" || propSchema.type === "number" ? parseFloat(e.target.value) : e.target.value;
                          handleNestedChange(index, propName, isNaN(val) ? "" : val, "diagnostics", propSchema);
                        }}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500"
                        placeholder={generatePlaceholder(propName, propSchema)}
                      />
                    )}
                    {errorMessages[propKey] && <span className="text-red-500 text-sm">{errorMessages[propKey]}</span>}
                  </div>
                );
              })}
              <button
                type="button"
                onClick={() => {
                  setValues((prev) => ({
                    ...prev,
                    diagnostics: prev.diagnostics.filter((_, i) => i !== index),
                  }));
                }}
                className="mt-3 bg-red-500 text-white px-4 py-2 rounded-md hover:bg-red-600 transition-colors"
              >
                Remove Diagnostic
              </button>
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => {
            const newDiag = {};
            Object.entries(diagnosticsItemSchema.properties).forEach(([k, v]) => {
              newDiag[k] = v.default ?? (v.type === "array" ? [] : v.type === "string" ? "" : 0);
            });
            setValues((prev) => ({
              ...prev,
              diagnostics: [...(prev.diagnostics || []), newDiag],
            }));
          }}
          className="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 transition-colors"
        >
          Add Diagnostic
        </button>
      </div>
    );
  };

  const renderSpeciesList = (speciesSchema) => {
    const species = Array.isArray(values.species) ? values.species : [];
    const speciesItemSchema = speciesSchema.items?.$ref ? resolveRef(schema, speciesSchema.items.$ref) : speciesSchema.items;
    const enableIonization = values.ENABLE_IONIZATION || false;
    const enableIons = values.ENABLE_IONS || false;

    return (
      <div className="species-section p-6 bg-gray-50 rounded-lg shadow-md">
        <h3 className="text-xl font-semibold mb-4 text-gray-800">Species</h3>
        {species.map((spec, index) => {
          const speciesPath = `species[${index}]`;
          const isElectron = spec.particle_type === "electron";
          const fields = ["particle_type", "name"];
          if (!isElectron) {
            if (enableIonization) {
              fields.push("charge_state");
            } else if (enableIons) {
              fields.push("picongpu_fixed_charge");
            }
          }

          return (
            <div key={speciesPath} className="species-item mb-6 p-4 bg-white rounded-lg shadow-sm border border-gray-200">
              <h4 className="text-lg font-medium mb-3 text-gray-700">Species {index + 1}</h4>
              {fields.map((propName) => {
                const propSchema = speciesItemSchema.properties[propName];
                const propKey = `${speciesPath}.${propName}`;
                const currentValue = getNestedValue(values, propKey) ?? propSchema.default;
                return (
                  <div key={propKey} className="form-group mb-3">
                    <label className="block text-sm font-medium text-gray-600">{propSchema.title || propName}:</label>
                    {propName === "particle_type" ? (
                      <select
                        value={currentValue || ""}
                        onChange={(e) => {
                          handleNestedChange(index, propName, e.target.value, "species", propSchema);
                          if (e.target.value === "electron") {
                            handleNestedChange(index, "charge_state", null, "species", speciesItemSchema.properties.charge_state);
                            handleNestedChange(index, "picongpu_fixed_charge", null, "species", speciesItemSchema.properties.picongpu_fixed_charge);
                          }
                        }}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="">Select</option>
                        {propSchema.enum.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    ) : propName === "picongpu_fixed_charge" ? (
                      <input
                        type="checkbox"
                        checked={!!currentValue}
                        onChange={(e) => handleNestedChange(index, propName, e.target.checked, "species", propSchema)}
                        className="mt-1 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                    ) : propName === "charge_state" ? (
                      <input
                        type="number"
                        step="1"
                        value={currentValue ?? ""}
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          handleNestedChange(index, propName, isNaN(val) ? "" : val, "species", propSchema);
                        }}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500"
                        placeholder={generatePlaceholder(propName, propSchema)}
                      />
                    ) : (
                      <input
                        type="text"
                        value={currentValue ?? ""}
                        onChange={(e) => handleNestedChange(index, propName, e.target.value, "species", propSchema)}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500"
                        placeholder={generatePlaceholder(propName, propSchema)}
                      />
                    )}
                    {errorMessages[propKey] && <span className="text-red-500 text-sm">{errorMessages[propKey]}</span>}
                  </div>
                );
              })}
              <button
                type="button"
                onClick={() => {
                  setValues((prev) => ({
                    ...prev,
                    species: prev.species.filter((_, i) => i !== index),
                  }));
                }}
                className="mt-3 bg-red-500 text-white px-4 py-2 rounded-md hover:bg-red-600 transition-colors"
              >
                Remove Species
              </button>
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => {
            const newSpecies = { particle_type: "H", name: `hydrogen_${species.length + 1}` };
            if (enableIonization) {
              newSpecies.charge_state = 0;
            } else if (enableIons) {
              newSpecies.picongpu_fixed_charge = true;
            }
            setValues((prev) => ({
              ...prev,
              species: [...(prev.species || []), newSpecies],
            }));
          }}
          className="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 transition-colors"
        >
          Add Species
        </button>
      </div>
    );
  };

  const renderIonizationModels = (ionizationSchema) => {
    const models = Array.isArray(values.ionization_models) ? values.ionization_models : [];
    const modelItemSchema = ionizationSchema.items?.$ref ? resolveRef(schema, ionizationSchema.items.$ref) : ionizationSchema.items;

    return (
      <div className="ionization-section p-6 bg-gray-50 rounded-lg shadow-md">
        <h3 className="text-xl font-semibold mb-4 text-gray-800">Ionization Models</h3>
        {models.map((model, index) => {
          const modelPath = `ionization_models[${index}]`;
          return (
            <div key={modelPath} className="ionization-model mb-6 p-4 bg-white rounded-lg shadow-sm border border-gray-200">
              <h4 className="text-lg font-medium mb-3 text-gray-700">Ionization Model {index + 1}</h4>
              {Object.entries(modelItemSchema.properties).map(([propName, propSchema]) => {
                const propKey = `${modelPath}.${propName}`;
                const currentValue = getNestedValue(values, propKey) ?? propSchema.default;
                return (
                  <div key={propKey} className="form-group mb-3">
                    <label className="block text-sm font-medium text-gray-600">{propSchema.title || propName}:</label>
                    {propName === "ion_species" ? (
                      <select
                        value={currentValue || ""}
                        onChange={(e) => handleNestedChange(index, propName, e.target.value, "ionization_models", propSchema)}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="">Select species</option>
                        {(values.species || []).filter(s => s.particle_type !== "electron").map((s) => (
                          <option key={s.name} value={s.name}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    ) : propSchema.enum ? (
                      <select
                        value={currentValue || ""}
                        onChange={(e) => handleNestedChange(index, propName, e.target.value, "ionization_models", propSchema)}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="">Select</option>
                        {propSchema.enum.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    ) : propSchema.type === "array" ? (
                      <textarea
                        value={Array.isArray(currentValue) ? JSON.stringify(currentValue) : JSON.stringify(propSchema.default || [])}
                        onChange={(e) => {
                          try {
                            const parsed = JSON.parse(e.target.value);
                            if (Array.isArray(parsed)) handleNestedChange(index, propName, parsed, "ionization_models", propSchema);
                          } catch {}
                        }}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500"
                        placeholder={generatePlaceholder(propName, propSchema)}
                      />
                    ) : (
                      <input
                        type={propSchema.type === "integer" || propSchema.type === "number" ? "number" : "text"}
                        step={propSchema.type === "integer" ? "1" : undefined}
                        value={currentValue ?? ""}
                        onChange={(e) => {
                          const val = propSchema.type === "integer" || propSchema.type === "number" ? parseFloat(e.target.value) : e.target.value;
                          handleNestedChange(index, propName, isNaN(val) ? "" : val, "ionization_models", propSchema);
                        }}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500"
                        placeholder={generatePlaceholder(propName, propSchema)}
                      />
                    )}
                    {errorMessages[propKey] && <span className="text-red-500 text-sm">{errorMessages[propKey]}</span>}
                  </div>
                );
              })}
              <button
                type="button"
                onClick={() => {
                  setValues((prev) => ({
                    ...prev,
                    ionization_models: prev.ionization_models.filter((_, i) => i !== index),
                  }));
                }}
                className="mt-3 bg-red-500 text-white px-4 py-2 rounded-md hover:bg-red-600 transition-colors"
              >
                Remove Ionization Model
              </button>
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => {
            const newModel = {};
            Object.entries(modelItemSchema.properties).forEach(([k, v]) => {
              newModel[k] = v.default ?? (v.type === "array" ? [] : v.type === "string" ? "" : 0);
            });
            setValues((prev) => ({
              ...prev,
              ionization_models: [...(prev.ionization_models || []), newModel],
            }));
          }}
          className="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 transition-colors"
        >
          Add Ionization Model
        </button>
      </div>
    );
  };

  const renderCustomUserInput = (customSchema) => {
    const customItemSchema = customSchema?.$ref ? resolveRef(schema, customSchema.$ref) : customSchema;
    const customPath = "custom_user_input";
    const currentValue = getNestedValue(values, customPath) || {};

    return (
      <div className="custom-user-input-section p-6 bg-gray-50 rounded-lg shadow-md">
        <h3 className="text-xl font-semibold mb-4 text-gray-800">Custom User Input</h3>
        <div className="custom-user-input mb-6 p-4 bg-white rounded-lg shadow-sm border border-gray-200">
          {Object.entries(customItemSchema.properties).map(([propName, propSchema]) => {
            const propKey = `${customPath}.${propName}`;
            const value = getNestedValue(values, propKey) ?? propSchema.default;
            return (
              <div key={propKey} className="form-group mb-3">
                <label className="block text-sm font-medium text-gray-600">{propSchema.title || propName}:</label>
                <input
                  type={propSchema.type === "integer" || propSchema.type === "number" ? "number" : "text"}
                  step={propSchema.type === "integer" ? "1" : undefined}
                  value={value ?? ""}
                  onChange={(e) => {
                    const val = propSchema.type === "integer" || propSchema.type === "number" ? parseFloat(e.target.value) : e.target.value;
                    handleChange(propName, isNaN(val) ? "" : val, propSchema, customPath);
                  }}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500"
                  placeholder={generatePlaceholder(propName, propSchema)}
                />
                {errorMessages[propKey] && <span className="text-red-500 text-sm">{errorMessages[propKey]}</span>}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderFields = (fieldSchema, parentKey = "") => {
    if (!fieldSchema?.properties) return null;

    return Object.entries(fieldSchema.properties).map(([fieldName, fieldSchema]) => {
      if (fieldName === "OUTPUT_DIRECTORY_PATH") return null;
      const fieldKey = parentKey ? `${parentKey}.${fieldName}` : fieldName;
      const currentValue = getNestedValue(values, fieldKey);

      if (fieldSchema['$ref']) {
        const refSchema = resolveRef(schema, fieldSchema['$ref']);
        if (!refSchema) return <div key={fieldKey} className="text-red-500 text-sm">Error: $ref not found</div>;
        if (fieldName === "custom_user_input") {
          return <div key={fieldKey} className="p-4">{renderCustomUserInput(fieldSchema)}</div>;
        }
        return (
          <div key={fieldKey} className="form-group mb-3">
            <label className="block text-sm font-medium text-gray-600">{fieldSchema.title || fieldName}:</label>
            <input
              type="text"
              value={JSON.stringify(currentValue ?? refSchema.default ?? {})}
              readOnly
              className="mt-1 block w-full rounded-md border-gray-300 bg-gray-100"
            />
          </div>
        );
      }

      if (fieldSchema.type === "object") {
        return (
          <fieldset key={fieldKey} className="nested-fieldset mt-3 p-4 bg-gray-100 rounded-lg border border-gray-200">
            <legend className="text-sm font-medium text-gray-600">{fieldSchema.title || fieldName}</legend>
            {renderFields(fieldSchema, fieldKey)}
          </fieldset>
        );
      }

      if (fieldSchema.type === "array" && fieldName === "species") {
        return <div key={fieldKey} className="p-4">{renderSpeciesList(fieldSchema)}</div>;
      }

      if (fieldSchema.type === "array" && fieldName === "ionization_models") {
        return <div key={fieldKey} className="p-4">{renderIonizationModels(fieldSchema)}</div>;
      }

      if (fieldSchema.type === "array" && fieldName === "diagnostics") {
        return <div key={fieldKey} className="p-4">{renderDiagnostics(fieldSchema)}</div>;
      }

      if (fieldSchema.type === "array") {
        const isReadOnly = fieldKey.includes("upper_bound");
        const val = Array.isArray(currentValue)
          ? currentValue
          : (fieldSchema.default ? [...fieldSchema.default] : []);
        return (
          <div key={fieldKey} className="form-group mb-3">
            <label className="block text-sm font-medium text-gray-600">{fieldSchema.title || fieldName}:</label>
            <textarea
              value={JSON.stringify(val)}
              onChange={(e) => {
                if (isReadOnly) return;
                try {
                  const parsed = JSON.parse(e.target.value);
                  if (Array.isArray(parsed)) handleChange(fieldName, parsed, fieldSchema, parentKey);
                } catch {
                  console.warn(`Invalid JSON for ${fieldKey}`);
                }
              }}
              readOnly={isReadOnly}
              className={isReadOnly
                ? "mt-1 block w-full rounded-md border-gray-300 bg-gray-100 resize-none"
                : "mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500 resize-none"}
              style={{ whiteSpace: 'nowrap', height: '2.5em', overflowX: 'auto' }}
              placeholder={generatePlaceholder(fieldName, fieldSchema)}
            />
            {errorMessages[fieldKey] && <span className="text-red-500 text-sm">{errorMessages[fieldKey]}</span>}
          </div>
        );
      }

      if (fieldSchema.enum) {
        return (
          <div key={fieldKey} className="form-group mb-3">
            <label className="block text-sm font-medium text-gray-600">{fieldSchema.title || fieldName}:</label>
            <select
              value={currentValue || ""}
              onChange={(e) => handleChange(fieldName, e.target.value, fieldSchema, parentKey)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Select</option>
              {fieldSchema.enum.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
            {errorMessages[fieldKey] && <span className="text-red-500 text-sm">{errorMessages[fieldKey]}</span>}
          </div>
        );
      }

      if (fieldSchema.type === "boolean") {
        return (
          <div key={fieldKey} className="form-group mb-3 flex items-center">
            <label className="text-sm font-medium text-gray-600 mr-2">{fieldSchema.title || fieldName}:</label>
            <input
              type="checkbox"
              checked={!!currentValue}
              onChange={(e) => handleChange(fieldName, e.target.checked, fieldSchema, parentKey)}
              className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            {errorMessages[fieldKey] && <span className="text-red-500 text-sm ml-2">{errorMessages[fieldKey]}</span>}
          </div>
        );
      }

      return (
        <div key={fieldKey} className="form-group mb-3">
          <label className="block text-sm font-medium text-gray-600">{fieldSchema.title || fieldName}:</label>
          <input
            type={fieldSchema.type === "integer" || fieldSchema.type === "number" ? "number" : "text"}
            step={fieldSchema.type === "integer" ? "1" : undefined}
            value={currentValue ?? ""}
            onChange={(e) => {
              const val = fieldSchema.type === "integer" || fieldSchema.type === "number" ? parseFloat(e.target.value) : e.target.value;
              handleChange(fieldName, isNaN(val) ? "" : val, fieldSchema, parentKey);
            }}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500"
            placeholder={generatePlaceholder(fieldName, fieldSchema)}
          />
          {errorMessages[fieldKey] && <span className="text-red-500 text-sm">{errorMessages[fieldKey]}</span>}
        </div>
      );
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmissionStatus('Submitting...');

    const errors = {};

    if (!simulationName) errors.simulationName = 'Simulation name is required';
    if (!baseDirectory) errors.baseDirectory = 'Base directory is required';

    const required = schema?.required ?? [];
    required.forEach((field) => {
      if (field === "OUTPUT_DIRECTORY_PATH") return;
      if (values[field] === undefined || values[field] === "" || 
          (Array.isArray(values[field]) && values[field].length === 0)) {
        errors[field] = `${field} is required`;
      }
    });

    (values.species ?? []).forEach((s, i) => {
      if (!s.particle_type) errors[`species[${i}].particle_type`] = 'Particle type required';
      if (!s.name) errors[`species[${i}].name`] = 'Name required';

      if (s.particle_type !== "electron") {
        if (values.ENABLE_IONIZATION && s.charge_state === undefined)
          errors[`species[${i}].charge_state`] = 'Charge state required when ionization is on';
        if (!values.ENABLE_IONIZATION && values.ENABLE_IONS && s.picongpu_fixed_charge === undefined)
          errors[`species[${i}].picongpu_fixed_charge`] = 'Fixed charge required when ionization is off';
      }
    });

    const electronSpecies = (values.species ?? []).filter(s => s.particle_type === "electron");
    if (electronSpecies.length !== 1) {
      errors['species'] = 'Exactly one electron species must be defined';
    }

    (values.ionization_models ?? []).forEach((m, i) => {
      const exists = (values.species ?? []).some((s) => s.name === m.ion_species);
      if (!exists) errors[`ionization_models[${i}].ion_species`] = 'Ion species not defined';
    });

    if (Object.keys(errors).length) {
      console.log('Validation Errors in handleSubmit:', errors);
      setErrorMessages(errors);
      setSubmissionStatus('Please fix errors');
      return;
    }

    try {
      const payload = {
        ...values,
        OUTPUT_DIRECTORY_PATH: `${baseDirectory}/${simulationName}`,
        species: [
          ...(electronSpecies.length === 1 ? values.species : [
            { particle_type: "electron", name: "electron" },
            ...(values.species ?? []).filter(s => s.particle_type !== "electron")
          ])
        ]
      };
      console.log('Sending Payload:', payload);
      const resp = await axios.post('http://localhost:8000/generate-picmi', payload);
      console.log('Response:', resp.data);
      setSubmissionStatus(`Success: ${resp.data.file_path}`);
    } catch (err) {
      console.error('Request Error:', err.response?.data || err.message);
      setSubmissionStatus(`Error: ${err.response?.data?.detail || err.message}`);
    }
  };

  if (!schema?.properties) {
    return <div className="text-red-500 text-sm">Invalid schema</div>;
  }

  return (
    <div className="p-6 max-w-4xl mx-auto bg-white rounded-lg shadow-lg">
      <div className="flex items-center mb-6">
        <img src="/picongpu-logo.png" alt="PIConGPU Logo" className="h-12 mr-4" />
        <h2 className="text-2xl font-bold text-gray-800">PIConGPU Simulation Input</h2>
      </div>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-600">Output Directory:</label>
            <input
              type="text"
              value={baseDirectory}
              onChange={(e) => setBaseDirectory(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500"
              placeholder="Enter output directory (e.g., lwfa)"
            />
            {errorMessages.baseDirectory && <span className="text-red-500 text-sm">{errorMessages.baseDirectory}</span>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600">Simulation Name:</label>
            <input
              type="text"
              value={simulationName}
              onChange={(e) => setSimulationName(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500"
              placeholder="Enter simulation name (e.g., sim)"
            />
            {errorMessages.simulationName && <span className="text-red-500 text-sm">{errorMessages.simulationName}</span>}
          </div>
        </div>
        {Object.keys(errorMessages).length > 0 && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative">
            <strong className="font-bold">Errors:</strong>
            <ul className="list-disc pl-5">
              {Object.entries(errorMessages).map(([key, msg]) => (
                <li key={key}>{msg}</li>
              ))}
            </ul>
          </div>
        )}
        {renderFields(schema)}
        <button
          type="submit"
          disabled={Object.keys(errorMessages).length > 0}
          className={Object.keys(errorMessages).length
            ? "w-full bg-gray-400 text-white px-4 py-2 rounded-md cursor-not-allowed"
            : "w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"}
        >
          Generate PICMI Script
        </button>
        {submissionStatus && (
          <div className={`mt-4 text-sm ${submissionStatus.includes('Error') ? 'text-red-500' : 'text-green-500'}`}>
            {submissionStatus}
          </div>
        )}
      </form>
    </div>
  );
};

export default PICMIInputForm;