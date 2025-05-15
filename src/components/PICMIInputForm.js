import React, { useState, useCallback } from "react";
import "../App.css";

const PICMIInputForm = ({ schema }) => {
  const [values, setValues] = useState({});
  const [errorMessages, setErrorMessages] = useState({});

  // Initialize form values with schema defaults
  const initializeValues = (schema) => {
    if (!schema || !schema.properties) return {};
    const initialValues = {};
    Object.keys(schema.properties).forEach((key) => {
      const field = schema.properties[key];
      if (field.type === "object") {
        initialValues[key] = initializeValues(field);
      } else if (field.type === "array") {
        initialValues[key] = field.default ? JSON.stringify(field.default) : "[]";
      } else if (field.type === "boolean") {
        initialValues[key] = field.default || false;
      } else {
        initialValues[key] = field.default || "";
      }
    });
    // Sync grid.number_of_cells with numberCells
    if (initialValues.grid && initialValues.numberCells) {
      initialValues.grid.number_of_cells = initialValues.numberCells;
      // Calculate grid.upper_bound
      try {
        const numberCells = JSON.parse(initialValues.numberCells || "[]");
        const cellSize = JSON.parse(initialValues.cellSize || "[]");
        if (Array.isArray(numberCells) && Array.isArray(cellSize) && numberCells.length === cellSize.length) {
          const upperBound = numberCells.map((n, i) => n * cellSize[i]);
          initialValues.grid.upper_bound = JSON.stringify(upperBound);
        } else {
          initialValues.grid.upper_bound = "[]";
        }
      } catch {
        initialValues.grid.upper_bound = "[]";
      }
    }
    // Initialize solver (no grid stored; computed on submit)
    if (initialValues.solver) {
      initialValues.solver.method = initialValues.solver.method || "Yee";
    }
    return initialValues;
  };

  // Set initial values
  if (schema && !Object.keys(values).length) {
    try {
      setValues(initializeValues(schema));
    } catch (error) {
      console.error("Failed to initialize values:", error);
    }
  }

  const setNestedValue = (obj, path, newValue) => {
    const parts = path.split(".");
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current[part]) current[part] = {};
      current = current[part];
    }
    current[parts[parts.length - 1]] = newValue;
  };

  const getNestedValue = (obj, keyPath) => {
    try {
      return keyPath.split(".").reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : ""), obj);
    } catch {
      return "";
    }
  };

  const generateExampleArray = (fieldSchema) => {
    if (fieldSchema.type === "array" && fieldSchema.items) {
      if (fieldSchema.items.type === "integer") return "[192, 2048, 192]";
      if (fieldSchema.items.type === "number") return "[0.0001772, 0.0000443, 0.0001772]";
      if (fieldSchema.items.type === "string" && fieldSchema.items.enum) {
        return JSON.stringify(fieldSchema.items.enum.slice(0, 3));
      }
    }
    return "[1, 2, 3]";
  };

  const generatePlaceholder = (fieldName, fieldSchema) => {
    if (!fieldSchema) return `Enter a value for ${fieldName}`;
    if (fieldSchema.type === "array") {
      const itemType = fieldSchema.items?.type || "any";
      const minItems = fieldSchema.minItems || 0;
      const maxItems = fieldSchema.maxItems || "unlimited";
      const example = generateExampleArray(fieldSchema);
      return `Enter an array of ${itemType}s [${minItems} to ${maxItems} items]. Example: ${example}`;
    }
    if (fieldSchema.type === "boolean") return "Select true or false";
    if (fieldSchema.type === "number") return "Enter a number. Example: 1.5";
    if (fieldSchema.type === "integer") return "Enter an integer. Example: 42";
    if (fieldSchema.type === "string") {
      if (fieldSchema.enum) return `Choose one of: ${fieldSchema.enum.join(", ")}. Example: ${fieldSchema.enum[0]}`;
      return "Enter a string. Example: Hello";
    }
    return `Enter a value for ${fieldName}`;
  };

  const validateField = (fieldName, value, fieldSchema) => {
    if (!fieldSchema) return "Invalid field schema.";
    if (!value && fieldSchema.required) return "This field is required.";
    if (fieldSchema.type === "array") {
      try {
        const parsed = JSON.parse(value);
        if (!Array.isArray(parsed)) return "Input must be an array.";
        if (fieldSchema.minItems && parsed.length < fieldSchema.minItems) {
          return `Array must have at least ${fieldSchema.minItems} items.`;
        }
        if (fieldSchema.maxItems && parsed.length > fieldSchema.maxItems) {
          return `Array must have no more than ${fieldSchema.maxItems} items.`;
        }
        if (fieldSchema.items) {
          for (const item of parsed) {
            if (fieldSchema.items.type === "integer" && !Number.isInteger(item)) {
              return `Array items must be integers.`;
            }
            if (fieldSchema.items.type === "number" && isNaN(item)) {
              return `Array items must be numbers.`;
            }
            if (fieldSchema.items.enum && !fieldSchema.items.enum.includes(item)) {
              return `Array items must be one of: ${fieldSchema.items.enum.join(", ")}.`;
            }
          }
        }
        return null;
      } catch {
        return `Invalid array format. Use JSON format, e.g., ${generateExampleArray(fieldSchema)}.`;
      }
    }
    if (fieldSchema.type === "boolean" && value !== true && value !== false) {
      return "Select true or false.";
    }
    if ((fieldSchema.type === "number" || fieldSchema.type === "integer") && isNaN(value)) {
      return `Enter a valid ${fieldSchema.type}.`;
    }
    if (fieldSchema.type === "string" && fieldSchema.enum && !fieldSchema.enum.includes(value)) {
      return `Value must be one of: ${fieldSchema.enum.join(", ")}.`;
    }
    return null;
  };

  const handleChange = useCallback(
    (fieldName, value, fieldSchema, parentKey = "") => {
      const fieldKey = parentKey ? `${parentKey}.${fieldName}` : fieldName;

      setValues((prev) => {
        const newValues = { ...prev };
        if (fieldSchema?.type === "array") {
          try {
            const parsedValue = JSON.parse(value);
            if (Array.isArray(parsedValue)) {
              setNestedValue(newValues, fieldKey, parsedValue);
            } else {
              setNestedValue(newValues, fieldKey, value);
            }
          } catch {
            setNestedValue(newValues, fieldKey, value);
          }
        } else {
          setNestedValue(newValues, fieldKey, value);
        }
        // Sync grid.number_of_cells with numberCells
        if (fieldKey === "numberCells") {
          setNestedValue(newValues, "grid.number_of_cells", value);
        }
        // Calculate grid.upper_bound
        if (fieldKey === "numberCells" || fieldKey === "cellSize") {
          console.log("Calculating upper_bound:", { numberCells: newValues.numberCells, cellSize: newValues.cellSize });
          try {
            const numberCells = JSON.parse(newValues.numberCells || "[]");
            const cellSize = JSON.parse(newValues.cellSize || "[]");
            if (Array.isArray(numberCells) && Array.isArray(cellSize) && numberCells.length === cellSize.length) {
              const upperBound = numberCells.map((n, i) => n * cellSize[i]);
              setNestedValue(newValues, "grid.upper_bound", JSON.stringify(upperBound));
              console.log("Set upper_bound:", upperBound);
            } else {
              setNestedValue(newValues, "grid.upper_bound", "[]");
            }
          } catch {
            setNestedValue(newValues, "grid.upper_bound", "[]");
          }
        }
        return newValues;
      });

      const error = validateField(fieldKey, value, fieldSchema);
      setErrorMessages((prev) => ({ ...prev, [fieldKey]: error }));
    },
    []
  );

  const renderFields = (schema, parentKey = "") => {
    if (!schema || !schema.properties) return null;
    return Object.entries(schema.properties).map(([fieldName, fieldSchema]) => {
      const fieldKey = parentKey ? `${parentKey}.${fieldName}` : fieldName;

      // Skip solver.grid (computed on submit)
      if (fieldKey === "solver.grid") return null;

      if (fieldName === "species_list") {
        return (
          <div key={fieldKey} className="species-list-section">
            <h3>Species Configuration</h3>
            {renderSpeciesList(fieldSchema)}
          </div>
        );
      }

      if (fieldSchema.type === "object") {
        return (
          <fieldset key={fieldKey} className="nested-fieldset">
            <legend>{fieldSchema.title || fieldName}</legend>
            {renderFields(fieldSchema, fieldKey)}
          </fieldset>
        );
      }

      if (fieldSchema.type === "array") {
        const isReadOnly = fieldKey === "grid.upper_bound";
        return (
          <div key={fieldKey} className="form-group">
            <label htmlFor={fieldKey}>{fieldSchema.title || fieldName}:</label>
            <textarea
              id={fieldKey}
              name={fieldKey}
              value={getNestedValue(values, fieldKey)}
              onChange={(e) => !isReadOnly && handleChange(fieldName, e.target.value, fieldSchema, parentKey)}
              placeholder={generatePlaceholder(fieldName, fieldSchema)}
              readOnly={isReadOnly}
              className={isReadOnly ? "read-only-field" : ""}
            />
            {errorMessages[fieldKey] && <span className="error">{errorMessages[fieldKey]}</span>}
          </div>
        );
      }

      if (fieldSchema.type === "boolean") {
        return (
          <div key={fieldKey} className="form-group">
            <label htmlFor={fieldKey}>{fieldSchema.title || fieldName}:</label>
            <input
              type="checkbox"
              id={fieldKey}
              name={fieldKey}
              checked={getNestedValue(values, fieldKey) === true}
              onChange={(e) => handleChange(fieldName, e.target.checked, fieldSchema, parentKey)}
            />
            {errorMessages[fieldKey] && <span className="error">{errorMessages[fieldKey]}</span>}
            {fieldKey === "ADD_CUSTOM_INPUT" && getNestedValue(values, fieldKey) && (
              <div className="conditional-fields">
                {renderCustomUserInputs(schema, parentKey)}
              </div>
            )}
          </div>
        );
      }

      return (
        <div key={fieldKey} className="form-group">
          <label htmlFor={fieldKey}>{fieldSchema.title || fieldName}:</label>
          {fieldSchema.enum ? (
            <select
              id={fieldKey}
              name={fieldKey}
              value={getNestedValue(values, fieldKey)}
              onChange={(e) => handleChange(fieldName, e.target.value, fieldSchema, parentKey)}
            >
              {fieldSchema.enum.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              id={fieldKey}
              name={fieldKey}
              value={getNestedValue(values, fieldKey)}
              onChange={(e) => handleChange(fieldName, e.target.value, fieldSchema, parentKey)}
              placeholder={generatePlaceholder(fieldName, fieldSchema)}
            />
          )}
          {errorMessages[fieldKey] && <span className="error">{errorMessages[fieldKey]}</span>}
        </div>
      );
    });
  };

  const renderSpeciesList = (speciesSchema) => {
    if (!speciesSchema) return null;
    const enableIonization = getNestedValue(values, "species_list.ENABLE_IONIZATION");
    return (
      <div className="species-list-section">
        <div className="form-group">
          <label>Ionization Mode:</label>
          <select
            value={enableIonization ? "with" : "without"}
            onChange={(e) => {
              const newIonizationMode = e.target.value === "with";
              setValues((prev) => ({
                ...prev,
                species_list: {
                  ...prev.species_list,
                  ENABLE_IONIZATION: newIonizationMode,
                  species: newIonizationMode ? [{}, {}] : [{}],
                },
              }));
            }}
          >
            <option value="without">Without Ionization</option>
            <option value="with">With Ionization</option>
          </select>
        </div>
        {enableIonization ? (
          <div>
            {speciesSchema.oneOf?.[1]?.properties?.species?.items?.[0] &&
              renderSpeciesItem("species_list.species[0]", speciesSchema.oneOf[1].properties.species.items[0])}
            {speciesSchema.oneOf?.[1]?.properties?.species?.items?.[1] &&
              renderSpeciesItem("species_list.species[1]", speciesSchema.oneOf[1].properties.species.items[1])}
            <div className="ionization-models">
              <h4>Ionization Models</h4>
              {speciesSchema.oneOf?.[1]?.properties?.ionizationModels?.properties?.adkModel &&
                renderIonizationModel("adkModel", speciesSchema.oneOf[1].properties.ionizationModels.properties.adkModel)}
              {speciesSchema.oneOf?.[1]?.properties?.ionizationModels?.properties?.bsiModel &&
                renderIonizationModel("bsiModel", speciesSchema.oneOf[1].properties.ionizationModels.properties.bsiModel)}
            </div>
          </div>
        ) : (
          <div>
            {speciesSchema.oneOf?.[0]?.properties?.species?.items?.[0] &&
              renderSpeciesItem("species_list.species[0]", speciesSchema.oneOf[0].properties.species.items[0])}
            <div className="ion-options">
              <label>
                <input
                  type="checkbox"
                  checked={getNestedValue(values, "species_list.ENABLE_IONS") || false}
                  onChange={(e) => {
                    setValues((prev) => ({
                      ...prev,
                      species_list: {
                        ...prev.species_list,
                        ENABLE_IONS: e.target.checked,
                      },
                    }));
                  }}
                />
                Enable Additional Ions
              </label>
              {getNestedValue(values, "species_list.ENABLE_IONS") &&
                speciesSchema.oneOf?.[0]?.properties?.species?.items?.[1] &&
                renderSpeciesItem("species_list.species[1]", speciesSchema.oneOf[0].properties.species.items[1])}
            </div>
          </div>
        )}
      </div>
    );
  };

  const handleNestedChange = (path, propName, value) => {
    setValues((prev) => {
      const newValues = { ...prev };
      const pathParts = path.split(".");
      let current = newValues;
      for (let i = 0; i < pathParts.length; i++) {
        if (!current[pathParts[i]]) current[pathParts[i]] = {};
        if (i === pathParts.length - 1) {
          current[pathParts[i]][propName] = value;
        } else {
          current = current[pathParts[i]];
        }
      }
      return newValues;
    });
  };

  const renderSpeciesItem = (path, itemSchema) => {
    if (!itemSchema) return null;
    const itemValue = getNestedValue(values, path) || {};
    return (
      <div className="species-item">
        <h4>{itemSchema.title || path}</h4>
        {Object.entries(itemSchema.properties || {}).map(([propName, propSchema]) => (
          <div key={`${path}.${propName}`} className="form-group">
            <label>{propSchema.title || propName}:</label>
            {propSchema.const ? (
              <input type="text" value={propSchema.const} readOnly className="read-only-field" />
            ) : propSchema.enum ? (
              <select
                value={itemValue[propName] || ""}
                onChange={(e) => handleNestedChange(path, propName, e.target.value)}
              >
                {propSchema.enum.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : propSchema.type === "null" ? (
              <input type="text" value="null" readOnly className="read-only-field" />
            ) : (
              <input
                type="text"
                value={itemValue[propName] || ""}
                onChange={(e) => handleNestedChange(path, propName, e.target.value)}
                placeholder={generatePlaceholder(propName, propSchema)}
              />
            )}
          </div>
        ))}
      </div>
    );
  };

  const renderIonizationModel = (modelType, modelSchema) => {
    if (!modelSchema) return null;
    const modelPath = `species_list.ionizationModels.${modelType}`;
    const modelValue = getNestedValue(values, modelPath) || {};
    return (
      <div className="ionization-model">
        <h5>{modelType}</h5>
        {Object.entries(modelSchema.properties || {}).map(([propName, propSchema]) => (
          <div key={`${modelPath}.${propName}`} className="form-group">
            <label>{propSchema.title || propName}:</label>
            {propSchema.type === "array" ? (
              <textarea
                value={JSON.stringify(modelValue[propName] || [])}
                onChange={(e) => {
                  try {
                    const parsed = JSON.parse(e.target.value);
                    handleNestedChange(modelPath, propName, parsed);
                  } catch {
                    // Handle invalid JSON gracefully
                  }
                }}
              />
            ) : propSchema.enum ? (
              <select
                value={modelValue[propName] || ""}
                onChange={(e) => handleNestedChange(modelPath, propName, e.target.value)}
              >
                {propSchema.enum.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={modelValue[propName] || ""}
                onChange={(e) => handleNestedChange(modelPath, propName, e.target.value)}
              />
            )}
          </div>
        ))}
      </div>
    );
  };

  const renderCustomUserInputs = (schema, parentKey) => {
    if (!schema?.properties?.custom_user_inputs || !values.ADD_CUSTOM_INPUT) return null;
    const customSchema = schema.properties.custom_user_inputs.items.allOf[0].then.properties;
    return Object.entries(customSchema || {}).map(([fieldName, fieldSchema]) => {
      const fieldKey = `${parentKey}.custom_user_inputs[0].${fieldName}`;
      if (fieldSchema.type === "object") {
        return (
          <fieldset key={fieldKey} className="nested-fieldset">
            <legend>{fieldSchema.title || fieldName}</legend>
            {renderFields(fieldSchema, fieldKey)}
          </fieldset>
        );
      }
      return (
        <div key={fieldKey} className="form-group">
          <label htmlFor={fieldKey}>{fieldSchema.title || fieldName}:</label>
          <input
            type="text"
            id={fieldKey}
            name={fieldKey}
            value={getNestedValue(values, fieldKey) || ""}
            onChange={(e) => handleChange(fieldName, e.target.value, fieldSchema, `${parentKey}.custom_user_inputs[0]`)}
            placeholder={generatePlaceholder(fieldName, fieldSchema)}
          />
          {errorMessages[fieldKey] && <span className="error">{errorMessages[fieldKey]}</span>}
        </div>
      );
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // Construct solver.grid to reference grid
    const submittedValues = {
      ...values,
      solver: {
        ...values.solver,
        grid: values.grid // Reference grid directly
      }
    };
    console.log("Submitted values:", submittedValues);
  };

  if (!schema) return <div>Loading schema...</div>;

  return (
    <form onSubmit={handleSubmit}>
      <h2>PICMI Input Form</h2>
      {renderFields(schema) || <div>No fields to display</div>}
      <button type="submit">Submit</button>
    </form>
  );
};

export default PICMIInputForm;