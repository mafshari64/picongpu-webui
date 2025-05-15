import React, { useState, useEffect } from "react";
import PICMIInputForm from "./components/PICMIInputForm.js";
import './App.css';

function App() {
  const [schema, setSchema] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/picmi_schema.json')
      .then((response) => {
        if (!response.ok) throw new Error('Failed to fetch schema');
        return response.json();
      })
      .then((data) => setSchema(data))
      .catch((error) => {
        console.error('Error loading schema:', error);
        setError('Failed to load schema. Please try again.');
      });
  }, []);

  if (error) return <div>{error}</div>;
  if (!schema) return <div>Loading...</div>;

  return (
    <div className="App">
      <div className="header">
        <img src="/react-logo.jpg" alt="React Logo" className="logo-left" />
        <img src="/casus-logo.jpg" alt="PICoNGPU Logo" className="logo-right" />
      </div>
      <div className="picongpu-logo-container">
        <img src="/picongpu-logo.jpg" alt="PIConGPU Logo" className="picongpu-logo" />
      </div>
      <PICMIInputForm schema={schema} />
      <div className="footer">
        <p>This website is designed by Masoud Afshari (m.afshari@hzdr.de)</p>
      </div>
    </div>
  );
}

export default App;