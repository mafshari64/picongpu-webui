import React, { useState, useEffect } from "react";


const PICMIInputForm = () => {
  // State for common parameters
  const [numberCells, setNumberCells] = useState("[192, 2048, 192]");
  const [cellSize, setCellSize] = useState("[0.1772e-6, 0.4430e-7, 0.1772e-6]");

  // State for Grid block parameters
  const [picongpuNGpus, setPicongpuNGpus] = useState("[2, 4, 1]");
  const [lowerBound, setLowerBound] = useState([0, 0, 0]);
  const [lowerBoundaryConditions, setLowerBoundaryConditions] = useState(["open", "open", "open"]); // Store as array
  const [upperBoundaryConditions, setUpperBoundaryConditions] = useState(["open", "open", "open"]); // Store as array
  const [gridUpperBound, setGridUpperBound] = useState(null); // Derived upper_bound

  // State for Electromagnetic Solver block parameters
  const [solverMethod, setSolverMethod] = useState('"Yee"');

  // State for storing grid configuration
  const [grid, setGrid] = useState(null); // Add state for grid configuration

    // Error state
    const [errors, setErrors] = useState({});
  
  // Validation function
  const validateArray = (value, type) => {
    try {
      const parsed = JSON.parse(value); // Parse the string into an array
      if (!Array.isArray(parsed)) return false; // Ensure it's an array
  
      if (type === "integer") {
        return parsed.every((item) => Number.isInteger(item)); // Check if every element is an integer
      }
      if (type === "real") {
        return parsed.every((item) => typeof item === "number"); // Real numbers include integers and floats
      }
      if (type === "string") {
        return parsed.every((item) => typeof item === "string");
      }
      return false;
    } catch (error) {
      return false; // Invalid JSON or non-array format
    }
  };

// Generic handle change function with validation
const handleInputChange = (e, setValue, expectedType, fieldName, setErrors) => {
  const inputValue = e.target.value;
  let errorMessage = "";

  // Handle empty input
  if (inputValue.trim() === "") {
    setValue(inputValue); // Allow empty input
    setErrors((prevErrors) => ({ ...prevErrors, [fieldName]: "" }));
    return;
  }

  // Validate array input
  if (!validateArray(inputValue, expectedType)) {
    errorMessage = `Invalid format: Expected an array of ${expectedType}s.`;
  }

  // Set value and errors
  if (!errorMessage) {
    setValue(inputValue);
  }
  setErrors((prevErrors) => ({ ...prevErrors, [fieldName]: errorMessage }));
};



  // Derived values calculation
  useEffect(() => {
    if (
      validateArray(numberCells, "integer") &&
      validateArray(cellSize, "real") &&
      validateArray(picongpuNGpus, "integer") &&
      validateArray(lowerBound, "real") &&
      validateArray(lowerBoundaryConditions, "string") &&
      validateArray(upperBoundaryConditions, "string")
    ) {
      try {
        const parsedNumberCells = JSON.parse(numberCells);
        const parsedCellSize = JSON.parse(cellSize);
  
        // Calculate upper_bound dynamically
        const upperBound = parsedNumberCells.map((n, i) => n * parsedCellSize[i]);
  
        // Set the grid configuration
        const gridConfig = {
          picongpu_n_gpus: JSON.parse(picongpuNGpus),
          number_of_cells: parsedNumberCells,
          lower_bound: JSON.parse(lowerBound),
          upper_bound: upperBound,
          lower_boundary_conditions: JSON.parse(lowerBoundaryConditions),
          upper_boundary_conditions: JSON.parse(upperBoundaryConditions),
        };
  
        setGrid(gridConfig);
        setGridUpperBound(upperBound); // Store `upper_bound`
      } catch (error) {
        console.error("Error in computing grid configuration:", error);
      }
    }
  },
  [numberCells, cellSize, picongpuNGpus, lowerBound, lowerBoundaryConditions,
    upperBoundaryConditions,]);

  
  const handleSubmit = (e) => {
    e.preventDefault();

    if (Object.values(errors).some((error) => error !== null)) {
      alert("Please correct the errors in the form before submitting.");
      return;
    }

    console.log("Common Parameters:");
    console.log("  numberCells:", JSON.parse(numberCells));
    console.log("  cellSize:", JSON.parse(cellSize));

    console.log("\nGrid Block:");
    console.log("  picongpu_n_gpus:", JSON.parse(picongpuNGpus));
    console.log("  number_of_cells:", JSON.parse(numberCells));
    console.log("  lower_bound:", JSON.parse(lowerBound));
    console.log("  upper_bound:", gridUpperBound);
    console.log("  lower_boundary_conditions:", JSON.parse(lowerBoundaryConditions)); // Display as string
    console.log("  upper_boundary_conditions:", JSON.parse(upperBoundaryConditions)); // Display as string

    console.log("\nElectromagnetic Solver:");
    console.log("  method:", solverMethod);
    console.log("  grid:", grid);  

    alert("Configuration logged in the console!");
      // Check if there are any errors
  const hasErrors = Object.values(errors).some((error) => error !== "");
  if (hasErrors) {
    alert("Please fix the errors before submitting.");
    return;
  }
  // Proceed with form submission logic
  console.log("Form submitted successfully!");

  };

  return (
    <form onSubmit={handleSubmit} style={{ fontFamily: "Arial, sans-serif" }}>
      <h1>PICMI Input Form</h1>

      {/* Section: Common Parameters */}
      <fieldset>
        <legend><strong>1. Common Parameters</strong></legend>
        <label>
        numberCells:
          <input
            type="text"
            value={numberCells}
            onChange={(e) => handleInputChange(e, setNumberCells, "number", "numberCells", setErrors)}
            style={{ marginLeft: "10px", width: "300px" }}
          />
          {errors.numberCells && <span style={{ color: "red" }}>{errors.numberCells}</span>}

        </label>
        <br />
        <label>
          Cell Size:
          <input
            type="text"
            value={cellSize}
            onChange={(e) => handleInputChange(e, setCellSize, "number", "cellSize", setErrors)}
            style={{ marginLeft: "48px", width: "300px" }}
          />
          {errors.cellSize && <span style={{ color: "red" }}>{errors.cellSize}</span>}

        </label>
      </fieldset>





      {/* Section: Grid Block */}
      <fieldset style={{ marginTop: "20px" }}>
        <legend><strong>2. Grid Block</strong></legend>
        <label>
          picongpu_n_gpus:
          <input
            type="text"
            value={picongpuNGpus}
            onChange={(e) => handleInputChange(e, setPicongpuNGpus, "number", "picongpuNGpus")}
            style={{ marginLeft: "10px", width: "300px" }}
          />
        </label>
        {errors.picongpuNGpus && <p style={{ color: "red", marginTop: "5px"  }}>{errors.picongpuNGpus}</p>}
        <br />
        <label>
  Number of Cells:
  <input
    type="text"
    value={numberCells}
    onChange={(e) =>
      handleInputChange(e, setNumberCells, "integer", "numberCells", setErrors)
    }
    style={{ marginLeft: "10px", width: "300px" }}
  />
</label>
{errors.numberCells && <p style={{ color: "red" }}>{errors.numberCells}</p>}
        <br />
        <label>
          Lower Bound:
          <input
            type="text"
            value={JSON.stringify(lowerBound)} // Show as stringified array
            onChange={(e) => {
              const input = e.target.value;
              try {
                const parsed = JSON.parse(input); // Parse input into an array
                if (Array.isArray(parsed) && parsed.every((item) => typeof item === "real")) {
                  setLowerBound(parsed); // Update state
                  setErrors((prev) => ({ ...prev, lowerBound: "" }));
                } else {
                  throw new Error("Invalid format");
                }
              } catch {
                setErrors((prev) => ({
                  ...prev,
                  lowerBound: "Invalid format: Expected an array of real numbers.",
                }));
              }
            }}
            style={{ marginLeft: "10px", width: "300px" }}
          />
        </label>
        {errors.lowerBound && <p style={{ color: "red" }}>{errors.lowerBound}</p>}
        <br />
        <label>
        Upper Bound:
          <input
            type="text"
            value={gridUpperBound ? gridUpperBound.join(", ") : "Invalid input"}
            readOnly
            style={{ marginLeft: "10px", width: "300px", backgroundColor: "#f0f0f0" }}
         />
        </label>
        <br />
        <label>
  Lower Boundary Conditions:
  <input
    type="text"
    value={JSON.stringify(lowerBoundaryConditions)} // Show as stringified array
    onChange={(e) => {
      const input = e.target.value;
      try {
        const parsed = JSON.parse(input); // Parse input into an array
        if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
          setLowerBoundaryConditions(parsed); // Update state
          setErrors((prev) => ({ ...prev, lowerBoundaryConditions: "" }));
        } else {
          throw new Error("Invalid format");
        }
      } catch {
        setErrors((prev) => ({
          ...prev,
          lowerBoundaryConditions: "Invalid format: Expected an array of strings.",
        }));
      }
    }}
    style={{ marginLeft: "10px", width: "300px" }}
  />
</label>
{errors.lowerBoundaryConditions && <p style={{ color: "red" }}>{errors.lowerBoundaryConditions}</p>}
        <br />
      <label>
    Upper Boundary Conditions:
  <input
    type="text"
    value={JSON.stringify(upperBoundaryConditions)} // Show as stringified array
    onChange={(e) => {
      const input = e.target.value;
      try {
        const parsed = JSON.parse(input); // Parse input into an array
        if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
          setUpperBoundaryConditions(parsed); // Update state
          setErrors((prev) => ({ ...prev, upperBoundaryConditions: "" }));
        } else {
          throw new Error("Invalid format");
        }
      } catch {
        setErrors((prev) => ({
          ...prev,
          upperBoundaryConditions: "Invalid format: Expected an array of strings.",
        }));
      }
    }}
    style={{ marginLeft: "10px", width: "300px" }}
  />
</label>
{errors.upperBoundaryConditions && <p style={{ color: "red" }}>{errors.upperBoundaryConditions}</p>}
</fieldset>

      {/* Section: Electromagnetic Solver Block */}
      <fieldset>
        <legend><strong>3. Electromagnetic Solver Block</strong></legend>
        <label>
          Solver Method:
          <input
            type="text"
            value={solverMethod}
            onChange={(e) => handleInputChange(e, setSolverMethod, "string", "solverMethod")}
            style={{ marginLeft: "10px", width: "300px" }}
          />
        </label>
        {errors.solverMethod && <p style={{ color: "red" }}>{errors.solverMethod}</p>}
        <br />
        <label>
          Grid Block Reference:
          {grid ? (
            <input
              type="text"
              value={`grid: ${JSON.stringify(grid)}`}  // Displaying the grid block configuration
              readOnly
              style={{ marginLeft: "10px", width: "300px", backgroundColor: "#f0f0f0" }}
            />
          ) : (
            <input
              type="text"
              value="Grid not defined yet"
              readOnly
              style={{ marginLeft: "10px", width: "300px", backgroundColor: "#f0f0f0" }}
            />
          )}
        </label>
      </fieldset>

      {/* Submit Button */}
      <button type="submit" style={{ marginTop: "20px", padding: "10px 20px" }}>
        Submit Configuration
      </button>
    </form>
  );
};

export default PICMIInputForm;
