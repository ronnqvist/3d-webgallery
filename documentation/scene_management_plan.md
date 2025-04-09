# Scene Layout Plan (Static Build Focus)

This document outlines the plan for defining and applying a specific scene layout (object positions and orientations) for the 3D Web Gallery project, intended for static deployment. This approach focuses on setting the layout during local development and "baking" it into the production build.

## 1. Introduction & Goal

### Revised Goal
Enable users to arrange objects within the VR gallery *during local development* (`npm run dev`), capture this specific layout into a project file, and then generate a static build (`npm run build`) where objects consistently load in those pre-defined positions and orientations. The deployed static site will always show this "baked-in" layout, simplifying the deployed application by removing runtime save/load features.

### Relation to Agent Workflow
This layout process is separate from the AI agent workflow (`documentation/agent_workflow.md`) used to add *new* models to the `public/3d-models/` directory. After an agent adds a model, the typical process would be:
1. Run `npm run dev`.
2. Enter VR and arrange the scene, including the new model.
3. Use the "Save Layout to Build File" feature (described below).
4. Run `npm run build` to create the deployable static site with the new layout.

## 2. Local Development & Layout Workflow

### Arrangement
1.  **Start Dev Server:** Run `npm run dev`.
2.  **Enter VR:** Access the gallery via the development URL.
3.  **Position Objects:** Use VR controllers to grab and arrange the models loaded from `public/3d-models/` into the desired final layout.

### Capture Layout ("Save Layout to Build File")
1.  **Trigger:** Implement a "Save Layout to Build File" button or interaction accessible only within the VR experience *during development* (e.g., attached to a controller menu, perhaps only visible if `import.meta.env.DEV` is true).
2.  **Data Collection:** When triggered:
    *   Create an empty object, e.g., `layoutData = {}`.
    *   Iterate through the `visualMeshes` array (or use `physicsMap`). Ensure you can retrieve the original model path associated with each mesh/body (e.g., from `mesh.userData.filePath` set during loading).
    *   Get the current world `position` (Vector3) and `quaternion` (Quaternion) of each `THREE.Object3D` (visual mesh).
    *   Store this data:
        ```javascript
        // Assuming 'modelPath' is retrieved for the current 'mesh'
        layoutData[modelPath] = {
          position: { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z },
          quaternion: { x: mesh.quaternion.x, y: mesh.quaternion.y, z: mesh.quaternion.z, w: mesh.quaternion.w }
        };
        ```
3.  **File Saving:**
    *   Format the collected data into the final JSON structure:
        ```javascript
        const sceneLayoutFileContent = JSON.stringify({ sceneLayout: layoutData }, null, 2); // Pretty-print JSON
        ```
    *   **Mechanism:** Provide a way to save this `sceneLayoutFileContent` string to `src/scene-layout.json`. Options:
        *   **Agent Interaction:** If using an agent with write permissions (like Roo Code in 'Code' mode), the agent can use the `write_to_file` tool with the path `src/scene-layout.json` and the generated JSON string. The VR button might trigger a console log of the JSON string for the agent to copy.
        *   **Manual User Action:** Log the `sceneLayoutFileContent` string to the browser's developer console. Instruct the user (via console log or VR feedback) to copy this string and manually paste it into a file named `src/scene-layout.json` in their project.
4.  **Feedback:** Provide confirmation that the layout data has been generated (and logged/sent to agent).

### Loading the Layout (Dev & Prod)
1.  **Modify `src/main.ts`:** Update the initialization logic.
2.  **Import Layout Data:** Attempt to import the layout file. Vite handles JSON imports directly.
    ```typescript
    import sceneLayoutData from '../src/scene-layout.json?raw'; // Import as raw string initially
    let savedLayout = null;
    if (sceneLayoutData) {
        try {
            savedLayout = JSON.parse(sceneLayoutData).sceneLayout;
        } catch (e) {
            console.warn("Could not parse src/scene-layout.json:", e);
        }
    }
    ```
    *Alternatively, if direct JSON import works reliably with Vite's build:*
    ```typescript
    // import sceneLayoutFromFile from '../src/scene-layout.json'; // Might need "?json" or assertion
    // const savedLayout = sceneLayoutFromFile?.sceneLayout;
    ```
3.  **Apply Layout:** *After* the initial model loading loop (where models are placed based on `src/3d-model-list.json`):
    *   If `savedLayout` exists:
        *   Iterate through the loaded `visualMeshes` (or `physicsMap`).
        *   Retrieve the `modelPath` for each mesh.
        *   If `savedLayout[modelPath]` exists:
            *   Get the physics `body`.
            *   Apply the saved `position` and `quaternion` to both the `mesh` and the `body`.
            *   Reset physics velocities and call `body.wakeUp()`.
    *   If `savedLayout` does *not* exist, the default initial positions are used.

## 3. Production Build Workflow

1.  **Save Layout:** Perform the "Capture Layout" steps during a local development session to create/update `src/scene-layout.json`.
2.  **Build:** Run `npm run build`.
3.  **Vite Bundling:** Vite will process the `import` statement for `src/scene-layout.json` in `src/main.ts`. The JSON data will be included directly within the bundled production JavaScript file(s) in the `dist` directory.
4.  **Deploy:** Deploy the contents of the `dist` directory. The deployed static site will now automatically load models into the positions defined in the baked-in layout data.

## 4. Implementation Details & Considerations

*   **File:** Modifications primarily target `src/main.ts`.
*   **Model Identification:** A robust method is needed to link loaded meshes/bodies back to their file paths (e.g., `mesh.userData.filePath = modelPath` during loading).
*   **Physics Update:** Crucial to update both mesh and body transforms and call `body.wakeUp()`.
*   **Save Mechanism Choice:** Decide between agent-based saving (requires write mode) or manual user copy-paste. The manual method is simpler and doesn't require mode switching.
*   **Development-Only UI:** The "Save Layout" button should ideally only be added/visible when `import.meta.env.DEV` is true.
*   **.gitignore:** Add `src/scene-layout.json` to `.gitignore` if layouts are considered user-specific and not part of the core repository state. *Alternatively*, commit a default `scene-layout.json` if desired. (Decision needed).
