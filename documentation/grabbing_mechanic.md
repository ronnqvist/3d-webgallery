# 3D Web Gallery: Object Grabbing Mechanic

This document details the implementation of the VR object grabbing mechanic for the 3D Web Gallery project, using Three.js for rendering and Cannon-es for physics, focusing on raycaster-based interaction suitable for controllers like those on the Meta Quest.

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

// Array holding references to the top-level THREE.Object3D of grabbable objects
// (In the actual implementation, this is populated dynamically during model loading)
const visualMeshes: THREE.Object3D[] = [ladleGroup];

// Map to link visual object UUIDs to their physics bodies
// (Populated during model loading)
const physicsMap = new Map<string, CANNON.Body>();
physicsMap.set(ladleGroup.uuid, ladleBody); // Example mapping

// State variables using Maps for multi-controller support
// Key: Controller (THREE.Group), Value: Grabbed object/body info or state
const grabbedObjects = new Map<THREE.Group, { object: THREE.Object3D, body: CANNON.Body }>();
const controllerLastPosition = new Map<THREE.Group, THREE.Vector3>();
const controllerVelocity = new Map<THREE.Group, THREE.Vector3>();

const clock = new THREE.Clock(); // For delta time in velocity calc
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

    // Check for intersections ONLY with objects in the visualMeshes array
    // The 'true' argument makes the check recursive (checks children of groups)
    return raycaster.intersectObjects(visualMeshes, true);
}
```

## 4. Grabbing Logic (`onSelectStart`)

This function is triggered when the `selectstart` event fires on a controller.

```typescript
function onSelectStart(this: THREE.Group) { // 'this' refers to the controller
    const controller = this;

    // Prevent grabbing if controller already holds an object
    if (grabbedObjects.has(controller)) {
        return;
    }
    // Add check for teleport aiming if needed:
    // if (controller === controller1 && isTeleportAiming) return;

    const intersections = getIntersections(controller);

    if (intersections.length > 0) {
        let intersectedObject = intersections[0].object;

        // Find the top-level grabbable object and its physics body using physicsMap
        let targetObject: THREE.Object3D | null = null;
        let targetBody: CANNON.Body | null = null;

        while (intersectedObject) {
            targetBody = physicsMap.get(intersectedObject.uuid) ?? null;
            if (targetBody) {
                // Find the corresponding visual mesh in our main array
                targetObject = visualMeshes.find(mesh => mesh.uuid === intersectedObject.uuid || mesh.children.some(child => child.uuid === intersectedObject.uuid)) ?? null;
                 if (targetObject) break; // Found the body and the top-level visual object
            }
            if (!intersectedObject.parent) break;
            intersectedObject = intersectedObject.parent;
        }

        // Check if another controller is already holding this body
        let alreadyHeld = false;
        for (const [, grabbed] of grabbedObjects) { // Iterate through Map values
            if (grabbed.body === targetBody) {
                alreadyHeld = true;
                break;
            }
        }

        if (targetObject && targetBody && !alreadyHeld) {
            // Store grabbed state for this controller using Maps
            grabbedObjects.set(controller, { object: targetObject, body: targetBody });

            // Physics: Make kinematic
            targetBody.type = CANNON.Body.KINEMATIC;
            targetBody.velocity.setZero();
            targetBody.angularVelocity.setZero();

            // Visual: Attach to controller
            controller.attach(targetObject);

            // Store initial position for velocity calculation using Maps
            controllerLastPosition.set(controller, controller.position.clone());
            controllerVelocity.set(controller, new THREE.Vector3()); // Initialize velocity Map entry
        }
    }
}
```

## 5. Dropping/Throwing Logic (`onSelectEnd`)

This function is triggered when the `selectend` event fires on a controller.

```typescript
function onSelectEnd(this: THREE.Group) { // 'this' is the controller
    const controller = this;
    const grabbed = grabbedObjects.get(controller); // Get state for this controller

    if (grabbed) {
        const { object: grabbedObject, body: grabbedBody } = grabbed;

        // --- Visual Detachment ---
        scene.attach(grabbedObject); // Preserves world transform

        // --- Physics Integration: Dynamic Switch & Velocity ---
        grabbedBody.type = CANNON.Body.DYNAMIC;
        grabbedBody.wakeUp();

        // Apply controller velocity for throwing (retrieve from Map)
        const velocity = controllerVelocity.get(controller);
        if (velocity) {
            grabbedBody.velocity.copy(velocity as unknown as CANNON.Vec3);
        }

        // --- Reset State for this controller ---
        grabbedObjects.delete(controller);
        controllerLastPosition.delete(controller);
        controllerVelocity.delete(controller);
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
    // Iterate through all physics bodies and their corresponding visual meshes
    for (let i = 0; i < physicsBodies.length; i++) {
        const body = physicsBodies[i];
        const mesh = visualMeshes[i]; // Assumes visualMeshes[i] corresponds to physicsBodies[i]

        // Check if this body is currently held by ANY controller
        let isHeld = false;
        for (const [, grabbed] of grabbedObjects) { // Iterate Map values
            if (grabbed.body === body) {
                isHeld = true;
                break;
            }
        }

        // Only sync if the body is dynamic/sleeping AND not currently held
        if (!isHeld && body.type !== CANNON.Body.KINEMATIC) {
            mesh.position.copy(body.position as unknown as THREE.Vector3);
            mesh.quaternion.copy(body.quaternion as unknown as THREE.Quaternion);
        }
    }

    // --- Controller Velocity & Kinematic Sync (When Grabbed) ---
    // Iterate through the controllers that are currently grabbing objects
    grabbedObjects.forEach((grabbed, controller) => {
        const { body: grabbedBody } = grabbed;
        const lastPos = controllerLastPosition.get(controller);
        const currentVel = controllerVelocity.get(controller);

        if (lastPos && currentVel) {
            // Calculate velocity for this controller
            currentVel.copy(controller.position).sub(lastPos).divideScalar(deltaTime);
            lastPos.copy(controller.position); // Update last position for this controller

            // Sync kinematic body to controller world transform
            if (grabbedBody.type === CANNON.Body.KINEMATIC) {
                const worldPos = new THREE.Vector3();
                const worldQuat = new THREE.Quaternion();
                controller.getWorldPosition(worldPos); // Use controller's transform
                controller.getWorldQuaternion(worldQuat);

                grabbedBody.position.copy(worldPos as unknown as CANNON.Vec3);
                grabbedBody.quaternion.copy(worldQuat as unknown as CANNON.Quaternion);
            }
        }
    });

    // --- Rendering ---
    renderer.render(scene, camera);
}

// Start the loop
renderer.setAnimationLoop(animate);
```

## Summary

This implementation provides a robust way to handle grabbing, moving, and throwing objects independently with two controllers in WebXR, using raycasting and integrating with Cannon-es. Key aspects are the state management using `Map`s keyed by the controller (`grabbedObjects`, `controllerLastPosition`, `controllerVelocity`), the use of a `physicsMap` for efficient object/body lookup, the physics body type switching (`KINEMATIC`/`DYNAMIC`), and the synchronization logic within the animation loop that correctly handles multiple controllers and held objects.
