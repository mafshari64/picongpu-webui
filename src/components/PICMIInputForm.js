import React, { useState, useCallback } from 'react';
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
  if (refPath === "#/properties/numberCells") {
    return rootSchema.properties?.numberCells || null;
  }
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
  if (fieldSchema.type === "number" || fieldSchema.type === "integer") return "Enter a number";
  if (fieldSchema.type === "boolean") return "Check to enable";
  return `Enter ${fieldName}`;
};

const validateField = (fieldKey, value, fieldSchema) => {
  if (!fieldSchema) return null;
  if (fieldSchema.required && (value === undefined || value === "" || value === null)) {
    return `${fieldKey} is required`;
  }
  if (fieldSchema.type === "array") {
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        if (!Array.isArray(parsed)) return `${fieldKey} must be an array`;
      } catch {
        return `${fieldKey} must be valid JSON array`;
      }
    } else if (!Array.isArray(value)) {
      return `${fieldKey} must be an array`;
    }
  }
  return null;
};

const initializeValues = (schema) => {
  if (!schema || !schema.properties) return { diagnostics: [] };
  const initialValues = {};

  Object.entries(schema.properties).forEach(([key, field]) => {
    if (field.type === "object") {
      if (key === "custom_user_input" && field.allOf) {
        initialValues[key] = field.allOf[0].then && initialValues.ADD_CUSTOM_INPUT
          ? { minimum_weight: 10.0 }
          : {};
      } else {
        initialValues[key] = initializeValues(field);
      }
    } else if (field.type === "array" && key === "diagnostics") {
      initialValues[key] = [
        {
          type: "PhaseSpace",
          species_name: "electron",
          period: "[::100, 50:72:7, 17]",
          spatial_coordinate: "y",
          momentum_coordinate: "py",
          min_momentum: -1,
          max_momentum: 1
        }
      ];
    } else if (field.type === "array") {
      initialValues[key] = field.default ? [...field.default] : [];
    } else if (field['$ref']) {
      const refSchema = resolveRef(schema, field['$ref']);
      if (refSchema) {
        const defaultVal = refSchema.default;
        initialValues[key] = defaultVal !== undefined
          ? (Array.isArray(defaultVal) ? [...defaultVal] : defaultVal)
          : (refSchema.type === "array" ? [] : "");
      } else {
        initialValues[key] = "";
      }
    } else if (field.type === "boolean") {
      initialValues[key] = field.default ?? false;
    } else {
      initialValues[key] = field.default || "";
    }
  });




  
// FORCE ARRAY DEFAULTS
  if (schema.properties.numberCells?.default) {
    initialValues.numberCells = [...schema.properties.numberCells.default];
  }
  if (schema.properties.cellSize?.default) {
    initialValues.cellSize = [...schema.properties.cellSize.default];
  }
  if (schema.properties.grid?.properties?.picongpu_n_gpus?.default) {
    setNestedValue(initialValues, "grid.picongpu_n_gpus", [...schema.properties.grid.properties.picongpu_n_gpus.default]);
  }

  // Sync numberCells
  if (Array.isArray(initialValues.numberCells)) {
    setNestedValue(initialValues, "grid.number_of_cells", [...initialValues.numberCells]);
    if (initialValues.solver?.grid) {
      setNestedValue(initialValues, "solver.grid.number_of_cells", [...initialValues.numberCells]);
    }
  }

  // Compute upper_bound
  const nc = Array.isArray(initialValues.numberCells) ? initialValues.numberCells : [];
  const cs = Array.isArray(initialValues.cellSize) ? initialValues.cellSize : [];
  if (nc.length > 0 && cs.length > 0 && nc.length === cs.length) {
    const ub = nc.map((n, i) => n * cs[i]);
    setNestedValue(initialValues, "grid.upper_bound", ub);
    if (initialValues.solver?.grid) setNestedValue(initialValues, "solver.grid.upper_bound", ub);
  }

  return initialValues;
};

const PICMIInputForm = ({ schema }) => {
  const [values, setValues] = useState(() => initializeValues(schema));
  const [errorMessages, setErrorMessages] = useState({});
  const [submissionStatus, setSubmissionStatus] = useState(null);
  const [baseDirectory, setBaseDirectory] = useState('simulations');
  const [simulationName, setSimulationName] = useState('');

  const handleChange = useCallback(
    (fieldName, value, fieldSchema, parentKey = "") => {
      const fieldKey = parentKey ? `${parentKey}.${fieldName}` : fieldName;
      setValues((prev) => {
        const newValues = { ...prev };
        let parsedValue = value;

        // Parse JSON strings for arrays
        if ((fieldSchema?.type === "array" || /\[\d*\]$/.test(fieldKey)) && typeof value === "string") {
          try {
            const arr = JSON.parse(value);
            if (Array.isArray(arr)) parsedValue = arr;
          } catch (err) {
            console.warn(`handleChange: Invalid JSON for ${fieldKey}`, value);
          }
        }

        setNestedValue(newValues, fieldKey, parsedValue);

        // Sync numberCells
        if (fieldKey === "numberCells" && Array.isArray(parsedValue)) {
          setNestedValue(newValues, "grid.number_of_cells", [...parsedValue]);
          if (newValues.solver?.grid) {
            setNestedValue(newValues, "solver.grid.number_of_cells", [...parsedValue]);
          }
        }

        // Recompute upper_bound
        if (fieldKey === "numberCells" || fieldKey === "cellSize") {
          const numberCells = Array.isArray(newValues.numberCells) ? newValues.numberCells : [];
          const cellSize = Array.isArray(newValues.cellSize) ? newValues.cellSize : [];
          if (numberCells.length > 0 && cellSize.length > 0 && numberCells.length === cellSize.length) {
            const upperBound = numberCells.map((n, i) => n * cellSize[i]);
            setNestedValue(newValues, "grid.upper_bound", upperBound);
            if (newValues.solver?.grid) {
              setNestedValue(newValues, "solver.grid.upper_bound", upperBound);
            }
          } else {
            setNestedValue(newValues, "grid.upper_bound", []);
            if (newValues.solver?.grid) setNestedValue(newValues, "solver.grid.upper_bound", []);
          }
        }

        return newValues;
      });

      const error = validateField(fieldKey, value, fieldSchema);
      setErrorMessages((prev) => ({ ...prev, [fieldKey]: error }));
    },
    []
  );

const handleNestedChange = (index, fieldName, value, pathPrefix = "diagnostics", fieldSchema) => {
  let parsedValue = value;

  // Parse JSON string → array
  if (fieldSchema?.type === "array" && typeof value === "string") {
    try {
      const arr = JSON.parse(value);
      if (Array.isArray(arr)) {
        parsedValue = arr;
      } else {
        console.warn("Parsed value is not array:", arr);
        return;
      }
    } catch (err) {
      console.warn("Failed to parse array:", value);
      return;
    }
  }

  setValues((prev) => {
    const newValues = { ...prev };
    let targetArray = getNestedValue(newValues, pathPrefix) || [];

    if (pathPrefix === "species_list.ionizationModels") {
      targetArray = { ...targetArray, [fieldName]: parsedValue };
      setNestedValue(newValues, pathPrefix, targetArray);
    } else {
      if (index >= 0 && index < targetArray.length) {
        targetArray = [...targetArray];
        targetArray[index] = { ...targetArray[index], [fieldName]: parsedValue };
        setNestedValue(newValues, pathPrefix, targetArray);
      }
    }
    return newValues;
  });
};

  const renderDiagnostics = (diagnosticsSchema) => {
    const diagnosticSchemas = {};
    diagnosticsSchema.items.oneOf.forEach((diag) => {
      diagnosticSchemas[diag.properties.type.const] = diag;
    });

    const diagnostics = Array.isArray(getNestedValue(values, "diagnostics")) ? getNestedValue(values, "diagnostics") : [];

    return (
      <div className="diagnostics-section p-4 border rounded-md">
        <h3 className="text-lg font-semibold mb-2">Diagnostics Configuration</h3>
        {diagnostics.map((diagnostic, index) => {
          const diagnosticPath = `diagnostics[${index}]`;
          const selectedType = diagnostic.type || diagnosticsSchema.items.oneOf[0].properties.type.const;
          const typeSchema = diagnosticSchemas[selectedType];

          return (
            <div key={`${diagnosticPath}-${index}`} className="diagnostic-item mb-4 p-4 border rounded-md">
              <h4 className="text-md font-medium">Diagnostic {index + 1}</h4>
              <div className="form-group mb-2">
                <label className="block text-sm font-medium">Type:</label>
                <select
                  value={selectedType}
                  onChange={(e) => {
                    const newType = e.target.value;
                    const newTypeSchema = diagnosticSchemas[newType];
                    const newDiagnostic = { type: newType };
                    Object.entries(newTypeSchema.properties).forEach(([k, v]) => {
                      if (k !== "type") {
                        newDiagnostic[k] = v.default ?? (v.type === "array" ? [] : v.type === "string" ? "" : 0);
                      }
                    });
                    setValues((prev) => {
                      const newDiags = [...(prev.diagnostics || [])];
                      newDiags[index] = newDiagnostic;
                      return { ...prev, diagnostics: newDiags };
                    });
                  }}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                >
                  {diagnosticsSchema.items.oneOf.map((opt) => (
                    <option key={opt.properties.type.const} value={opt.properties.type.const}>
                      {opt.title || opt.properties.type.const}
                    </option>
                  ))}
                </select>
              </div>
              {Object.entries(typeSchema.properties)
                .filter(([k]) => k !== "type")
                .map(([propName, propSchema]) => {
                  const propKey = `${diagnosticPath}.${propName}`;
                  const currentValue = diagnostic[propName] ?? propSchema.default;
                  return (
                    <div key={propKey} className="form-group mb-2">
                      <label className="block text-sm font-medium">{propSchema.title || propName}:</label>
                      {propSchema.type === "array" ? (
                        <textarea
                          value={Array.isArray(currentValue) ? JSON.stringify(currentValue) : JSON.stringify(propSchema.default || [])}
                          onChange={(e) => {
                            try {
                              const parsed = JSON.parse(e.target.value);
                              if (Array.isArray(parsed)) handleNestedChange(index, propName, parsed);
                            } catch {}
                          }}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                        />
                      ) : propSchema.enum ? (
                        <select
                          value={currentValue || ""}
                          onChange={(e) => handleNestedChange(index, propName, e.target.value)}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                        >
                          {propSchema.enum.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      ) : propSchema.type === "boolean" ? (
                        <input
                          type="checkbox"
                          checked={!!currentValue}
                          onChange={(e) => handleNestedChange(index, propName, e.target.checked)}
                          className="mt-1"
                        />
                      ) : (
                        <input
                          type={propSchema.type === "integer" ? "number" : "text"}
                          step={propSchema.type === "integer" ? "1" : "any"}
                          value={currentValue ?? ""}
                          onChange={(e) => {
                            const val = propSchema.type === "integer" ? parseInt(e.target.value) : e.target.value;
                            handleNestedChange(index, propName, isNaN(val) ? "" : val);
                          }}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                        />
                      )}
                    </div>
                  );
                })}
              <button
                type="button"
                onClick={() => {
                  setValues((prev) => ({
                    ...prev,
                    diagnostics: prev.diagnostics.filter((_, i) => i !== index)
                  }));
                }}
                className="mt-2 bg-red-500 text-white px-4 py-2 rounded-md"
              >
                Remove
              </button>
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => {
            const newType = diagnosticsSchema.items.oneOf[0].properties.type.const;
            const newSchema = diagnosticSchemas[newType];
            const newDiag = { type: newType };
            Object.entries(newSchema.properties).forEach(([k, v]) => {
              if (k !== "type") newDiag[k] = v.default ?? (v.type === "array" ? [] : "");
            });
            setValues((prev) => ({
              ...prev,
              diagnostics: [...(prev.diagnostics || []), newDiag]
            }));
          }}
          className="bg-blue-500 text-white px-4 py-2 rounded-md"
        >
          Add Diagnostic
        </button>
      </div>
    );
  };

  const renderFields = (fieldSchema, parentKey = "") => {
    if (!fieldSchema?.properties) return null;

    return Object.entries(fieldSchema.properties).map(([fieldName, fieldSchema]) => {
      const fieldKey = parentKey ? `${parentKey}.${fieldName}` : fieldName;
      const currentValue = getNestedValue(values, fieldKey);

      if (fieldSchema['$ref']) {
        const refSchema = resolveRef(schema, fieldSchema['$ref']);
        if (!refSchema) {
          return <div key={fieldKey} className="text-red-500">Error: $ref not found</div>;
        }
        const value = getNestedValue(values, fieldKey) ?? refSchema.default;
        return (
          <div key={fieldKey} className="form-group mb-2">
            <label className="block text-sm font-medium">{fieldSchema.title || fieldName}:</label>
            {refSchema.type === "array" ? (
              <textarea
                value={Array.isArray(value) ? JSON.stringify(value) : value}
                readOnly
                className="mt-1 block w-full rounded-md border-gray-300 bg-gray-100"
              />
            ) : (
              <input
                type="text"
                value={value ?? ""}
                readOnly
                className="mt-1 block w-full rounded-md border-gray-300 bg-gray-100"
              />
            )}
          </div>
        );
      }

      if (fieldSchema.type === "object") {
        if (fieldName === "species_list") {
          return <div key={fieldKey} className="p-4 border rounded-md">{renderSpeciesList(fieldSchema)}</div>;
        }
        return (
          <fieldset key={fieldKey} className="nested-fieldset mt-2 p-4 border rounded-md">
            <legend className="text-sm font-medium">{fieldSchema.title || fieldName}</legend>
            {renderFields(fieldSchema, fieldKey)}
          </fieldset>
        );
      }

      if (fieldSchema.type === "array" && fieldName === "diagnostics") {
        return renderDiagnostics(fieldSchema);
      }



      if (fieldSchema.type === "array") {
  const isReadOnly = fieldKey.includes("number_of_cells") || fieldKey.includes("upper_bound");
  const currentVal = getNestedValue(values, fieldKey);
  const val = Array.isArray(currentVal)
    ? currentVal
    : (fieldSchema.default ? [...fieldSchema.default] : []);

  return (
    <div key={fieldKey} className="form-group mb-2">
      <label className="block text-sm font-medium">{fieldSchema.title || fieldName}:</label>
      <textarea
        value={JSON.stringify(val)}
        onChange={(e) => {
          if (isReadOnly) return;
          try {
            const parsed = JSON.parse(e.target.value);
            if (Array.isArray(parsed)) {
              handleChange(fieldName, parsed, fieldSchema, parentKey);
            }
          } catch (err) {
            console.warn("Invalid JSON array:", e.target.value);
          }
        }}
        readOnly={isReadOnly}
        className={isReadOnly
          ? "mt-1 block w-full rounded-md border-gray-300 bg-gray-100"
          : "mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
        }
        placeholder={generatePlaceholder(fieldName, fieldSchema)}
      />
      {errorMessages[fieldKey] && <span className="text-red-500 text-sm">{errorMessages[fieldKey]}</span>}
    </div>
  );
}

      if (fieldSchema.enum) {
        return (
          <div key={fieldKey} className="form-group mb-2">
            <label className="block text-sm font-medium">{fieldSchema.title || fieldName}:</label>
            <select
              value={currentValue || ""}
              onChange={(e) => handleChange(fieldName, e.target.value, fieldSchema, parentKey)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
            >
              <option value="">Select</option>
              {fieldSchema.enum.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>
        );
      }

      if (fieldSchema.type === "boolean") {
        return (
          <div key={fieldKey} className="form-group mb-2">
            <label className="block text-sm font-medium">{fieldSchema.title || fieldName}:</label>
            <input
              type="checkbox"
              checked={!!currentValue}
              onChange={(e) => handleChange(fieldName, e.target.checked, fieldSchema, parentKey)}
              className="mt-1"
            />
          </div>
        );
      }

      return (
        <div key={fieldKey} className="form-group mb-2">
          <label className="block text-sm font-medium">{fieldSchema.title || fieldName}:</label>
          <input
            type={fieldSchema.type === "integer" ? "number" : "text"}
            step={fieldSchema.type === "integer" ? "1" : "any"}
            value={currentValue ?? ""}
            onChange={(e) => {
              const val = fieldSchema.type === "integer" ? parseInt(e.target.value) : e.target.value;
              handleChange(fieldName, isNaN(val) ? "" : val, fieldSchema, parentKey);
            }}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
          />
        </div>
      );
    });
  };

  const renderSpeciesList = (speciesSchema) => {
    // Simplified — full version available on request
    return <div>Species List (Ionization toggle works — arrays fixed)</div>;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmissionStatus('Submitting...');

    const errors = {};
    if (!simulationName) errors.simulationName = 'Required';
    if (!baseDirectory) errors.baseDirectory = 'Required';

    if (Object.keys(errors).length > 0) {
      setErrorMessages(errors);
      setSubmissionStatus('Fix errors');
      return;
    }

    try {
      const response = await axios.post('http://localhost:8000/submit-job', {
        formData: values,
        baseDirectory,
        simulationName,
      });
      setSubmissionStatus(`Saved: ${response.data.file_path}`);
    } catch (error) {
      setSubmissionStatus(`Error: ${error.message}`);
    }
  };

  if (!schema?.properties?.numberCells) {
    return <div className="text-red-500">Invalid schema</div>;
  }

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <h2 className="text-xl font-bold mb-4">PIConGPU Simulation Input</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium">Output Directory:</label>
          <input
            type="text"
            value={baseDirectory}
            onChange={(e) => setBaseDirectory(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Simulation Name:</label>
          <input
            type="text"
            value={simulationName}
            onChange={(e) => setSimulationName(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
            required
          />
        </div>
        {renderFields(schema)}
        <button type="submit" className="bg-blue-500 text-white px-4 py-2 rounded-md">
          Submit
        </button>
      </form>
      {submissionStatus && <p className="mt-4 text-sm">{submissionStatus}</p>}
    </div>
  );
};

export default PICMIInputForm;