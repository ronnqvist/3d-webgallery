# Scene Management Plan

This document outlines the plan for implementing scene saving and loading functionality within the 3D Web Gallery project, starting with a simple client-side solution and outlining future backend possibilities.

## 1. Introduction & Goals

### Overall Vision
The long-term vision is to transform the gallery into a customizable VR space where users can:
*   Select which 3D models they want to include in their scene.
*   Arrange these models freely within the VR environment.
*   Define properties for objects (e.g., static vs. dynamic).
*   Save their customized scene layout persistently.
*   Load previously saved scenes.
*   Potentially share scenes with others.
*   Enable a streamlined workflow for AI agents to add new models directly to the available pool without requiring manual project updates or server restarts.

### Phase 1 Goal (Current Scope)
Implement basic scene persistence using **Browser Local Storage**. This phase focuses on allowing a user to save and reload the **positions and orientations** of the models currently loaded from the `public/3d-models/` directory. This provides a simple way to retain a custom arrangement within a single browser.

### Future Vision (Out of Scope for Phase 1)
Future phases could introduce:
*   A web UI for selecting models before entering VR.
*   Object properties (e.g., `isStatic` flag to disable grabbing/physics, potentially linked to an "Edit Mode").
*   A backend system (database or MCP server) for persistent, shareable scenes and user accounts.
*   Integration with the agent workflow (`agent_workflow.md`) via a backend endpoint, allowing agents to add models dynamically without needing project file access or server restarts.

## 2. Phase 1 Implementation Plan (Local Storage)

This phase focuses on saving/loading the transform (position and orientation) of existing models loaded from `src/3d-model-list.json`.

### Data Structure (Local Storage)
A JSON object will be stored in `localStorage` under a key like `webGallerySceneLayout`.

*   **Key:** `webGallerySceneLayout`
*   **Value (JSON String):**
    ```json
    {
      "sceneLayout": {
        "<model_path_1>": {
          "position": { "x": number, "y": number, "z": number },
          "quaternion": { "x": number, "y": number, "z": number, "w": number }
        },
        "<model_path_2>": {
          "position": { "x": number, "y": number, "z": number },
          "quaternion": { "x": number, "y": number, "z": number, "w": number }
        }
        // ... etc for all models currently in the scene
      }
    }
    ```
    *   `<model_path>` will be the unique identifier for the model, likely its relative path loaded from `src/3d-model-list.json` (e.g., `public/3d-models/sauna-ladle-gemini.glb`). This identifier needs to be reliably associated with the `THREE.Object3D` (mesh) and `CANNON.Body` during the initial model loading process.

### Save Logic
1.  **Trigger:** Add a "Save Layout" button or interaction accessible within the VR experience (e.g., attached to a controller or a static UI element).
2.  **Data Collection:** When triggered:
    *   Create an empty object, e.g., `layoutData = {}`.
    *   Iterate through the `visualMeshes` array (or use the `physicsMap` keys/values). **Crucially, ensure you can retrieve the original model path associated with each mesh/body.** This might involve storing the path in the `userData` of the mesh or using a reverse lookup map during the initial loading.
    *   Get the current world `position` (Vector3) and `quaternion` (Quaternion) of the `THREE.Object3D` (visual mesh).
    *   Store this data in the `layoutData` object:
        ```javascript
        // Assuming 'modelPath' is retrieved for the current 'mesh'
        layoutData[modelPath] = {
          position: { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z },
          quaternion: { x: mesh.quaternion.x, y: mesh.quaternion.y, z: mesh.quaternion.z, w: mesh.quaternion.w }
        };
        ```
3.  **Storage:** Convert the `layoutData` object into a JSON string and save it:
    ```javascript
    const sceneData = { sceneLayout: layoutData };
    localStorage.setItem('webGallerySceneLayout', JSON.stringify(sceneData));
    ```
4.  **Feedback:** Provide visual/audio feedback to the user confirming the save.

### Load Logic
1.  **Trigger:** This should happen automatically during application initialization in `src/main.ts`, specifically *after* the default models have been loaded from `src/3d-model-list.json` and positioned initially, but *before* the animation loop potentially modifies them further.
2.  **Data Retrieval:**
    ```javascript
    const savedDataString = localStorage.getItem('webGallerySceneLayout');
    if (savedDataString) {
      try {
        const savedData = JSON.parse(savedDataString);
        const savedLayout = savedData.sceneLayout;
        // Proceed to apply layout...
      } catch (e) {
        console.error("Error parsing saved scene layout:", e);
      }
    }
    ```
3.  **Applying Layout:**
    *   Iterate through the loaded `visualMeshes` (or use `physicsMap`).
    *   For each `mesh`, retrieve its associated model path identifier.
    *   Look up this path in the `savedLayout` object.
    *   If an entry exists (`savedLayout[modelPath]`):
        *   Get the corresponding physics `body` using the `physicsMap`.
        *   Apply the saved position and quaternion:
            ```javascript
            const savedTransform = savedLayout[modelPath];
            // Apply to visual mesh
            mesh.position.set(savedTransform.position.x, savedTransform.position.y, savedTransform.position.z);
            mesh.quaternion.set(savedTransform.quaternion.x, savedTransform.quaternion.y, savedTransform.quaternion.z, savedTransform.quaternion.w);

            // Apply to physics body
            if (body) {
              body.position.set(savedTransform.position.x, savedTransform.position.y, savedTransform.position.z);
              body.quaternion.set(savedTransform.quaternion.x, savedTransform.quaternion.y, savedTransform.quaternion.z, savedTransform.quaternion.w);
              // IMPORTANT: Reset velocities and wake up the body
              body.velocity.setZero();
              body.angularVelocity.setZero();
              body.wakeUp(); // Ensures physics engine recognizes the change
            }
            ```

### UI Elements
*   Add VR-interactive elements (e.g., simple buttons attached to a controller menu or placed statically in the scene) for:
    *   "Save Layout"
    *   (Optional) "Load Last Saved Layout" (if automatic loading isn't desired)
    *   (Optional) "Reset Layout" (to revert to default positions)

## 3. Future Considerations (Brief Outline)

*   **Backend Storage:** For persistent, shareable scenes, a backend is needed. Options include:
    *   **File-Based:** Simple Node.js server saving/loading scene JSON files.
    *   **Database:** More robust (e.g., MongoDB storing scene documents).
    *   **MCP Server (`scene-mcp`):** Ideal for agent interaction. Provides tools (`saveScene`, `loadScene`, `listScenes`, `listAvailableModels`, `addModel`) and encapsulates storage.
*   **Agent Workflow Integration:** A backend `addModel` endpoint/tool would allow agents using `blender-mcp` to add models dynamically without needing project file access or server restarts, simplifying the process in `agent_workflow.md`. The frontend would fetch the model list from the backend/MCP instead of `src/3d-model-list.json`.
*   **Advanced Features:** A backend enables user accounts, scene sharing, a web UI for model selection before entering VR, and defining object properties (`isStatic`, interaction types) stored within the scene data.

## 4. Phase 1 Implementation Notes

*   **File:** Modifications primarily target `src/main.ts`.
*   **Model Identification:** Ensure a reliable way to link loaded meshes/bodies back to their original file paths from `src/3d-model-list.json` (e.g., using `mesh.userData.filePath`).
*   **Physics Update:** Remember to update *both* the Three.js mesh and the Cannon-es body transforms and call `body.wakeUp()` when loading a layout.
*   **Timing:** Apply the loaded layout after initial model placement but before the user can interact significantly.
