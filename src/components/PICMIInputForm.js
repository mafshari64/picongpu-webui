import React, { useState, useCallback } from 'react';
import axios from 'axios';

const getNestedValue = (obj, path) => {
  return path.split('.').reduce((current, key) => {
    if (current && key.includes('[')) {
      const [arrayKey, index] = key.replace(']', '').split('[');
      return current[arrayKey] && current[arrayKey][index] !== undefined ? current[arrayKey][index] : undefined;
    }
    return current && current[key] !== undefined ? current[key] : undefined;
  }, obj);
};

const setNestedValue = (obj, path, value) => {
  const pathParts = path.split(/[[\].]+/).filter(Boolean);
  let current = obj;
  for (let i = 0; i < pathParts.length - 1; i++) {
    const part = pathParts[i];
    const isArrayIndex = !isNaN(parseInt(part));
    current[part] = isArrayIndex ? (Array.isArray(current[part]) ? [...current[part]] : []) : { ...current[part] };
    current = current[part];
  }
  const lastPart = pathParts[pathParts.length - 1];
  current[lastPart] = value;
};

const resolveRef = (rootSchema, refPath) => {
  if (!rootSchema || !refPath) {
    console.warn("resolveRef: Invalid schema or refPath", { rootSchema, refPath });
    return null;
  }
  if (refPath === "#/properties/numberCells") {
    if (rootSchema.properties && rootSchema.properties.numberCells) {
      console.log("resolveRef: Resolved #/properties/numberCells to:", rootSchema.properties.numberCells);
      return rootSchema.properties.numberCells;
    }
    console.warn("resolveRef: numberCells not found in schema.properties");
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
    console.log(`resolveRef: Resolved ${refPath} to:`, current);
    return current;
  } catch (error) {
    console.error(`resolveRef: Failed to resolve $ref: ${refPath}`, error);
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
  if (fieldSchema.required && (value === undefined || value === "")) {
    return `${fieldKey} is required`;
  }
  if (fieldSchema.type === "array") {
    try {
      const parsed = typeof value === "string" ? JSON.parse(value) : value;
      if (!Array.isArray(parsed)) return `${fieldKey} must be an array`;
      if (fieldSchema.minItems && parsed.length < fieldSchema.minItems) {
        return `${fieldKey} must have at least ${fieldSchema.minItems} items`;
      }
      if (fieldSchema.maxItems && parsed.length > fieldSchema.maxItems) {
        return `${fieldKey} must have at most ${fieldSchema.maxItems} items`;
      }
    } catch {
      return `${fieldKey} must be a valid JSON array`;
    }
  }
  return null;
};

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
  if (!initialValues.diagnostics) {
    initialValues.diagnostics = [];
    console.log("initializeValues: Set diagnostics to empty array");
  }
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
        if (fieldKey === "numberCells") {
          setNestedValue(newValues, "grid.number_of_cells", newValues.numberCells);
          if (newValues.solver?.grid) {
            setNestedValue(newValues, "solver.grid.number_of_cells", newValues.numberCells);
          }
        }
        return newValues;
      });
      const error = validateField(fieldKey, value, fieldSchema);
      setErrorMessages((prev) => ({ ...prev, [fieldKey]: error }));
    },
    []
  );

  const handleNestedChange = (index, fieldName, value, pathPrefix = "diagnostics") => {
    console.log(`handleNestedChange: Updating ${pathPrefix}[${index}].${fieldName} to`, value);
    setValues((prev) => {
      const newValues = { ...prev };
      let targetArray;
      if (pathPrefix.startsWith("species_list.species")) {
        targetArray = getNestedValue(newValues, "species_list.species") || [];
      } else if (pathPrefix.startsWith("species_list.ionizationModels")) {
        targetArray = getNestedValue(newValues, "species_list.ionizationModels") || {};
      } else if (pathPrefix.startsWith("species_list.interaction.ground_state_ionization_model_list")) {
        targetArray = getNestedValue(newValues, "species_list.interaction.ground_state_ionization_model_list") || [];
      } else {
        targetArray = getNestedValue(newValues, pathPrefix) || [];
      }
      if (pathPrefix === "species_list.ionizationModels") {
        targetArray[fieldName] = value;
        setNestedValue(newValues, pathPrefix, targetArray);
      } else {
        if (index < 0 || index >= targetArray.length) {
          console.warn(`handleNestedChange: Invalid index: ${index} for ${pathPrefix}`);
          return prev;
        }
        targetArray[index] = { ...targetArray[index], [fieldName]: value };
        setNestedValue(newValues, pathPrefix, targetArray);
      }
      console.log(`handleNestedChange: Updated ${pathPrefix} state:`, targetArray);
      return newValues;
    });
  };

  const renderDiagnostics = (diagnosticsSchema) => {
    if (!diagnosticsSchema || !diagnosticsSchema.items || !diagnosticsSchema.items.oneOf) {
      console.error("renderDiagnostics: Invalid diagnostics schema", diagnosticsSchema);
      return <div className="text-red-500">Error: Invalid diagnostics schema</div>;
    }
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
      <div className="diagnostics-section p-4 border rounded-md">
        <h3 className="text-lg font-semibold mb-2">Diagnostics Configuration</h3>
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
            <div key={`${diagnosticPath}-${selectedType}-${index}`} className="diagnostic-item mb-4 p-4 border rounded-md">
              <h4 className="text-md font-medium">Diagnostic {index + 1}</h4>
              <div className="mb-2"><strong>Currently rendering type:</strong> {selectedType}</div>
              <div className="form-group mb-2">
                <label className="block text-sm font-medium">Type:</label>
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
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
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
                    <div key={propKey} className="form-group mb-2">
                      <label className="block text-sm font-medium">{propSchema.title || propName}:</label>
                      {propSchema.type === "array" ? (
                        <textarea
                          value={Array.isArray(currentValue) ? JSON.stringify(currentValue) : (typeof currentValue === "string" ? currentValue : JSON.stringify(propSchema.default || []))}
                          onChange={(e) => {
                            try {
                              const parsedValue = JSON.parse(e.target.value);
                              if (!Array.isArray(parsedValue)) {
                                console.warn(`Invalid array input for ${propKey}:`, e.target.value);
                                return;
                              }
                              handleNestedChange(index, propName, parsedValue);
                            } catch {
                              console.warn(`Invalid JSON array for ${propKey}:`, e.target.value);
                            }
                          }}
                          placeholder={generatePlaceholder(propName, propSchema)}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                        />
                      ) : propSchema.enum ? (
                        <select
                          value={currentValue || propSchema.default || ""}
                          onChange={(e) => handleNestedChange(index, propName, e.target.value)}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
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
                          onChange={(e) => handleNestedChange(index, propName, e.target.checked)}
                          className="mt-1 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                      ) : propSchema.type === "number" || propSchema.type === "integer" ? (
                        <input
                          type="number"
                          step={propSchema.type === "number" ? "any" : "1"}
                          value={currentValue !== null && currentValue !== undefined ? currentValue : (propSchema.default || "")}
                          onChange={(e) => {
                            const value = propSchema.type === "integer" ? parseInt(e.target.value, 10) : parseFloat(e.target.value);
                            handleNestedChange(index, propName, isNaN(value) ? null : value);
                          }}
                          placeholder={generatePlaceholder(propName, propSchema)}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                        />
                      ) : propSchema.type === "object" ? (
                        <fieldset className="nested-fieldset mt-2 p-4 border rounded-md">
                          <legend className="text-sm font-medium">{propSchema.title || propName}</legend>
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
                              <div key={subPropKey} className="form-group mb-2">
                                <label className="block text-sm font-medium">{subPropSchema.title || subPropName}:</label>
                                {subPropSchema.enum ? (
                                  <select
                                    value={subValue || subPropSchema.default || ""}
                                    onChange={(e) => {
                                      const updatedObject = { ...currentValue, [subPropName]: e.target.value };
                                      handleNestedChange(index, propName, updatedObject);
                                    }}
                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
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
                                    onChange={(e) => {
                                      const updatedObject = { ...currentValue, [subPropName]: e.target.value };
                                      handleNestedChange(index, propName, updatedObject);
                                    }}
                                    placeholder={generatePlaceholder(subPropName, subPropSchema)}
                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                  />
                                ) : subPropSchema.type === "null" ? (
                                  <input
                                    type="text"
                                    value="null"
                                    readOnly
                                    className="mt-1 block w-full rounded-md border-gray-300 bg-gray-100"
                                  />
                                ) : (
                                  <input
                                    type="number"
                                    step={subPropSchema.type === "number" ? "any" : "1"}
                                    value={subValue !== null && subValue !== undefined ? subValue : (subPropSchema.default || "")}
                                    onChange={(e) => {
                                      const value = subPropSchema.type === "integer" ? parseInt(e.target.value, 10) : parseFloat(e.target.value);
                                      const updatedObject = { ...currentValue, [subPropName]: isNaN(value) ? null : value };
                                      handleNestedChange(index, propName, updatedObject);
                                    }}
                                    placeholder={generatePlaceholder(subPropName, subPropSchema)}
                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
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
                          onChange={(e) => handleNestedChange(index, propName, e.target.value)}
                          placeholder={generatePlaceholder(propName, propSchema)}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                        />
                      )}
                      {errorMessages[propKey] && <span className="text-red-500 text-sm">{errorMessages[propKey]}</span>}
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
                className="mt-2 bg-red-500 text-white px-4 py-2 rounded-md hover:bg-red-600"
              >
                Remove Diagnostic
              </button>
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => {
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
          className="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600"
        >
          Add Diagnostic
        </button>
      </div>
    );
  };

  const renderFields = (fieldSchema, parentKey = "") => {
    if (!fieldSchema || !fieldSchema.properties) {
      console.warn(`renderFields: Invalid schema for ${parentKey}`, fieldSchema);
      return null;
    }
    return Object.entries(fieldSchema.properties).map(([fieldName, fieldSchema]) => {
      const fieldKey = parentKey ? `${parentKey}.${fieldName}` : fieldName;
      if (fieldSchema['$ref']) {
        const refSchema = resolveRef(schema, fieldSchema['$ref']);
        if (!refSchema) {
          console.warn(`renderFields: Cannot resolve $ref: ${fieldSchema['$ref']} for ${fieldKey}`);
          return (
            <div key={fieldKey} className="form-group mb-2">
              <label className="block text-sm font-medium">{fieldSchema.title || fieldName}:</label>
              <p className="text-red-500">Error: Referenced schema not found</p>
            </div>
          );
        }
        const refFieldKey = fieldSchema['$ref'].replace(/^#\/properties\//, "");
        if (refSchema.type === "object") {
          console.log(`renderFields: Rendering referenced object ${refFieldKey} for ${fieldKey}`);
          return (
            <fieldset key={fieldKey} className="nested-fieldset mt-2 p-4 border rounded-md">
              <legend className="text-sm font-medium">{fieldSchema.title || fieldName} (References {refFieldKey})</legend>
              {renderFields(refSchema, fieldKey)}
            </fieldset>
          );
        }
        const value = getNestedValue(values, refFieldKey) || refSchema.default || [];
        console.log(`renderFields: Rendering $ref ${fieldKey} with value:`, value);
        return (
          <div key={fieldKey} className="form-group mb-2">
            <label className="block text-sm font-medium">{fieldSchema.title || fieldName}:</label>
            {refSchema.type === "array" ? (
              <textarea
                value={typeof value === 'string' ? value : JSON.stringify(value)}
                readOnly
                className="mt-1 block w-full rounded-md border-gray-300 bg-gray-100"
              />
            ) : (
              <input
                type="text"
                value={value || ""}
                readOnly
                className="mt-1 block w-full rounded-md border-gray-300 bg-gray-100"
              />
            )}
          </div>
        );
      }
      if (fieldSchema.type === "object") {
        if (fieldName === "species_list") {
          return (
            <div key={fieldKey} className="species-list-section p-4 border rounded-md">
              <h3 className="text-lg font-semibold mb-2">Species Configuration</h3>
              {renderSpeciesList(fieldSchema)}
            </div>
          );
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
        console.log(`renderFields: Rendering array ${fieldKey}, readOnly=${isReadOnly}, value=`, getNestedValue(values, fieldKey));
        return (
          <div key={fieldKey} className="form-group mb-2">
            <label className="block text-sm font-medium">{fieldSchema.title || fieldName}:</label>
            <textarea
              value={typeof getNestedValue(values, fieldKey) === "string" 
                ? getNestedValue(values, fieldKey) 
                : JSON.stringify(getNestedValue(values, fieldKey) || fieldSchema.default || [])}
              onChange={(e) => !isReadOnly && handleChange(fieldName, e.target.value, fieldSchema, parentKey)}
              readOnly={isReadOnly}
              className={isReadOnly ? "mt-1 block w-full rounded-md border-gray-300 bg-gray-100" : "mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"}
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
              value={getNestedValue(values, fieldKey) || ""}
              onChange={(e) => handleChange(fieldName, e.target.value, fieldSchema, parentKey)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            >
              <option value="">Select {fieldName}</option>
              {fieldSchema.enum.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            {errorMessages[fieldKey] && <span className="text-red-500 text-sm">{errorMessages[fieldKey]}</span>}
          </div>
        );
      }
      if (fieldSchema.type === "boolean") {
        return (
          <div key={fieldKey} className="form-group mb-2">
            <label className="block text-sm font-medium">{fieldSchema.title || fieldName}:</label>
            <input
              type="checkbox"
              checked={getNestedValue(values, fieldKey) || false}
              onChange={(e) => handleChange(fieldName, e.target.checked, fieldSchema, parentKey)}
              className="mt-1 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            {errorMessages[fieldKey] && <span className="text-red-500 text-sm">{errorMessages[fieldKey]}</span>}
          </div>
        );
      }
      if (fieldSchema.type === "number" || fieldSchema.type === "integer") {
        return (
          <div key={fieldKey} className="form-group mb-2">
            <label className="block text-sm font-medium">{fieldSchema.title || fieldName}:</label>
            <input
              type="number"
              step={fieldSchema.type === "number" ? "any" : "1"}
              value={getNestedValue(values, fieldKey) !== undefined ? getNestedValue(values, fieldKey) : ""}
              onChange={(e) => {
                const value = fieldSchema.type === "integer" ? parseInt(e.target.value) : parseFloat(e.target.value);
                handleChange(fieldName, isNaN(value) ? "" : value, fieldSchema, parentKey);
              }}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              placeholder={generatePlaceholder(fieldName, fieldSchema)}
            />
            {errorMessages[fieldKey] && <span className="text-red-500 text-sm">{errorMessages[fieldKey]}</span>}
          </div>
        );
      }
      return (
        <div key={fieldKey} className="form-group mb-2">
          <label className="block text-sm font-medium">{fieldSchema.title || fieldName}:</label>
          <input
            type="text"
            value={getNestedValue(values, fieldKey) || ""}
            onChange={(e) => handleChange(fieldName, e.target.value, fieldSchema, parentKey)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            placeholder={generatePlaceholder(fieldName, fieldSchema)}
          />
          {errorMessages[fieldKey] && <span className="text-red-500 text-sm">{errorMessages[fieldKey]}</span>}
        </div>
      );
    });
  };

  const renderSpeciesList = (speciesSchema) => {
    if (!speciesSchema || !speciesSchema.oneOf) {
      console.error("renderSpeciesList: Invalid species schema", speciesSchema);
      return <div className="text-red-500">Error: Invalid species schema</div>;
    }
    const enableIonization = getNestedValue(values, "species_list.ENABLE_IONIZATION") || false;
    const enableIons = getNestedValue(values, "species_list.ENABLE_IONS") || false;
    return (
      <div className="species-list-section">
        <div className="form-group mb-2">
          <label className="block text-sm font-medium">Ionization Mode:</label>
          <select
            value={enableIonization ? "with" : "without"}
            onChange={(e) => {
              const newIonizationMode = e.target.value === "with";
              setValues((prev) => {
                const newValues = { ...prev };
                const newSpeciesList = {
                  ENABLE_IONIZATION: newIonizationMode,
                  ENABLE_IONS: newIonizationMode ? true : prev.species_list?.ENABLE_IONS || false,
                  species: newIonizationMode ? [{ particle_type: "H", name: "hydrogen", charge_state: 0 }, { particle_type: "electron", name: "electron" }] : [{ particle_type: "electron", name: "electron" }],
                  ionizationModels: newIonizationMode ? { adkModel: { ADK_variant: "CircularPolarization" }, bsiModel: { BSI_extensions: ["EffectiveZ"] } } : null,
                  interaction: newIonizationMode ? { ground_state_ionization_model_list: [{ ADK_variant: "CircularPolarization" }, { BSI_extensions: ["EffectiveZ"] }] } : null,
                };
                setNestedValue(newValues, "species_list", newSpeciesList);
                console.log("renderSpeciesList: Updated species_list:", newSpeciesList);
                return newValues;
              });
            }}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          >
            <option value="without">Without Ionization</option>
            <option value="with">With Ionization</option>
          </select>
        </div>
        {enableIonization ? (
          <div>
            {speciesSchema.oneOf[1]?.properties?.species?.items?.[0] && (
              renderSpeciesItem("species_list.species[0]", speciesSchema.oneOf[1].properties.species.items[0], 0, "species_list.species")
            )}
            {speciesSchema.oneOf[1]?.properties?.species?.items?.[1] && (
              renderSpeciesItem("species_list.species[1]", speciesSchema.oneOf[1].properties.species.items[1], 1, "species_list.species")
            )}
            <div className="ionization-models mt-4">
              <h4 className="text-md font-medium">Ionization Models</h4>
              {speciesSchema.oneOf[1]?.properties?.ionizationModels?.properties?.adkModel && (
                renderIonizationModel("adkModel", speciesSchema.oneOf[1].properties.ionizationModels.properties.adkModel, "species_list.ionizationModels")
              )}
              {speciesSchema.oneOf[1]?.properties?.ionizationModels?.properties?.bsiModel && (
                renderIonizationModel("bsiModel", speciesSchema.oneOf[1].properties.ionizationModels.properties.bsiModel, "species_list.ionizationModels")
              )}
            </div>
            <div className="interaction mt-4">
              <h4 className="text-md font-medium">Interaction</h4>
              {speciesSchema.oneOf[1]?.properties?.interaction && (
                renderInteraction(speciesSchema.oneOf[1].properties.interaction, "species_list.interaction")
              )}
            </div>
          </div>
        ) : (
          <div>
            {speciesSchema.oneOf[0]?.properties?.species?.items?.[0] && (
              renderSpeciesItem("species_list.species[0]", speciesSchema.oneOf[0].properties.species.items[0], 0, "species_list.species")
            )}
            <div className="ion-options mt-2">
              <label className="block text-sm font-medium">
                <input
                  type="checkbox"
                  checked={enableIons}
                  onChange={(e) => {
                    setValues((prev) => {
                      const newValues = { ...prev };
                      const newSpeciesList = {
                        ...prev.species_list,
                        ENABLE_IONS: e.target.checked,
                        species: e.target.checked
                          ? [...(prev.species_list?.species || []), { particle_type: "H", name: "hydrogen", picongpu_fixed_charge: true }]
                          : [(prev.species_list?.species || [])[0] || { particle_type: "electron", name: "electron" }],
                      };
                      setNestedValue(newValues, "species_list", newSpeciesList);
                      console.log("renderSpeciesList: Updated species_list with ENABLE_IONS:", newSpeciesList);
                      return newValues;
                    });
                  }}
                  className="mr-2"
                />
                Enable Additional Ions
              </label>
              {enableIons && speciesSchema.oneOf[0]?.properties?.species?.items?.[1] && (
                renderSpeciesItem("species_list.species[1]", speciesSchema.oneOf[0].properties.species.items[1], 1, "species_list.species")
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderSpeciesItem = (path, itemSchema, index, pathPrefix) => {
    if (!itemSchema) return null;
    const itemValue = getNestedValue(values, path) || {};
    return (
      <div className="species-item p-4 border rounded-md mt-2" key={path}>
        <h4 className="text-md font-medium">{itemSchema.title || path}</h4>
        {Object.entries(itemSchema.properties || {}).map(([propName, propSchema]) => {
          const propKey = `${path}.${propName}`;
          if (propSchema['$ref']) {
            const refSchema = resolveRef(schema, propSchema['$ref']);
            if (!refSchema) {
              console.warn(`renderSpeciesItem: Cannot resolve $ref: ${propSchema['$ref']} for ${propKey}`);
              return (
                <div key={propKey} className="form-group mb-2">
                  <label className="block text-sm font-medium">{propSchema.title || propName}:</label>
                  <p className="text-red-500">Error: Referenced schema not found</p>
                </div>
              );
            }
            const refFieldKey = propSchema['$ref'].replace(/^#\/properties\//, "").replace(/\/oneOf\/\d+\/properties\//g, ".").replace(/\/items\/\d+$/, "");
            const refValue = getNestedValue(values, refFieldKey) || refSchema.default || (refSchema.type === "object" ? {} : []);
            return (
              <div key={propKey} className="form-group mb-2">
                <label className="block text-sm font-medium">{propSchema.title || propName} (References {refFieldKey}):</label>
                {refSchema.type === "object" ? (
                  Object.entries(refSchema.properties || {}).map(([refPropName, refPropSchema]) => {
                    const refPropKey = `${refFieldKey}.${refPropName}`;
                    return (
                      <div key={refPropKey} className="form-group mb-2 ml-4">
                        <label className="block text-sm font-medium">{refPropSchema.title || refPropName}:</label>
                        <input
                          type={refPropSchema.type === "number" || refPropSchema.type === "integer" ? "number" : "text"}
                          value={getNestedValue(values, refPropKey) || refPropSchema.default || ""}
                          readOnly
                          className="mt-1 block w-full rounded-md border-gray-300 bg-gray-100"
                        />
                      </div>
                    );
                  })
                ) : (
                  <input
                    type="text"
                    value={typeof refValue === "string" ? refValue : JSON.stringify(refValue)}
                    readOnly
                    className="mt-1 block w-full rounded-md border-gray-300 bg-gray-100"
                  />
                )}
              </div>
            );
          }
          return (
            <div key={propKey} className="form-group mb-2">
              <label className="block text-sm font-medium">{propSchema.title || propName}:</label>
              {propSchema.const ? (
                <input
                  type="text"
                  value={propSchema.const}
                  readOnly
                  className="mt-1 block w-full rounded-md border-gray-300 bg-gray-100"
                />
              ) : propSchema.enum ? (
                <select
                  value={itemValue[propName] || propSchema.default || ""}
                  onChange={(e) => handleNestedChange(index, propName, e.target.value, pathPrefix)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
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
                  className="mt-1 block w-full rounded-md border-gray-300 bg-gray-100"
                />
              ) : propSchema.type === "integer" ? (
                <input
                  type="number"
                  step="1"
                  value={itemValue[propName] !== undefined ? itemValue[propName] : (propSchema.default || "")}
                  onChange={(e) => {
                    const value = parseInt(e.target.value, 10);
                    handleNestedChange(index, propName, isNaN(value) ? null : value, pathPrefix);
                  }}
                  placeholder={generatePlaceholder(propName, propSchema)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                />
              ) : (
                <input
                  type="text"
                  value={itemValue[propName] || propSchema.default || ""}
                  onChange={(e) => handleNestedChange(index, propName, e.target.value, pathPrefix)}
                  placeholder={generatePlaceholder(propName, propSchema)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                />
              )}
              {errorMessages[propKey] && <span className="text-red-500 text-sm">{errorMessages[propKey]}</span>}
            </div>
          );
        })}
      </div>
    );
  };

  const renderIonizationModel = (modelType, modelSchema, pathPrefix) => {
    if (!modelSchema) return null;
    const modelPath = `${pathPrefix}.${modelType}`;
    const modelValue = getNestedValue(values, modelPath) || {};
    return (
      <div className="ionization-model p-4 border rounded-md mt-2">
        <h5 className="text-sm font-medium">{modelType.toUpperCase()}</h5>
        {Object.entries(modelSchema.properties || {}).map(([propName, propSchema]) => {
          const propKey = `${modelPath}.${propName}`;
          if (propSchema['$ref']) {
            const refSchema = resolveRef(schema, propSchema['$ref']);
            if (!refSchema) {
              console.warn(`renderIonizationModel: Cannot resolve $ref: ${propSchema['$ref']} for ${propKey}`);
              return (
                <div key={propKey} className="form-group mb-2">
                  <label className="block text-sm font-medium">{propSchema.title || propName}:</label>
                  <p className="text-red-500">Error: Referenced schema not found</p>
                </div>
              );
            }
            const refIndex = propSchema['$ref'].match(/items\/(\d+)$/);
            const speciesIndex = refIndex ? parseInt(refIndex[1], 10) : 0;
            const speciesName = getNestedValue(values, `species_list.species[${speciesIndex}].name`) || `Species ${speciesIndex + 1}`;
            return (
              <div key={propKey} className="form-group mb-2">
                <label className="block text-sm font-medium">{propSchema.title || propName}:</label>
                <input
                  type="text"
                  value={speciesName}
                  readOnly
                  className="mt-1 block w-full rounded-md border-gray-300 bg-gray-100"
                />
              </div>
            );
          }
          return (
            <div key={propKey} className="form-group mb-2">
              <label className="block text-sm font-medium">{propSchema.title || propName}:</label>
              {propSchema.type === "array" ? (
                <textarea
                  value={JSON.stringify(modelValue[propName] || propSchema.default || [])}
                  onChange={(e) => {
                    try {
                      const parsed = JSON.parse(e.target.value);
                      handleNestedChange(modelType, propName, parsed, pathPrefix);
                    } catch {
                      console.warn(`renderIonizationModel: Invalid JSON array for ${propKey}:`, e.target.value);
                    }
                  }}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                />
              ) : propSchema.enum ? (
                <select
                  value={modelValue[propName] || propSchema.default || ""}
                  onChange={(e) => handleNestedChange(modelType, propName, e.target.value, pathPrefix)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
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
                  className="mt-1 block w-full rounded-md border-gray-300 bg-gray-100"
                />
              ) : propSchema.type === "number" || propSchema.type === "integer" ? (
                <input
                  type="number"
                  step={propSchema.type === "number" ? "any" : "1"}
                  value={modelValue[propName] || propSchema.default || ""}
                  onChange={(e) => {
                    const value = propSchema.type === "integer" ? parseInt(e.target.value, 10) : parseFloat(e.target.value);
                    handleNestedChange(modelType, propName, isNaN(value) ? null : value, pathPrefix);
                  }}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                />
              ) : (
                <input
                  type="text"
                  value={modelValue[propName] || propSchema.default || ""}
                  onChange={(e) => handleNestedChange(modelType, propName, e.target.value, pathPrefix)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                />
              )}
              {errorMessages[propKey] && <span className="text-red-500 text-sm">{errorMessages[propKey]}</span>}
            </div>
          );
        })}
      </div>
    );
  };

  const renderInteraction = (interactionSchema, pathPrefix) => {
    if (!interactionSchema) return null;
    const interactionPath = `${pathPrefix}.ground_state_ionization_model_list`;
    const interactionValue = getNestedValue(values, interactionPath) || [];
    return (
      <div className="interaction p-4 border rounded-md">
        <h5 className="text-sm font-medium">Ground State Ionization Models</h5>
        {interactionValue.map((model, index) => {
          const modelPath = `${interactionPath}[${index}]`;
          return (
            <div key={modelPath} className="form-group mb-2">
              <label className="block text-sm font-medium">Model {index + 1}:</label>
              {index === 0 && (
                <select
                  value={model.ADK_variant || "CircularPolarization"}
                  onChange={(e) => handleNestedChange(index, "ADK_variant", e.target.value, interactionPath)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                >
                  {["CircularPolarization", "LinearPolarization"].map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              )}
              {index === 1 && (
                <textarea
                  value={JSON.stringify(model.BSI_extensions || ["EffectiveZ"])}
                  onChange={(e) => {
                    try {
                      const parsed = JSON.parse(e.target.value);
                      handleNestedChange(index, "BSI_extensions", parsed, interactionPath);
                    } catch {
                      console.warn(`renderInteraction: Invalid JSON array for ${modelPath}.BSI_extensions:`, e.target.value);
                    }
                  }}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                />
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmissionStatus('Submitting...');

    // Validate form fields
    const errors = {};
    Object.entries(schema.properties).forEach(([key, fieldSchema]) => {
      const value = getNestedValue(values, key);
      const error = validateField(key, value, fieldSchema);
      if (error) errors[key] = error;
    });
    if (!simulationName) errors.simulationName = 'Simulation name is required';
    if (!baseDirectory) errors.baseDirectory = 'Output directory is required';

    if (Object.keys(errors).length > 0) {
      setErrorMessages(errors);
      setSubmissionStatus('Please fix form errors before submitting.');
      return;
    }

    try {
      //const response = await axios.post('http://localhost:8000/submit-job', {
      const response = await axios.post('/api/submit-job', {
        formData: values,
        baseDirectory,
        simulationName,
      });
      setSubmissionStatus(`JSON file saved! Path: ${response.data.file_path}`);
    } catch (error) {
      setSubmissionStatus(`Error: ${error.response?.data?.detail || error.message}`);
    }
  };  

  if (!schema || !schema.properties || !schema.properties.numberCells) {
    console.error("PICMIInputForm: Invalid root schema, missing properties or numberCells", schema);
    return <div className="text-red-500">Error: Invalid schema configuration</div>;
  }
  console.log("PICMIInputForm: Root schema validated, numberCells present:", schema.properties.numberCells);

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
            placeholder="e.g., src/components/outputs"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            required
          />
          {errorMessages.baseDirectory && <span className="text-red-500 text-sm">{errorMessages.baseDirectory}</span>}
        </div>
        <div>
          <label className="block text-sm font-medium">Simulation Name:</label>
          <input
            type="text"
            value={simulationName}
            onChange={(e) => setSimulationName(e.target.value)}
            placeholder="e.g., lwfa-rdf"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            required
          />
          {errorMessages.simulationName && <span className="text-red-500 text-sm">{errorMessages.simulationName}</span>}
        </div>
        {renderFields(schema)}
        <button
          type="submit"
          className="mt-4 bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600"
        >
          Submit
        </button>
      </form>
      {submissionStatus && <p className="mt-4 text-sm">{submissionStatus}</p>}
    </div>
  );

};

export default PICMIInputForm;