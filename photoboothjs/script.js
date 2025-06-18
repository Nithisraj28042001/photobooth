import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const scene = new THREE.Scene();
const container = document.querySelector('.container');
const camera = new THREE.PerspectiveCamera(75, container.clientWidth/container.clientHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('avatar-canvas'), alpha: true });
renderer.setSize(container.clientWidth, container.clientHeight);

// Handle window resize
window.addEventListener('resize', () => {
  const width = container.clientWidth;
  const height = container.clientHeight;
  
  // Update camera
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  
  // Update renderer
  renderer.setSize(width, height);
});

// Light
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const light = new THREE.DirectionalLight(0xffffff, 0.8);
light.position.set(1, 1, 1);
scene.add(light);

let headBone = null;
let leftShoulderBone = null;
let rightShoulderBone = null;
let leftArmBone = null;
let rightArmBone = null;
let leftForearmBone = null;
let rightForearmBone = null;
let leftHandBone = null;
let rightHandBone = null;

// Load GLB model
const loader = new GLTFLoader();
loader.load('models/demo.glb', (gltf) => {
  const model = gltf.scene;
  model.scale.set(1.5, 1.5, 1.5);
  model.position.set(0, -1.5, 0);
  scene.add(model);

  // Find the bones
  model.traverse((obj) => {
    if (obj.isBone) {
      const boneName = obj.name.toLowerCase();
      if (boneName.includes('head')) {
        headBone = obj;
        console.log("Found head bone:", obj.name);
      } else if (boneName.includes('shoulderl') || boneName.includes('shoulder_l')) {
        leftShoulderBone = obj;
        console.log("Found left shoulder bone:", obj.name);
      } else if (boneName.includes('shoulderr') || boneName.includes('shoulder_r')) {
        rightShoulderBone = obj;
        console.log("Found right shoulder bone:", obj.name);
      } else if (boneName.includes('upperarml') || boneName.includes('upper_arm_l') || boneName.includes('arml')) {
        leftArmBone = obj;
        console.log("Found left arm bone:", obj.name);
      } else if (boneName.includes('upperarmr') || boneName.includes('upper_arm_r') || boneName.includes('armr')) {
        rightArmBone = obj;
        console.log("Found right arm bone:", obj.name);
      } else if (boneName.includes('forearml') || boneName.includes('lower_arm_l')) {
        leftForearmBone = obj;
        console.log("Found left forearm bone:", obj.name);
      } else if (boneName.includes('forearmr') || boneName.includes('lower_arm_r')) {
        rightForearmBone = obj;
        console.log("Found right forearm bone:", obj.name);
      } else if (boneName.includes('handl') || boneName.includes('hand_l')) {
        leftHandBone = obj;
        console.log("Found left hand bone:", obj.name);
      } else if (boneName.includes('handr') || boneName.includes('hand_r')) {
        rightHandBone = obj;
        console.log("Found right hand bone:", obj.name);
      }
    }
  });

}, undefined, (err) => {
  console.error('Error loading model:', err);
});

// Camera position
camera.position.z = 3;

// Helper function to convert degrees to radians
function degToRad(degrees) {
  return degrees * (Math.PI / 180);
}

// Listen for head pose updates
window.addEventListener('headPoseUpdate', (event) => {
  if (headBone) {
    const { x, y, z } = event.detail;
    console.log('Head pose update:', event.detail);
    headBone.rotation.x = -degToRad(x);
    headBone.rotation.y = -degToRad(y);
    headBone.rotation.z = -degToRad(z);
  }
});

// Listen for shoulder pose updates
window.addEventListener('shoulderPoseUpdate', (event) => {
  const { left, right } = event.detail;
  console.log('Shoulder pose update:', event.detail);
  
  if (leftShoulderBone) {
    // Apply shoulder rotation - adjust axis and multiplier as needed
    leftShoulderBone.rotation.y = degToRad(left * 2);
  }
  
  if (rightShoulderBone) {
    rightShoulderBone.rotation.y = degToRad(right * 2);
  }
});

// Listen for arm pose updates
window.addEventListener('armPoseUpdate', (event) => {
  const { left, right } = event.detail;
  console.log('Arm pose update:', event.detail);
  
  if (leftArmBone) {
    // Apply arm rotations (Pitch, Yaw, Roll)
    leftArmBone.rotation.x = degToRad(left.x);
    leftArmBone.rotation.y = degToRad(left.y);
    leftArmBone.rotation.z = degToRad(left.z);
  }
  
  if (rightArmBone) {
    rightArmBone.rotation.x = degToRad(right.x);
    rightArmBone.rotation.y = degToRad(right.y);
    rightArmBone.rotation.z = degToRad(right.z);
  }
});

// Listen for forearm pose updates
window.addEventListener('forearmPoseUpdate', (event) => {
  const { left, right } = event.detail;
  console.log('Forearm pose update:', event.detail);
  
  if (leftForearmBone) {
    leftForearmBone.rotation.x = -degToRad(left.x);
    leftForearmBone.rotation.y = degToRad(left.y);
    leftForearmBone.rotation.z = degToRad(left.z);
  }
  
  if (rightForearmBone) {
    rightForearmBone.rotation.x = -degToRad(right.x);
    rightForearmBone.rotation.y = degToRad(right.y);
    rightForearmBone.rotation.z = degToRad(right.z);
  }
});

// Listen for hand pose updates (if available)
window.addEventListener('handPoseUpdate', (event) => {
  const { left, right } = event.detail;
  console.log('Hand pose update:', event.detail);
  
  if (leftHandBone) {
    // Apply hand rotations
    leftHandBone.rotation.x = degToRad(left.x);
    leftHandBone.rotation.y = degToRad(left.y);
    leftHandBone.rotation.z = degToRad(left.z);
  }
  
  if (rightHandBone) {
    rightHandBone.rotation.x = degToRad(right.x);
    rightHandBone.rotation.y = degToRad(right.y);
    rightHandBone.rotation.z = degToRad(right.z);
  }
});

// Animate
function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}
animate();

// Webcam access
const video = document.getElementById('webcam');
navigator.mediaDevices.getUserMedia({ video: true }).then((stream) => {
  video.srcObject = stream;
}).catch((err) => {
  console.error("Webcam error:", err);
});
