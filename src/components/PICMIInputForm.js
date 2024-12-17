import React, { useState, useEffect } from "react";

const PICMIInputForm = () => {
  // State for common parameters
  const [numberCells, setNumberCells] = useState("[192, 2048, 192]");
  const [cellSize, setCellSize] = useState("[0.1772e-6, 0.4430e-7, 0.1772e-6]");

  // State for Grid block parameters
  const [picongpuNGpus, setPicongpuNGpus] = useState("[2, 4, 1]");
  const [lowerBound, setLowerBound] = useState("[0, 0, 0]");
  const [lowerBoundaryConditions, setLowerBoundaryConditions] = useState(['"open", "open", "open"']); // Store as array
  const [upperBoundaryConditions, setUpperBoundaryConditions] = useState(['"open", "open", "open"']); // Store as array
  const [gridUpperBound, setGridUpperBound] = useState(null); // Derived upper_bound

  // State for Electromagnetic Solver block parameters
  const [solverMethod, setSolverMethod] = useState('"Yee"');

  // State for storing grid configuration
  const [grid, setGrid] = useState(null); // Add state for grid configuration

  // Derived values calculation
  useEffect(() => {
    if (
      numberCells &&
      cellSize &&
      picongpuNGpus &&
      lowerBound &&
      lowerBoundaryConditions &&
      upperBoundaryConditions
    ) {
      // Compute the upper_bound dynamically based on numberCells and cellSize
      const upperBound = JSON.parse(numberCells).map((n, i) => n * JSON.parse(cellSize)[i]);

      // Create the grid block configuration
      const gridConfig = {
        picongpu_n_gpus: JSON.parse(picongpuNGpus),
        number_of_cells: JSON.parse(numberCells),
        lower_bound: JSON.parse(lowerBound),
        upper_bound: upperBound,
        lower_boundary_conditions: lowerBoundaryConditions, // Array of 3 values
        upper_boundary_conditions: upperBoundaryConditions, // Array of 3 values
      };

      // Set the grid configuration
      setGrid(gridConfig);
      setGridUpperBound(upperBound); // Set upper_bound as well
    }
  }, [
    numberCells,
    cellSize,
    picongpuNGpus,
    lowerBound,
    lowerBoundaryConditions,
    upperBoundaryConditions,
  ]);

  const handleSubmit = (e) => {
    e.preventDefault();

    console.log("Common Parameters:");
    console.log("  numberCells:", JSON.parse(numberCells));
    console.log("  cellSize:", JSON.parse(cellSize));

    console.log("\nGrid Block:");
    console.log("  picongpu_n_gpus:", JSON.parse(picongpuNGpus));
    console.log("  number_of_cells:", JSON.parse(numberCells));
    console.log("  lower_bound:", JSON.parse(lowerBound));
    console.log("  upper_bound:", gridUpperBound);
    console.log("  lower_boundary_conditions:", JSON.stringify(lowerBoundaryConditions)); // Display as string
    console.log("  upper_boundary_conditions:", JSON.stringify(upperBoundaryConditions)); // Display as string

    console.log("\nElectromagnetic Solver:");
    console.log("  method:", solverMethod);
    console.log("  grid:", grid); // Grid is now defined here

    alert("Configuration logged in the console!");
  };

  return (
    <form onSubmit={handleSubmit} style={{ fontFamily: "Arial, sans-serif" }}>
      <h1>PICMI Input Form</h1>

      {/* Section: Common Parameters */}
      <fieldset>
        <legend><strong>1. Common Parameters</strong></legend>
        <label>
          Number of Cells:
          <input
            type="text"
            value={numberCells}
            onChange={(e) => setNumberCells(e.target.value)}
            style={{ marginLeft: "10px", width: "300px" }}
          />
        </label>
        <br />
        <label>
          Cell Size:
          <input
            type="text"
            value={cellSize}
            onChange={(e) => setCellSize(e.target.value)}
            style={{ marginLeft: "48px", width: "300px" }}
          />
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
            onChange={(e) => setPicongpuNGpus(e.target.value)}
            style={{ marginLeft: "10px", width: "300px" }}
          />
        </label>
        <br />
        <label>
          Number of Cells:
          <input
            type="text"
            value={numberCells}
            readOnly
            style={{ marginLeft: "30px", width: "300px", backgroundColor: "#f0f0f0" }}
          />
        </label>
        <br />
        <label>
          Lower Bound:
          <input
            type="text"
            value={lowerBound}
            onChange={(e) => setLowerBound(e.target.value)}
            style={{ marginLeft: "32px", width: "300px" }}
          />
        </label>
        <br />
        <label>
          Derived Upper Bound:
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
            value={lowerBoundaryConditions.join(", ")} // Join the array as string for display
            onChange={(e) => setLowerBoundaryConditions(e.target.value.split(", "))}
            style={{ marginLeft: "10px", width: "300px" }}
          />
        </label>
        <br />
        <label>
          Upper Boundary Conditions:
          <input
            type="text"
            value={upperBoundaryConditions.join(", ")} // Join the array as string for display
            onChange={(e) => setUpperBoundaryConditions(e.target.value.split(", "))}
            style={{ marginLeft: "10px", width: "300px" }}
          />
        </label>
      </fieldset>

      {/* Section: Electromagnetic Solver Block */}
      <fieldset>
        <legend><strong>3. Electromagnetic Solver Block</strong></legend>
        <label>
          Solver Method:
          <input
            type="text"
            value={solverMethod}
            onChange={(e) => setSolverMethod(e.target.value)}
            style={{ marginLeft: "10px", width: "300px" }}
          />
        </label>
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
