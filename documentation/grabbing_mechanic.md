# WebXR Object Grabbing with Three.js and Cannon-es

This document details the implementation of a VR object grabbing mechanic using Three.js for rendering and Cannon-es for physics, focusing on raycaster-based interaction suitable for controllers like those on the Meta Quest.

## Core Concepts

The fundamental approach involves:

1.  **Raycasting:** Projecting a ray forward from the VR controller.
2.  **Intersection Detection:** Checking if this ray intersects with designated "grabbable" objects in the scene.
3.  **Controller Events:** Using the `selectstart` (button press) and `selectend` (button release) events from the WebXR controller API.
4.  **Object Attachment:** Attaching the visual representation (Three.js `Group` or `Mesh`) of the grabbed object to the controller's Three.js object.
5.  **Physics Integration:**
    *   Switching the corresponding physics body (Cannon-es `Body`) to `KINEMATIC` while grabbed, so it follows the controller without being affected by physics forces directly.
    *   Switching the physics body back to `DYNAMIC` upon release, applying the controller's velocity at the moment of release to simulate throwing.
    *   Synchronizing the visual object's transform with the physics body's transform when the object is not held.

## 1. Setup

### Dependencies

Ensure you have `three` and `cannon-es` installed:

```bash
npm install three @types/three cannon-es
```

### Initial Variables and Physics Setup

```typescript
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory.js';

// Physics World
const physicsWorld = new CANNON.World({
    gravity: new CANNON.Vec3(0, -9.82, 0),
});
const timeStep = 1 / 60;

// Physics Materials (Example for ladle)
const ladleMaterialCannon = new CANNON.Material('ladle');
// Define contact materials as needed...

// Scene
const scene = new THREE.Scene();

// --- Grabbable Object Example (Ladle) ---
// Visual (Three.js)
const ladleGroup = new THREE.Group();
// ... add handle, bowl meshes to ladleGroup ...
scene.add(ladleGroup);

// Physics Body (Cannon-es)
const ladleShape = new CANNON.Box(new CANNON.Vec3(0.4, 0.05, 0.1)); // Use appropriate shape
const ladleBody = new CANNON.Body({
    mass: 0.5,
    shape: ladleShape,
    material: ladleMaterialCannon,
    position: new CANNON.Vec3(ladleGroup.position.x, ladleGroup.position.y, ladleGroup.position.z),
});
physicsWorld.addBody(ladleBody);
// --- End Grabbable Object Example ---

// Array to hold references to the top-level THREE.Group/Mesh of grabbable objects
const grabbableObjects = [ladleGroup];

// State variables
let grabbedObject: THREE.Group | null = null; // Currently held Three.js object
let grabbedBody: CANNON.Body | null = null;   // Currently held Cannon-es body
let activeController: THREE.Group | null = null; // Controller holding the object
const controllerLastPosition = new THREE.Vector3(); // For velocity calculation
const controllerVelocity = new THREE.Vector3();     // Calculated controller velocity
const clock = new THREE.Clock();                   // For delta time in velocity calc
```

## 2. Controller Setup

Get controller references from the Three.js WebXRManager and add visual models.

```typescript
// Renderer setup (assuming 'renderer' is your WebGLRenderer)
renderer.xr.enabled = true;

// VR Controllers Setup
const controller1 = renderer.xr.getController(0);
scene.add(controller1);

const controller2 = renderer.xr.getController(1);
scene.add(controller2);

const controllerModelFactory = new XRControllerModelFactory();

// Controller Grip Models (visual representation)
const controllerGrip1 = renderer.xr.getControllerGrip(0);
controllerGrip1.add(controllerModelFactory.createControllerModel(controllerGrip1));
scene.add(controllerGrip1);

const controllerGrip2 = renderer.xr.getControllerGrip(1);
controllerGrip2.add(controllerModelFactory.createControllerModel(controllerGrip2));
scene.add(controllerGrip2);

// Add event listeners for interaction
controller1.addEventListener('selectstart', onSelectStart);
controller1.addEventListener('selectend', onSelectEnd);
controller2.addEventListener('selectstart', onSelectStart);
controller2.addEventListener('selectend', onSelectEnd);
```

## 3. Raycasting

Set up a raycaster to detect intersections originating from the controller.

```typescript
// Raycaster for interaction
const raycaster = new THREE.Raycaster();
const tempMatrix = new THREE.Matrix4(); // Reusable matrix to avoid allocations

function getIntersections(controller: THREE.Group) {
    // Use the controller's world matrix to set the ray's origin and direction
    tempMatrix.identity().extractRotation(controller.matrixWorld);

    raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    // Point the ray forward (-Z) in the controller's local space
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

    // Check for intersections ONLY with objects in the grabbableObjects array
    // The 'true' argument makes the check recursive (checks children of groups)
    return raycaster.intersectObjects(grabbableObjects, true);
}
```

## 4. Grabbing Logic (`onSelectStart`)

This function is triggered when the `selectstart` event fires on a controller.

```typescript
function onSelectStart(this: THREE.Group) {
    // 'this' refers to the controller that dispatched the event
    activeController = this;
    const intersections = getIntersections(activeController);

    if (intersections.length > 0) {
        // The raycaster might hit a child mesh (e.g., the ladle's handle).
        // We need to traverse up the scene graph to find the main Group
        // that is listed in our `grabbableObjects` array.
        let intersectedObject = intersections[0].object;
        while (intersectedObject.parent && !grabbableObjects.includes(intersectedObject as THREE.Group)) {
             // Check if the current object itself is the grabbable one before going to parent
             if (grabbableObjects.includes(intersectedObject as THREE.Group)) break;
             intersectedObject = intersectedObject.parent;
        }

        // Check if the found top-level object is indeed in our list
        if (grabbableObjects.includes(intersectedObject as THREE.Group)) {
            grabbedObject = intersectedObject as THREE.Group;
            // IMPORTANT: Associate the visual object with its physics body.
            // This example assumes only the ladle is grabbable. For multiple
            // objects, you'd need a way to map grabbedObject to its body
            // (e.g., using userData, a Map, or naming conventions).
            grabbedBody = ladleBody;

            // --- Physics Integration: Kinematic Switch ---
            // Make the physics body kinematic. It will now ignore physics forces
            // (like gravity) and its transform will be manually set based on
            // the controller's movement in the animate loop.
            grabbedBody.type = CANNON.Body.KINEMATIC;
            grabbedBody.velocity.set(0, 0, 0);         // Reset velocity
            grabbedBody.angularVelocity.set(0, 0, 0); // Reset angular velocity

            // --- Visual Attachment ---
            // Attach the Three.js object to the controller's Three.js object.
            // This makes the visual object follow the controller automatically.
            activeController.attach(grabbedObject);

            // Store controller position for velocity calculation on release
            controllerLastPosition.copy(activeController.position);
        }
    }
}
```

## 5. Dropping/Throwing Logic (`onSelectEnd`)

This function is triggered when the `selectend` event fires.

```typescript
function onSelectEnd() {
    // Only proceed if an object is currently grabbed by a controller
    if (grabbedObject && activeController && grabbedBody) {

        // --- Visual Detachment ---
        // Detach the object from the controller and add it back to the main scene.
        // Its world transform is preserved during this operation.
        scene.attach(grabbedObject);

        // --- Physics Integration: Dynamic Switch & Velocity ---
        // Make the physics body dynamic again so it responds to gravity, collisions, etc.
        grabbedBody.type = CANNON.Body.DYNAMIC;
        grabbedBody.wakeUp(); // Ensure the body is active in the simulation

        // Apply the calculated controller velocity to the physics body
        // to simulate throwing the object.
        grabbedBody.velocity.copy(controllerVelocity as unknown as CANNON.Vec3);
        // Optional: Could also apply angular velocity if desired

        // --- Reset State ---
        grabbedObject = null;
        grabbedBody = null;
        activeController = null;
    }
}
```

## 6. Animation Loop (`animate`) Synchronization

The `animate` function runs every frame and handles the synchronization between the controller, visual objects, and physics bodies.

```typescript
function animate() {
    const deltaTime = clock.getDelta(); // Time since last frame

    // --- Physics Update ---
    physicsWorld.step(timeStep, deltaTime); // Advance the physics simulation

    // --- Sync Physics to Visual (When NOT Grabbed) ---
    // If the ladle is not currently grabbed, update its visual position
    // and rotation to match its physics body's state.
    if (ladleBody && !grabbedObject) {
        ladleGroup.position.copy(ladleBody.position as unknown as THREE.Vector3);
        ladleGroup.quaternion.copy(ladleBody.quaternion as unknown as THREE.Quaternion);
    }

    // --- Controller Velocity & Kinematic Sync (When Grabbed) ---
    if (activeController && grabbedObject) {
        // Calculate controller's velocity since the last frame
        controllerVelocity.subVectors(activeController.position, controllerLastPosition).divideScalar(deltaTime);
        controllerLastPosition.copy(activeController.position); // Update last position

        // If the grabbed object's physics body is kinematic,
        // manually update its position and rotation to exactly match the
        // controller's world transform. This ensures the physics body
        // follows the controller precisely while grabbed.
        if (grabbedBody && grabbedBody.type === CANNON.Body.KINEMATIC) {
            const worldPos = new THREE.Vector3();
            const worldQuat = new THREE.Quaternion();
            activeController.getWorldPosition(worldPos);
            activeController.getWorldQuaternion(worldQuat);

            grabbedBody.position.copy(worldPos as unknown as CANNON.Vec3);
            grabbedBody.quaternion.copy(worldQuat as unknown as CANNON.Quaternion);
        }
    } else {
        // Reset velocity if nothing is grabbed
        controllerVelocity.set(0, 0, 0);
    }

    // --- Rendering ---
    renderer.render(scene, camera);
}

// Start the loop
renderer.setAnimationLoop(animate);
```

## Summary

This implementation provides a robust way to handle grabbing, moving, and throwing objects in WebXR using raycasting and integrating with a physics engine like Cannon-es. Key aspects are the state management (`grabbedObject`, `grabbedBody`, `activeController`), the physics body type switching (`KINEMATIC`/`DYNAMIC`), and the synchronization logic within the animation loop. Remember to adapt the object mapping between visual (`THREE.Group`) and physics (`CANNON.Body`) if you have multiple grabbable items.
