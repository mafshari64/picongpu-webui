// src/redux/schemaSlice.js
import { createSlice } from '@reduxjs/toolkit';

export const schemaSlice = createSlice({
  name: 'schema',
  initialState: {
    schemaData: null, // Initialize with null or empty object
  },
  reducers: {
    setSchema: (state, action) => {
      state.schemaData = action.payload; // Set the schema
    },
  },
});

export const { setSchema } = schemaSlice.actions;
export const selectSchema = (state) => state.schema.schemaData;
export default schemaSlice.reducer;
