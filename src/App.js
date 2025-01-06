import React, { useState, useEffect } from "react";
import PICMIInputForm from "./components/PICMIInputForm.js"; // Import your form component
import './App.css'; // Make sure the styles are applied

function App() {
  const [schema, setSchema] = useState(null); // State to hold schema

  // Fetch schema data on component mount
  useEffect(() => {
    fetch('picmi_schema.json') // 
      .then((response) => response.json())
      .then((data) => setSchema(data))
      .catch((error) => console.error('Error loading schema:', error));
  }, []);

  if (!schema) {
    return <div>Loading...</div>; // Show loading state until schema is fetched
  }

  return (
    <div className="App">
      {/* Header with logos */}
      <div className="header">
        <img src="react-logo.jpg" alt="React Logo" className="logo-left" />
        <img src="casus-logo.jpg" alt="PICoNGPU Logo" className="logo-right" />
      </div>

      {/* New logo added below CASUS logo */}
      <div className="picongpu-logo-container">
        <img src="picongpu-logo.jpg" alt="PIConGPU Logo" className="picongpu-logo" />
      </div>
      
      {/* Main content */}
      <PICMIInputForm schema={schema} /> {/* Pass schema as a prop */}

      {/* Footer */}
      <div className="footer">
        <p>This website is designed by Masoud Afshari (m.afshari@hzdr.de)</p>
      </div>
    </div>
  );
}

export default App;



// default app.js provided by npm start:

/* 
import logo from './logo.svg';
import './App.css';

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <img src={logo} className="App-logo" alt="logo" />
        <p>
          Edit <code>src/App.js</code> and save to reload.
        </p>
        <a
          className="App-link"
          href="https://reactjs.org"
          target="_blank"
          rel="noopener noreferrer"
        >
          Learn React
        </a>
      </header>
    </div>
  );
}

export default App;
*/