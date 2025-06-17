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

// Load GLB model
const loader = new GLTFLoader();
loader.load('models/demo.glb', (gltf) => {
  const model = gltf.scene;
  model.scale.set(1.5, 1.5, 1.5);
  model.position.set(0, -1.5, 0);
  scene.add(model);

  // Find the head bone
  model.traverse((obj) => {
    if (obj.isBone && obj.name.toLowerCase().includes('head')) {
      headBone = obj;
      console.log("Found head bone:", obj.name);
    }
  });

}, undefined, (err) => {
  console.error('Error loading model:', err);
});

// Camera position
camera.position.z = 3;

// Listen for head pose updates
window.addEventListener('headPoseUpdate', (event) => {
  if (headBone) {
    const { x, y, z } = event.detail;
    
    // Apply rotations to the head bone
    // Note: You might need to adjust these multipliers based on your model's scale
    headBone.rotation.x = -x;  // Pitch
    headBone.rotation.y = -y  ;  // Yaw
    headBone.rotation.z = -z ;  // Roll
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
