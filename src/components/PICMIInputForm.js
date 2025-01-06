import React, { useState, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { setSchema, selectSchema } from "../redux/schemaSlice";

const PICMIInputForm = () => {
  const schema = useSelector(selectSchema);
  const dispatch = useDispatch();

  const [values, setValues] = useState({});
  const [errorMessages, setErrorMessages] = useState({});
  const [calculatedValues, setCalculatedValues] = useState({});

  useEffect(() => {
    // Fetch schema
    fetch("/picmi_schema.json")
      .then((response) => response.json())
      .then((data) => {
        dispatch(setSchema(data));
      });
  }, [dispatch]);

  useEffect(() => {
    if (schema && schema.properties) {
      const initializeValues = (schema) => {
        const initialValues = {};
        Object.keys(schema.properties).forEach((key) => {
          const field = schema.properties[key];
          if (field.type === "object") {
            initialValues[key] = initializeValues(field);
          } else {
            initialValues[key] = "";
          }
        });
        return initialValues;
      };

      setValues(initializeValues(schema));
    }
  }, [schema]);

  // Dynamically calculate dependent fields like upperBound
  useEffect(() => {
    if (values.numberCells && values.cellSize) {
      try {
        const numberCells = JSON.parse(values.numberCells);
        const cellSize = JSON.parse(values.cellSize);

        if (Array.isArray(numberCells) && Array.isArray(cellSize)) {
          const upperBound = numberCells.map((n, i) => n * cellSize[i]);
          setCalculatedValues((prev) => ({
            ...prev,
            upperBound,
          }));
        }
      } catch {
        setCalculatedValues((prev) => ({
          ...prev,
          upperBound: [],
        }));
      }
    }
  }, [values.numberCells, values.cellSize]);

  const generateExampleArray = (fieldSchema) => {
    if (fieldSchema.type === "array" && fieldSchema.items) {
      if (fieldSchema.items.type === "integer") {
        return "[1, 2, 3]";
      }
      if (fieldSchema.items.type === "string" && fieldSchema.items.enum) {
        return JSON.stringify(fieldSchema.items.enum.slice(0, 3)); // Example using the first few enums
      }
      if (fieldSchema.items.type === "number") {
        return "[1.1, 2.2, 3.3]";
      }
      return "[value1, value2, value3]";
    }
    return "[value1, value2, value3]";
  };
  
  const generatePlaceholder = (fieldName, fieldSchema) => {
    if (fieldSchema.type === "array") {
      const itemType = fieldSchema.items?.type || "any";
      const minItems = fieldSchema.minItems || 0;
      const maxItems = fieldSchema.maxItems || "unlimited";
      const example = generateExampleArray(fieldSchema);
  
      return `Enter an array of ${itemType}s [${minItems} to ${maxItems} items]. Example: ${example}`;
    }
  
    if (fieldSchema.type === "boolean") {
      return "Enter true or false. Example: true";
    }
  
    if (fieldSchema.type === "number") {
      if (fieldSchema.exclusiveMinimum) {
        return `Enter a number greater than ${fieldSchema.exclusiveMinimum}. Example: 1.5`;
      }
      return "Enter a number. Example: 3.14";
    }
  
    if (fieldSchema.type === "integer") {
      return "Enter an integer. Example: 42";
    }
  
    if (fieldSchema.type === "string") {
      if (fieldSchema.enum) {
        return `Choose one of: ${fieldSchema.enum.join(", ")}. Example: ${fieldSchema.enum[0]}`;
      }
      return "Enter a string. Example: Hello";
    }
  
    return `Enter a value for ${fieldName}`;
  };
  

  const validateField = (fieldName, value, fieldSchema) => {
    if (!value) return "This field is required.";
  
    if (fieldSchema.type === "array") {
      try {
        const parsed = JSON.parse(value);
        if (!Array.isArray(parsed)) return "Input must be an array.";
  
        // Validate array length
        if (fieldSchema.minItems && parsed.length < fieldSchema.minItems) {
          return `Array must have at least ${fieldSchema.minItems} items.`;
        }
        if (fieldSchema.maxItems && parsed.length > fieldSchema.maxItems) {
          return `Array must have no more than ${fieldSchema.maxItems} items.`;
        }
  
        // Validate each array item
        if (fieldSchema.items) {
          for (const item of parsed) {
            if (fieldSchema.items.type === "integer" && (!Number.isInteger(item) || item < (fieldSchema.items.minimum || Number.MIN_SAFE_INTEGER))) {
              return `Array items must be integers${fieldSchema.items.minimum ? ` greater than or equal to ${fieldSchema.items.minimum}` : ""}.`;
            }
            if (fieldSchema.items.type === "string" && typeof item !== "string") {
              return `Array items must be strings.`;
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
  
    // Other types
    if (fieldSchema.type === "boolean" && value !== "true" && value !== "false") {
      return "Enter true or false.";
    }
  
    if ((fieldSchema.type === "number" || fieldSchema.type === "integer") && isNaN(value)) {
      return `Enter a valid ${fieldSchema.type}.`;
    }
  
    if (fieldSchema.type === "string") {
      if (fieldSchema.enum && !fieldSchema.enum.includes(value)) {
        return `Value must be one of: ${fieldSchema.enum.join(", ")}.`;
      }
    }
  
    return null;
  };
  
  

  const handleChange = (fieldName, value, fieldSchema, parentKey = "") => {
    const newValues = { ...values };
    const fieldKey = parentKey ? `${parentKey}.${fieldName}` : fieldName;

    const setNestedValue = (obj, path, newValue) => {
      const parts = path.split(".");
      const lastKey = parts.pop();
      const nestedObj = parts.reduce((acc, key) => acc[key], obj);
      nestedObj[lastKey] = newValue;
    };

    setNestedValue(newValues, fieldKey, value);
    setValues(newValues);

    const error = validateField(fieldKey, value, fieldSchema);
    setErrorMessages((prevErrors) => ({
      ...prevErrors,
      [fieldKey]: error,
    }));
  };

  const renderFields = (schema, parentKey = "") => {
    return Object.entries(schema.properties).map(([fieldName, fieldSchema]) => {
      const fieldKey = parentKey ? `${parentKey}.${fieldName}` : fieldName;

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
          <label htmlFor={fieldKey}>
            {fieldSchema.title || fieldName}:
          </label>
          <input
            type="text"
            id={fieldKey}
            name={fieldKey}
            value={values[fieldName]}
            onChange={(e) => handleChange(fieldName, e.target.value, fieldSchema, parentKey)}
            placeholder={generatePlaceholder(fieldName, fieldSchema)}
          />
          {fieldKey === "upperBound" && calculatedValues.upperBound && (
            <div className="calculated-value">
              Calculated Value: {JSON.stringify(calculatedValues.upperBound)}
            </div>
          )}
          {errorMessages[fieldKey] && (
            <span className="error">{errorMessages[fieldKey]}</span>
          )}
        </div>
      );
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log("Submitted values:", { ...values, ...calculatedValues });
  };

  if (!schema) {
    return <div>Loading...</div>;
  }

  return (
    <form onSubmit={handleSubmit}>
      <h2>PICMI Input Form</h2>
      {renderFields(schema)}
      <button type="submit">Submit</button>
    </form>
  );
};

export default PICMIInputForm;
