import React, { useState, useCallback } from "react";
import "../App.css";


// Resolve a $ref path (e.g., "#/properties/grid") to the target schema
const resolveRef = (rootSchema, refPath) => {
  if (!rootSchema || !refPath) {
    console.warn("resolveRef: Invalid schema or refPath", { rootSchema, refPath });
    return null;
  }
  if (!rootSchema.properties) {
    console.warn("resolveRef: Root schema missing properties", { rootSchema });
    return null;
  }
  try {
    const pathParts = refPath.replace(/^#\//, "").split("/");
    let current = rootSchema;
    for (const part of pathParts) {
      if (!current || !(part in current)) {
        console.warn(`resolveRef: Path part ${part} not found in ${refPath}`, { current, pathParts });
        return null;
      }
      current = current[part];
    }
    if (!current) {
      console.warn(`resolveRef: Resolved schema is undefined for ${refPath}`);
      return null;
    }
    console.log(`resolveRef: Successfully resolved ${refPath} to:`, current);
    return current;
  } catch (error) {
    console.error(`resolveRef: Failed to resolve $ref: ${refPath}`, error);
    return null;
  }
};



const PICMIInputForm = ({ schema }) => {
  const [values, setValues] = useState({});
  const [errorMessages, setErrorMessages] = useState({});

  // Initialize form values with schema defaults
const initializeValues = (schema) => {
  if (!schema || !schema.properties) {
    console.warn("initializeValues: Invalid schema, initializing empty values");
    return { diagnostics: [] };
  }
  const initialValues = {};
  Object.entries(schema.properties).forEach(([key, field]) => {
    if (field.type === "object") {
      if (key === "custom_user_input" && field.allOf) {
        initialValues[key] = field.allOf[0].then && initialValues.ADD_CUSTOM_INPUT
          ? Object.fromEntries(
              Object.entries(field.allOf[0].then.properties).map(([propName, propSchema]) => [
                propName,
                propSchema.default || (propSchema.type === "number" ? 0 : "")
              ])
            )
          : {};
      } else {
        initialValues[key] = initializeValues(field);
      }
    } else if (field.type === "array" && key === "diagnostics") {
      initialValues[key] = [
        {
          type: field.items.oneOf[0].properties.type.const,
          ...Object.fromEntries(
            Object.entries(field.items.oneOf[0].properties)
              .filter(([propName]) => propName !== "type")
              .map(([propName, propSchema]) => [
                propName,
                propSchema.default || 
                  (propSchema.type === "array" ? [] : 
                   propSchema.type === "string" ? "" : 
                   propSchema.type === "number" || propSchema.type === "integer" ? 0 : 
                   null)
              ])
          ),
        },
      ];
    } else if (field.type === "array") {
      initialValues[key] = field.default ? JSON.stringify(field.default) : "[]";
    } else if (field['$ref']) {
      const refSchema = resolveRef(schema, field['$ref']);
      if (refSchema) {
        initialValues[key] = refSchema.default ? JSON.stringify(refSchema.default) : "";
      } else {
        console.warn(`initializeValues: Cannot resolve $ref: ${field['$ref']} for ${key}`);
        initialValues[key] = "";
      }
    } else if (field.type === "boolean") {
      initialValues[key] = field.default || false;
    } else {
      initialValues[key] = field.default || "";
    }
  });
  // Ensure diagnostics is always an array
  if (!initialValues.diagnostics) {
    initialValues.diagnostics = [];
    console.log("initializeValues: Set diagnostics to empty array");
  }
  // Sync grid.number_of_cells and solver.grid.number_of_cells with numberCells
  if (initialValues.grid && initialValues.numberCells) {
    initialValues.grid.number_of_cells = initialValues.numberCells;
    console.log(`initializeValues: Set grid.number_of_cells to ${initialValues.numberCells}`);
    try {
      const numberCells = JSON.parse(initialValues.numberCells || "[]");
      const cellSize = JSON.parse(initialValues.cellSize || "[]");
      if (Array.isArray(numberCells) && Array.isArray(cellSize) && numberCells.length === cellSize.length) {
        const upperBound = numberCells.map((n, i) => n * cellSize[i]);
        initialValues.grid.upper_bound = JSON.stringify(upperBound);
        console.log(`initializeValues: Computed grid.upper_bound as ${initialValues.grid.upper_bound}`);
      } else {
        initialValues.grid.upper_bound = "[]";
      }
    } catch (error) {
      console.warn("initializeValues: Failed to compute grid.upper_bound", error);
      initialValues.grid.upper_bound = "[]";
    }
  }
  if (initialValues.solver && initialValues.grid) {
    initialValues.solver.grid = { ...initialValues.grid };
    initialValues.solver.grid.number_of_cells = initialValues.numberCells;
    console.log(`initializeValues: Set solver.grid.number_of_cells to ${initialValues.numberCells}`);
  }
  console.log("initializeValues: Initial values:", initialValues);
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
      if (fieldSchema.items?.type === "integer") return "[192, 2048, 192]";
      if (fieldSchema.items?.type === "number") return "[0.0001772, 0.0000443, 0.0001772]";
      if (fieldSchema.items?.type === "string" && fieldSchema.items.enum) {
        return JSON.stringify(fieldSchema.items.enum.slice(0, 3));
      }
      return "[1, 2, 3]";
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
        setNestedValue(newValues, "grid.number_of_cells", newValues.numberCells);
        if (newValues.solver?.grid) {
          setNestedValue(newValues, "solver.grid.number_of_cells", newValues.numberCells);
        }
      }
      // Calculate grid.upper_bound and solver.grid.upper_bound
      if (fieldKey === "numberCells" || fieldKey === "cellSize") {
        try {
          const numberCells = JSON.parse(newValues.numberCells || "[]");
          const cellSize = JSON.parse(newValues.cellSize || "[]");
          if (Array.isArray(numberCells) && Array.isArray(cellSize) && numberCells.length === cellSize.length) {
            const upperBound = numberCells.map((n, i) => n * cellSize[i]);
            setNestedValue(newValues, "grid.upper_bound", JSON.stringify(upperBound));
            if (newValues.solver?.grid) {
              setNestedValue(newValues, "solver.grid.upper_bound", JSON.stringify(upperBound));
            }
            console.log(`handleChange: Computed upper_bound as ${JSON.stringify(upperBound)}`);
          } else {
            setNestedValue(newValues, "grid.upper_bound", "[]");
            if (newValues.solver?.grid) {
              setNestedValue(newValues, "solver.grid.upper_bound", "[]");
            }
          }
        } catch (error) {
          console.warn("handleChange: Failed to compute upper_bound", error);
          setNestedValue(newValues, "grid.upper_bound", "[]");
          if (newValues.solver?.grid) {
            setNestedValue(newValues, "solver.grid.upper_bound", "[]");
          }
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
  if (!schema || !schema.properties) {
    console.error("Schema or schema.properties is undefined", { schema, parentKey });
    return <div>Error: Invalid schema</div>;
  }
  return Object.entries(schema.properties).map(([fieldName, fieldSchema]) => {
    const fieldKey = parentKey ? `${parentKey}.${fieldName}` : fieldName;

    if (fieldName === "species_list") {
      return (
        <div key={fieldKey} className="species-list-section">
          <h3>Species Configuration</h3>
          {renderSpeciesList(fieldSchema)}
        </div>
      );
    }

    if (fieldName === "diagnostics") {
      return (
        <div key={fieldKey} className="diagnostics-section">
          {renderDiagnostics(fieldSchema)}
        </div>
      );
    }

    // Handle $ref properties
if (fieldSchema['$ref']) {
  const refSchema = resolveRef(schema, fieldSchema['$ref']);
  if (!refSchema) {
    console.warn(`renderFields: Cannot resolve $ref: ${fieldSchema['$ref']} for ${fieldKey}`);
    return (
      <div key={fieldKey} className="form-group">
        <label>{fieldSchema.title || fieldName}:</label>
        <p>Error: Referenced schema not found</p>
      </div>
    );
  }
  const refFieldKey = fieldSchema['$ref'].replace(/^#\/properties\//, "");
  if (refSchema.type === "object") {
    console.log(`renderFields: Rendering referenced object ${refFieldKey} for ${fieldKey}`);
    return (
      <fieldset key={fieldKey} className="nested-fieldset">
        <legend>{fieldSchema.title || fieldName} (References {refFieldKey})</legend>
        {renderFields(refSchema, fieldKey)}
      </fieldset>
    );
  }
  const value = getNestedValue(values, refFieldKey) || refSchema.default || [];
  console.log(`renderFields: Rendering $ref ${fieldKey} with value:`, value);
  return (
    <div key={fieldKey} className="form-group">
      <label>{fieldSchema.title || fieldName}:</label>
      {refSchema.type === "array" ? (
        <textarea
          value={typeof value === 'string' ? value : JSON.stringify(value)}
          readOnly
          className="read-only-field"
        />
      ) : (
        <input
          type="text"
          value={value || ""}
          readOnly
          className="read-only-field"
        />
      )}
    </div>
  );
}
    
if (fieldSchema.type === "object") {
  let effectiveSchema = fieldSchema;
  if (fieldSchema.allOf && fieldKey === "custom_user_input") {
    const conditionalSchema = fieldSchema.allOf.find((cond) => {
      if (cond.if && cond.if.properties && cond.if.properties.ADD_CUSTOM_INPUT) {
        return getNestedValue(values, "ADD_CUSTOM_INPUT") === cond.if.properties.ADD_CUSTOM_INPUT.const;
      }
      return false;
    });
    effectiveSchema = conditionalSchema && conditionalSchema.then
      ? { ...fieldSchema, properties: conditionalSchema.then.properties || {}, required: conditionalSchema.then.required || [] }
      : { ...fieldSchema, properties: {}, required: [] };
  }
  if (!effectiveSchema.properties || Object.keys(effectiveSchema.properties).length === 0) {
    console.log(`No properties for ${fieldKey}, rendering empty fieldset`);
    return (
      <fieldset key={fieldKey} className="nested-fieldset">
        <legend>{fieldSchema.title || fieldName}</legend>
        {fieldKey === "custom_user_input" && !getNestedValue(values, "ADD_CUSTOM_INPUT") ? (
          <p>Enable ADD_CUSTOM_INPUT to configure</p>
        ) : (
          <p>No configurable properties</p>
        )}
      </fieldset>
    );
  }
  console.log(`Rendering object ${fieldKey} with properties:`, Object.keys(effectiveSchema.properties));
  return (
    <fieldset key={fieldKey} className="nested-fieldset">
      <legend>{fieldSchema.title || fieldName}</legend>
      {Object.entries(effectiveSchema.properties).map(([propName, propSchema]) => {
        const propKey = parentKey ? `${parentKey}.${propName}` : propName;
        return renderFields({ properties: { [propName]: propSchema } }, propKey);
      })}
    </fieldset>
  );
}


if (fieldSchema.type === "array") {
  const isReadOnly = fieldKey === "grid.upper_bound" || fieldKey === "solver.grid.upper_bound";
  return (
    <div key={fieldKey} className="form-group">
      <label htmlFor={fieldKey}>{fieldSchema.title || fieldName}:</label>
      <textarea
        id={fieldKey}
        name={fieldKey}
        value={getNestedValue(values, fieldKey) || JSON.stringify(fieldSchema.default || [])}
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

const handleNestedChange = (path, fieldName, value) => {
  console.log(`handleNestedChange: Updating ${path}.${fieldName} to`, value);
  setValues((prev) => {
    const newValues = { ...prev };
    const pathParts = path.split(/[\[\].]+/).filter(Boolean);
    let current = newValues;
    for (let i = 0; i < pathParts.length - 1; i++) {
      const part = pathParts[i];
      const isArrayIndex = !isNaN(parseInt(part));
      current[part] = isArrayIndex ? (Array.isArray(current[part]) ? [...current[part]] : []) : { ...current[part] };
      current = current[part];
    }
    const lastPart = pathParts[pathParts.length - 1];
    if (lastPart) {
      current[lastPart] = current[lastPart] || {};
      current[lastPart][fieldName] = value;
    } else {
      current[fieldName] = value;
    }
    console.log("handleNestedChange: New values:", newValues);
    return newValues;
  });
};

const renderSpeciesItem = (path, itemSchema) => {
  if (!itemSchema) return null;
  const itemValue = getNestedValue(values, path) || {};
  return (
    <div className="species-item">
      <h4>{itemSchema.title || path}</h4>
      {Object.entries(itemSchema.properties || {}).map(([propName, propSchema]) => {
        const propKey = `${path}.${propName}`;
        if (propSchema['$ref']) {
          const refSchema = resolveRef(schema, propSchema['$ref']); // Use root schema
          if (!refSchema) {
            console.warn(`Cannot resolve $ref: ${propSchema['$ref']} for ${propKey}`);
            return (
              <div key={propKey} className="form-group">
                <label>{propSchema.title || propName}:</label>
                <p>Error: Referenced schema not found</p>
              </div>
            );
          }
          const refFieldKey = propSchema['$ref'].replace(/^#\/properties\//, "").replace(/\/oneOf\/\d+\/properties\//g, ".").replace(/\/items\/\d+$/, "");
          if (refSchema.type === "object") {
            return (
              <div key={propKey} className="form-group">
                <label>{propSchema.title || propName} (References {refFieldKey}):</label>
                {Object.entries(refSchema.properties).map(([refPropName, refPropSchema]) => {
                  const refPropKey = `${refFieldKey}.${refPropName}`;
                  return (
                    <div key={refPropKey} className="form-group nested-ref">
                      <label>{refPropSchema.title || refPropName}:</label>
                      {refPropSchema.type === "number" || refPropSchema.type === "integer" ? (
                        <input
                          type="number"
                          value={getNestedValue(values, refPropKey) || refPropSchema.default || ""}
                          onChange={(e) => {
                            const newValue = refPropSchema.type === "integer" ? parseInt(e.target.value) : parseFloat(e.target.value);
                            setValues((prev) => {
                              const newValues = { ...prev };
                              setNestedValue(newValues, refPropKey, newValue);
                              if (refFieldKey === "random_layout") {
                                newValues.species_list.species = newValues.species_list.species.map((species, idx) =>
                                  species.particle_type !== "electron" || !newValues.species_list.ENABLE_IONIZATION
                                    ? { ...species, layout: newValues.random_layout }
                                    : species
                                );
                              }
                              return newValues;
                            });
                          }}
                        />
                      ) : (
                        <input
                          type="text"
                          value={getNestedValue(values, refPropKey) || refPropSchema.default || ""}
                          readOnly
                          className="read-only-field"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            );
          }
          return (
            <div key={propKey} className="form-group">
              <label>{propSchema.title || propName} (References {refFieldKey}):</label>
              {refSchema.type === "array" ? (
                <textarea
                  value={getNestedValue(values, refFieldKey) || JSON.stringify(refSchema.default || [])}
                  readOnly
                  className="read-only-field"
                />
              ) : (
                <input
                  type="text"
                  value={getNestedValue(values, refFieldKey) || refSchema.default || ""}
                  readOnly
                  className="read-only-field"
                />
              )}
            </div>
          );
        }
        return (
          <div key={propKey} className="form-group">
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
            ) : propSchema.type === "integer" ? (
              <input
                type="number"
                value={itemValue[propName] || ""}
                onChange={(e) => handleNestedChange(path, propName, parseInt(e.target.value))}
                placeholder={generatePlaceholder(propName, propSchema)}
              />
            ) : (
              <input
                type="text"
                value={itemValue[propName] || ""}
                onChange={(e) => handleNestedChange(path, propName, e.target.value)}
                placeholder={generatePlaceholder(propName, propSchema)}
              />
            )}
          </div>
        );
      })}
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
      {Object.entries(modelSchema.properties || {}).map(([propName, propSchema]) => {
        const propKey = `${modelPath}.${propName}`;
        if (propSchema['$ref']) {
          const refSchema = resolveRef(schema, propSchema['$ref']);
          if (!refSchema) {
            console.warn(`Cannot resolve $ref: ${propSchema['$ref']} for ${propKey}`);
            return (
              <div key={propKey} className="form-group">
                <label>{propSchema.title || propName}:</label>
                <p>Error: Referenced schema not found</p>
              </div>
            );
          }
          const refIndex = propSchema['$ref'].match(/items\/(\d+)$/);
          const speciesIndex = refIndex ? parseInt(refIndex[1], 10) : 0;
          const speciesName = values.species_list?.species?.[speciesIndex]?.name || `Species ${speciesIndex + 1}`;
          return (
            <div key={propKey} className="form-group">
              <label>{propSchema.title || propName} (References {speciesName}):</label>
              <input
                type="text"
                value={speciesName}
                readOnly
                className="read-only-field"
              />
            </div>
          );
        }
        return (
          <div key={propKey} className="form-group">
            <label>{propSchema.title || propName}:</label>
            {propSchema.type === "array" ? (
              <textarea
                value={JSON.stringify(modelValue[propName] || propSchema.default || [])}
                onChange={(e) => {
                  try {
                    const parsed = JSON.parse(e.target.value);
                    handleNestedChange(modelPath, propName, parsed);
                  } catch {
                    handleNestedChange(modelPath, propName, e.target.value);
                  }
                }}
              />
            ) : propSchema.enum ? (
              <select
                value={modelValue[propName] || propSchema.default || ""}
                onChange={(e) => handleNestedChange(modelPath, propName, e.target.value)}
              >
                {propSchema.enum.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : propSchema.type === "null" ? (
              <input
                type="text"
                value="null"
                readOnly
                className="read-only-field"
              />
            ) : propSchema.type === "number" || propSchema.type === "integer" ? (
              <input
                type="number"
                value={modelValue[propName] || propSchema.default || ""}
                onChange={(e) => {
                  const value = propSchema.type === "integer" ? parseInt(e.target.value) : parseFloat(e.target.value);
                  handleNestedChange(modelPath, propName, value);
                }}
              />
            ) : (
              <input
                type="text"
                value={modelValue[propName] || propSchema.default || ""}
                onChange={(e) => handleNestedChange(modelPath, propName, e.target.value)}
              />
            )}
            {errorMessages[propKey] && <span className="error">{errorMessages[propKey]}</span>}
          </div>
        );
      })}
    </div>
  );
};

const renderDiagnostics = (diagnosticsSchema) => {
  if (!diagnosticsSchema || !diagnosticsSchema.items || !diagnosticsSchema.items.oneOf) {
    console.error("renderDiagnostics: Invalid diagnostics schema", diagnosticsSchema);
    return <div>Error: Invalid diagnostics schema</div>;
  }

  // Build diagnosticSchemas map
  const diagnosticSchemas = {};
  diagnosticsSchema.items.oneOf.forEach((diagSchema) => {
    const type = diagSchema.properties.type.const;
    diagnosticSchemas[type] = diagSchema;
  });
  console.log("renderDiagnostics: Diagnostic schemas map:", diagnosticSchemas);

  const diagnostics = Array.isArray(getNestedValue(values, "diagnostics")) 
    ? getNestedValue(values, "diagnostics") 
    : [];
  console.log("renderDiagnostics: Current diagnostics state:", diagnostics);

  return (
    <div className="diagnostics-section">
      <h3>Diagnostics Configuration</h3>
      {diagnostics.map((diagnostic, index) => {
        const diagnosticPath = `diagnostics[${index}]`;
        const diagnosticValue = getNestedValue(values, diagnosticPath) || {};
        const selectedType = typeof diagnosticValue.type === "string" && diagnosticSchemas[diagnosticValue.type]
          ? diagnosticValue.type
          : diagnosticsSchema.items.oneOf[0].properties.type.const;
        const typeSchema = diagnosticSchemas[selectedType];
        if (!typeSchema) {
          console.warn(`renderDiagnostics: No schema found for type: ${selectedType}`);
          return null;
        }
        console.log(`renderDiagnostics: Rendering diagnostic ${index + 1}: type=${selectedType}, value=`, JSON.stringify(diagnosticValue));

        return (
          <div key={`${diagnosticPath}-${selectedType}-${index}`} className="diagnostic-item">
            <h4>Diagnostic {index + 1}</h4>
            <div><strong>Currently rendering type:</strong> {selectedType}</div>
            <div className="form-group">
              <label>Type:</label>
              <select
                value={selectedType}
                onChange={(e) => {
                  const newType = e.target.value;
                  if (!diagnosticSchemas[newType]) {
                    console.warn(`renderDiagnostics: Invalid diagnostic type selected: ${newType}`);
                    return;
                  }
                  const newTypeSchema = diagnosticSchemas[newType];
                  const newValues = { type: newType };
                  Object.entries(newTypeSchema.properties).forEach(([propName, propSchema]) => {
                    if (propName !== "type") {
                      newValues[propName] = propSchema.default || 
                        (propSchema.type === "array" ? [] : 
                         propSchema.type === "string" ? "" : 
                         propSchema.type === "number" || propSchema.type === "integer" ? 0 : 
                         propSchema.type === "boolean" ? false : 
                         propSchema.type === "null" ? null : 
                         propSchema.type === "object" ? {} : 
                         null);
                    }
                  });
                  console.log(`renderDiagnostics: Updating diagnostic ${index + 1} to type=${newType}, newValues=`, JSON.stringify(newValues));
                  setValues((prev) => {
                    const newDiagnostics = Array.isArray(prev.diagnostics) ? [...prev.diagnostics] : [];
                    newDiagnostics[index] = { ...newValues };
                    console.log("renderDiagnostics: New diagnostics state:", newDiagnostics);
                    return { ...prev, diagnostics: newDiagnostics };
                  });
                }}
              >
                {diagnosticsSchema.items.oneOf.map((option) => (
                  <option key={option.properties.type.const} value={option.properties.type.const}>
                    {option.title || option.properties.type.const}
                  </option>
                ))}
              </select>
            </div>
            {Object.entries(typeSchema.properties)
              .filter(([propName]) => propName !== "type")
              .map(([propName, propSchema]) => {
                const propKey = `${diagnosticPath}.${propName}`;
                const currentValue = diagnosticValue[propName] !== undefined 
                  ? diagnosticValue[propName] 
                  : (propSchema.default || 
                     (propSchema.type === "array" ? [] : 
                      propSchema.type === "string" ? "" : 
                      propSchema.type === "number" || propSchema.type === "integer" ? 0 : 
                      propSchema.type === "boolean" ? false : 
                      propSchema.type === "null" ? null : 
                      propSchema.type === "object" ? {} : 
                      null));
                console.log(`renderDiagnostics: Rendering field ${propKey}: value=`, currentValue);
                return (
                  <div key={propKey} className="form-group">
                    <label>{propSchema.title || propName}:</label>
                    {propSchema.type === "array" ? (
                      <textarea
                        value={Array.isArray(currentValue) ? JSON.stringify(currentValue) : JSON.stringify(propSchema.default || [])}
                        onChange={(e) => {
                          try {
                            const parsed = JSON.parse(e.target.value);
                            handleNestedChange(diagnosticPath, propName, parsed);
                          } catch {
                            handleNestedChange(diagnosticPath, propName, e.target.value);
                          }
                        }}
                        placeholder={generatePlaceholder(propName, propSchema)}
                      />
                    ) : propSchema.enum ? (
                      <select
                        value={currentValue || propSchema.default || ""}
                        onChange={(e) => handleNestedChange(diagnosticPath, propName, e.target.value)}
                      >
                        {propSchema.enum.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    ) : propSchema.type === "boolean" ? (
                      <input
                        type="checkbox"
                        checked={currentValue === true}
                        onChange={(e) => handleNestedChange(diagnosticPath, propName, e.target.checked)}
                      />
                    ) : propSchema.type === "number" || propSchema.type === "integer" ? (
                      <input
                        type="number"
                        step={propSchema.type === "number" ? "any" : "1"}
                        value={currentValue !== null && currentValue !== undefined ? currentValue : (propSchema.default || "")}
                        onChange={(e) => {
                          const value = propSchema.type === "integer" ? parseInt(e.target.value) : parseFloat(e.target.value);
                          handleNestedChange(diagnosticPath, propName, isNaN(value) ? null : value);
                        }}
                        placeholder={generatePlaceholder(propName, propSchema)}
                      />
                    ) : propSchema.type === "object" ? (
                      <fieldset className="nested-fieldset">
                        <legend>{propSchema.title || propName}</legend>
                        {Object.entries(propSchema.properties || {}).map(([subPropName, subPropSchema]) => {
                          const subPropKey = `${propKey}.${subPropName}`;
                          const subValue = (currentValue && currentValue[subPropName] !== undefined) 
                            ? currentValue[subPropName] 
                            : (subPropSchema.default || 
                               (subPropSchema.type === "string" ? "" : 
                                subPropSchema.type === "number" || subPropSchema.type === "integer" ? 0 : 
                                subPropSchema.type === "null" ? null : 
                                null));
                          return (
                            <div key={subPropKey} className="form-group">
                              <label>{subPropSchema.title || subPropName}:</label>
                              {subPropSchema.enum ? (
                                <select
                                  value={subValue || subPropSchema.default || ""}
                                  onChange={(e) => handleNestedChange(`${diagnosticPath}.${propName}`, subPropName, e.target.value)}
                                >
                                  {subPropSchema.enum.map((option) => (
                                    <option key={option} value={option}>
                                      {option}
                                    </option>
                                  ))}
                                </select>
                              ) : subPropSchema.type === "string" ? (
                                <input
                                  type="text"
                                  value={subValue || subPropSchema.default || ""}
                                  onChange={(e) => handleNestedChange(`${diagnosticPath}.${propName}`, subPropName, e.target.value)}
                                  placeholder={generatePlaceholder(subPropName, subPropSchema)}
                                />
                              ) : subPropSchema.type === "null" ? (
                                <input
                                  type="text"
                                  value="null"
                                  readOnly
                                  className="read-only-field"
                                />
                              ) : (
                                <input
                                  type="number"
                                  step={subPropSchema.type === "number" ? "any" : "1"}
                                  value={subValue !== null && subValue !== undefined ? subValue : (subPropSchema.default || "")}
                                  onChange={(e) => {
                                    const value = subPropSchema.type === "integer" ? parseInt(e.target.value) : parseFloat(e.target.value);
                                    handleNestedChange(`${diagnosticPath}.${propName}`, subPropName, isNaN(value) ? null : value);
                                  }}
                                  placeholder={generatePlaceholder(subPropName, subPropSchema)}
                                />
                              )}
                            </div>
                          );
                        })}
                      </fieldset>
                    ) : (
                      <input
                        type="text"
                        value={currentValue || propSchema.default || ""}
                        onChange={(e) => handleNestedChange(diagnosticPath, propName, e.target.value)}
                        placeholder={generatePlaceholder(propName, propSchema)}
                      />
                    )}
                    {errorMessages[propKey] && <span className="error">{errorMessages[propKey]}</span>}
                  </div>
                );
              })}
            <button
              type="button"
              onClick={() => {
                setValues((prev) => {
                  const newDiagnostics = Array.isArray(prev.diagnostics) ? prev.diagnostics.filter((_, i) => i !== index) : [];
                  console.log("renderDiagnostics: Removed diagnostic, new state:", newDiagnostics);
                  return { ...prev, diagnostics: newDiagnostics };
                });
              }}
            >
              Remove Diagnostic
            </button>
          </div>
        );
      })}
      <button
        type="button"
        onChange={() => {
          const newType = diagnosticsSchema.items.oneOf[0].properties.type.const;
          const newTypeSchema = diagnosticSchemas[newType];
          const newDiagnostic = { type: newType };
          Object.entries(newTypeSchema.properties).forEach(([propName, propSchema]) => {
            if (propName !== "type") {
              newDiagnostic[propName] = propSchema.default || 
                (propSchema.type === "array" ? [] : 
                 propSchema.type === "string" ? "" : 
                 propSchema.type === "number" || propSchema.type === "integer" ? 0 : 
                 propSchema.type === "boolean" ? false : 
                 propSchema.type === "null" ? null : 
                 propSchema.type === "object" ? {} : 
                 null);
            }
          });
          console.log(`renderDiagnostics: Adding new diagnostic: type=${newType}, properties=`, JSON.stringify(newDiagnostic));
          setValues((prev) => {
            const newDiagnostics = Array.isArray(prev.diagnostics) ? [...prev.diagnostics, { ...newDiagnostic }] : [{ ...newDiagnostic }];
            console.log("renderDiagnostics: New diagnostics state after add:", newDiagnostics);
            return { ...prev, diagnostics: newDiagnostics };
          });
        }}
      >
        Add Diagnostic
      </button>
    </div>
  );
};



const renderCustomUserInputs = (schema, parentKey) => {
  if (!schema?.properties?.custom_user_input || !values.ADD_CUSTOM_INPUT) {
    console.log("custom_user_input not rendered: schema or ADD_CUSTOM_INPUT missing", { schema, ADD_CUSTOM_INPUT: values.ADD_CUSTOM_INPUT });
    return null;
  }
  const customSchema = schema.properties.custom_user_input.allOf?.[0]?.then?.properties;
  if (!customSchema) {
    console.error("Invalid custom_user_input schema structure", schema.properties.custom_user_input);
    return <div>Error: Invalid custom_user_input schema</div>;
  }
  console.log("Rendering custom_user_input with properties:", Object.keys(customSchema));
  return Object.entries(customSchema).map(([fieldName, fieldSchema]) => {
    const fieldKey = `${parentKey}.custom_user_input.${fieldName}`;
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
        {fieldSchema.type === "number" || fieldSchema.type === "integer" ? (
          <input
            type="number"
            id={fieldKey}
            name={fieldKey}
            value={getNestedValue(values, fieldKey) || fieldSchema.default || ""}
            onChange={(e) => {
              const value = fieldSchema.type === "integer" ? parseInt(e.target.value) : parseFloat(e.target.value);
              handleChange(fieldName, isNaN(value) ? "" : value, fieldSchema, `${parentKey}.custom_user_input`);
            }}
            placeholder={generatePlaceholder(fieldName, fieldSchema)}
            step={fieldSchema.type === "number" ? "any" : "1"}
          />
        ) : (
          <input
            type="text"
            id={fieldKey}
            name={fieldKey}
            value={getNestedValue(values, fieldKey) || fieldSchema.default || ""}
            onChange={(e) => handleChange(fieldName, e.target.value, fieldSchema, `${parentKey}.custom_user_input`)}
            placeholder={generatePlaceholder(fieldName, fieldSchema)}
          />
        )}
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