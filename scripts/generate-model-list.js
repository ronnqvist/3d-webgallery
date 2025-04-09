import fs from 'fs';
import path from 'path';

const modelsDir = path.join('public', '3d-models');
const outputFile = path.join('src', '3d-model-list.json');
const prefix = '3d-models/'; // Prefix to add to each filename in the JSON

try {
  // Read the contents of the models directory
  const files = fs.readdirSync(modelsDir);

  // Filter for .glb files and format them for the JSON output
  const glbFiles = files
    .filter(file => path.extname(file).toLowerCase() === '.glb')
    .map(file => `${prefix}${file}`); // Add the prefix

  // Create the JSON string
  const jsonContent = JSON.stringify(glbFiles, null, 2); // Pretty print JSON

  // Write the JSON string to the output file
  fs.writeFileSync(outputFile, jsonContent);

  console.log(`Successfully generated ${outputFile} with ${glbFiles.length} models.`);

} catch (err) {
  // Handle errors, e.g., directory not found
  if (err.code === 'ENOENT') {
    console.warn(`Warning: Directory ${modelsDir} not found. Creating empty ${outputFile}.`);
    // Create an empty list if the directory doesn't exist
    fs.writeFileSync(outputFile, '[]');
  } else {
    console.error(`Error generating model list: ${err}`);
    process.exit(1); // Exit with error code
  }
}
